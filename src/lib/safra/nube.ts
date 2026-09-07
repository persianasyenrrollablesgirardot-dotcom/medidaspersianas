import { limpiarEnv } from '../env';
import type { ReporteSafra } from './tipos';
import type { Ingesta, PedidoGuardado } from './ingesta';

/**
 * Acceso a las tablas `safra_*` de Supabase.
 *
 * Va por PostgREST con `fetch` pelado, igual que `supabasePhotos.ts`, para no
 * sumar la libreria `supabase-js` al bundle (que ya pesa 4 MB) solo por cuatro
 * consultas.
 *
 * NADA aca borra. No hay una sola funcion de DELETE, y la base tampoco se lo
 * permite a la clave anonima (ver la migracion). "Nunca se pierde un pedido"
 * no depende de que este codigo se porte bien.
 */

const URL_BASE = limpiarEnv(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const CLAVE = limpiarEnv(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const hayNube = () => Boolean(URL_BASE && CLAVE);

function cabeceras(extra: Record<string, string> = {}) {
  return {
    apikey: CLAVE!,
    Authorization: `Bearer ${CLAVE}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function pedir(ruta: string, init?: RequestInit) {
  if (!hayNube()) throw new Error('Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  const respuesta = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...init,
    headers: cabeceras((init?.headers as Record<string, string>) || {}),
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    // 404 con este mensaje = las tablas todavia no se crearon en Supabase.
    if (respuesta.status === 404 && detalle.includes('does not exist')) {
      throw new Error('TABLAS_FALTAN');
    }
    throw new Error(`Supabase ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }
  return respuesta;
}

async function json<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await pedir(ruta, init);
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

// ── Archivo crudo ───────────────────────────────────────────────────────────

export interface ReporteGuardado {
  id: number;
  archivo: string;
  fecha_reporte: string | null;
  generado_en: string | null;
  hash: string;
  json_crudo: ReporteSafra;
  pedidos_en_archivo: number | null;
  subido_en: string;
  procesado_en: string | null;
}

/**
 * Guarda el archivo ENTERO antes de interpretarlo. Es lo primero que pasa
 * siempre: si despues la interpretacion falla, el original ya esta a salvo.
 *
 * Si el `hash` ya existe (mismo archivo, ya subido antes) la base lo rebota por
 * el unique y esto devuelve `{ duplicado: true }` en vez de reventar — es el
 * caso normal cuando se reimporta el mismo dia.
 */
export async function guardarReporteCrudo(
  archivo: string, reporte: ReporteSafra, hash: string,
): Promise<{ duplicado: boolean; id?: number }> {
  const fila = {
    archivo,
    fecha_reporte: reporte.fecha_reporte || null,
    generado_en: reporte.generado_en || null,
    hash,
    json_crudo: reporte,
    pedidos_en_archivo: (reporte.pedidos || []).length,
  };
  try {
    const creado = await json<ReporteGuardado[]>('safra_reportes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(fila),
    });
    return { duplicado: false, id: creado?.[0]?.id };
  } catch (e) {
    if (String(e).includes('duplicate key') || String(e).includes('23505')) return { duplicado: true };
    throw e;
  }
}

export const reportesSinProcesar = () =>
  json<ReporteGuardado[]>('safra_reportes?procesado_en=is.null&order=subido_en.asc&limit=30');

export const marcarProcesado = (id: number) =>
  pedir(`safra_reportes?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ procesado_en: new Date().toISOString() }),
  });

// ── Pedidos y piezas ────────────────────────────────────────────────────────

/** Lo ya guardado de esos pedidos, para poder comparar antes de pisar nada. */
export async function pedidosGuardados(ids: string[]): Promise<Map<string, PedidoGuardado>> {
  const mapa = new Map<string, PedidoGuardado>();
  if (!ids.length) return mapa;
  // De a tandas: una URL con 500 ids no entra en el limite de largo.
  for (let i = 0; i < ids.length; i += 100) {
    const tanda = ids.slice(i, i + 100).map(id => `"${id}"`).join(',');
    const filas = await json<PedidoGuardado[]>(
      `safra_pedidos?pedido_id=in.(${encodeURIComponent(tanda)})` +
      `&select=pedido_id,referencia_personalizada,factura_numero,factura_fecha,forma_pago,subtotal,iva,total`,
    );
    for (const fila of filas || []) mapa.set(fila.pedido_id, fila);
  }
  return mapa;
}

/**
 * Escribe la ingesta ya calculada. Todo por upsert (`merge-duplicates`): correr
 * esto dos veces con el mismo archivo deja la base igual, no duplica.
 *
 * `visto_primera_vez` NO se manda a proposito: al no venir en el cuerpo, el
 * upsert no la toca y el pedido conserva la fecha en que aparecio por primera
 * vez, aunque se reprocese mil veces.
 */
export async function escribirIngesta(ingesta: Ingesta) {
  const enTandas = async <T>(tabla: string, filas: T[], conflicto: string) => {
    for (let i = 0; i < filas.length; i += 200) {
      await pedir(`${tabla}?on_conflict=${conflicto}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(filas.slice(i, i + 200)),
      });
    }
  };

  // Primero los pedidos: las piezas apuntan a ellos por clave foranea.
  await enTandas('safra_pedidos', ingesta.pedidos, 'pedido_id');
  await enTandas('safra_productos', ingesta.productos, 'pedido_id,item');

  if (ingesta.cambios.length) {
    await pedir('safra_cambios', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(ingesta.cambios),
    });
  }
}

// ── Lectura para la pantalla ────────────────────────────────────────────────

export interface PedidoFila {
  pedido_id: string;
  referencia_personalizada: string | null;
  factura_numero: string | null;
  factura_fecha: string | null;
  forma_pago: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  visto_primera_vez: string;
  visto_ultima_vez: string;
}

export interface ProductoFila {
  pedido_id: string;
  item: number;
  tipo: string | null;
  tela: string | null;
  cantidad: number | null;
  ancho_m: number | null;
  alto_m: number | null;
  mando: string | null;
  coordinado: string | null;
  encajonada: boolean | null;
  ubicacion: string | null;
  precio_final: number | null;
  extra: Record<string, unknown> | null;
}

export interface CambioFila {
  id: number;
  pedido_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  detectado_en: string;
}

export const leerPedidos = () =>
  json<PedidoFila[]>('safra_pedidos?select=*&order=factura_fecha.desc,pedido_id.desc&limit=2000');

export const leerProductos = () =>
  json<ProductoFila[]>('safra_productos?select=*&order=pedido_id.asc,item.asc&limit=20000');

export const cambiosPendientes = () =>
  json<CambioFila[]>('safra_cambios?revisado=is.false&select=*&order=detectado_en.desc&limit=100');

export const marcarCambioRevisado = (id: number) =>
  pedir(`safra_cambios?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ revisado: true }) });

/**
 * El ultimo archivo crudo que llego. Sirve para seguir mostrando el aviso de
 * "el resumen del archivo no cuadra", que es una propiedad del ARCHIVO y no de
 * la base: en la base los totales ya estan recalculados y siempre cuadran.
 */
export const ultimoReporte = () =>
  json<ReporteGuardado[]>('safra_reportes?select=archivo,fecha_reporte,generado_en,json_crudo,subido_en&order=subido_en.desc&limit=1');
