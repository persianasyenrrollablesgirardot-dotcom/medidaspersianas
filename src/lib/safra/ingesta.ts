import type { PedidoSafra, ProductoSafra, ReporteSafra } from './tipos';
import { normalizarReporte } from './normalizar';

/**
 * Toda la logica de "meter un reporte de Safra en la base" vive aca y es PURA:
 * no toca red ni base de datos, solo recibe datos y devuelve que habria que
 * escribir. Asi la usan igual el importador manual y el procesado automatico,
 * y se puede probar sin levantar nada.
 *
 * POR QUE TANTA DEFENSA: el JSON lo genera Gemini, no un sistema. El mismo
 * pedido puede volver manana con un campo menos, o con un precio distinto
 * porque el modelo lo leyo diferente. Un upsert ingenuo pisaria un dato bueno
 * con uno malo sin que nadie se entere. De ahi las cuatro reglas:
 *
 *   1. La identidad es `pedido_id`. La factura es un dato del pedido.
 *   2. Nunca se borra: lo que ya esta guardado y no viene en el archivo, queda.
 *   3. Un campo vacio NO pisa un campo lleno.
 *   4. Un cambio en plata o en el numero de factura se guarda PERO queda
 *      anotado para que Jhon lo confirme. Nunca en silencio.
 */

/** Campos donde un cambio importa de verdad: hay plata o identidad en juego. */
const CAMPOS_SENSIBLES = ['factura_numero', 'factura_fecha', 'subtotal', 'iva', 'total'] as const;

export interface FilaPedido {
  pedido_id: string;
  referencia_personalizada: string | null;
  factura_numero: string | null;
  factura_fecha: string | null;
  forma_pago: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  visto_ultima_vez: string;
  datos: PedidoSafra;
}

export interface FilaProducto {
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
  extra: Record<string, unknown>;
}

export interface FilaCambio {
  pedido_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  archivo: string;
}

export interface Ingesta {
  pedidos: FilaPedido[];
  productos: FilaProducto[];
  cambios: FilaCambio[];
  resumen: { nuevos: number; actualizados: number; sinCambios: number; piezas: number };
}

/** Lo minimo que hace falta saber de un pedido ya guardado para comparar. */
export type PedidoGuardado = Partial<Omit<FilaPedido, 'datos'>> & { pedido_id: string };

const vacio = (v: unknown) => v === null || v === undefined || v === '';

/**
 * Regla 3: si el valor nuevo viene vacio y ya habia uno guardado, gana el
 * guardado. Gemini omitiendo un campo no puede borrarlo de la base.
 */
function conservar<T>(nuevo: T | null | undefined, guardado: T | null | undefined): T | null {
  if (vacio(nuevo) && !vacio(guardado)) return guardado as T;
  return (vacio(nuevo) ? null : nuevo) as T | null;
}

const texto = (v: unknown): string | null => (vacio(v) ? null : String(v));
const numero = (v: unknown): number | null => {
  if (vacio(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Los 11 campos que trae toda pieza; el resto va a `extra`. */
const COMUNES_PRODUCTO = new Set([
  'item', 'tipo', 'tela', 'cantidad', 'ancho_m', 'alto_m',
  'mando', 'coordinado', 'encajonada', 'ubicacion', 'precio_final',
]);

function aFilaProducto(pedidoId: string, prod: ProductoSafra): FilaProducto {
  const extra: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(prod)) {
    if (!COMUNES_PRODUCTO.has(clave) && !vacio(valor)) extra[clave] = valor;
  }
  return {
    pedido_id: pedidoId,
    item: Number(prod.item),
    tipo: texto(prod.tipo),
    tela: texto(prod.tela),
    cantidad: numero(prod.cantidad),
    ancho_m: numero(prod.ancho_m),
    alto_m: numero(prod.alto_m),
    mando: texto(prod.mando),
    coordinado: texto(prod.coordinado),
    encajonada: typeof prod.encajonada === 'boolean' ? prod.encajonada : null,
    ubicacion: texto(prod.ubicacion),
    precio_final: numero(prod.precio_final),
    extra,
  };
}

/**
 * Compara el reporte con lo que ya hay guardado y devuelve exactamente que
 * escribir. No decide nada de red: quien llama se encarga de mandarlo.
 *
 * `guardados` son los pedidos que la base ya tiene, indexados por `pedido_id`.
 * Los pedidos guardados que NO vengan en el reporte simplemente no aparecen en
 * el resultado — no se tocan y no se borran (regla 2).
 */
export function prepararIngesta(
  reporte: ReporteSafra,
  guardados: Map<string, PedidoGuardado>,
  archivo: string,
): Ingesta {
  const ahora = new Date().toISOString();
  const pedidos: FilaPedido[] = [];
  const productos: FilaProducto[] = [];
  const cambios: FilaCambio[] = [];
  let nuevos = 0, actualizados = 0, sinCambios = 0, piezas = 0;

  for (const pedido of reporte.pedidos || []) {
    const id = String(pedido.pedido_id || '').trim();
    if (!id) continue; // sin identidad no se guarda: seria imposible de deduplicar

    const previo = guardados.get(id);
    const f = pedido.facturacion || ({} as PedidoSafra['facturacion']);

    const fila: FilaPedido = {
      pedido_id: id,
      referencia_personalizada: conservar(texto(pedido.referencia_personalizada), previo?.referencia_personalizada),
      factura_numero: conservar(texto(f.factura_numero), previo?.factura_numero),
      factura_fecha: conservar(texto(f.fecha), previo?.factura_fecha),
      forma_pago: conservar(texto(f.forma_pago), previo?.forma_pago),
      subtotal: conservar(numero(f.subtotal), previo?.subtotal),
      iva: conservar(numero(f.iva), previo?.iva),
      total: conservar(numero(f.total), previo?.total),
      visto_ultima_vez: ahora,
      datos: pedido,
    };

    if (!previo) {
      nuevos += 1;
    } else {
      // Regla 4: un cambio en plata o en la factura se anota antes de guardarlo.
      const propios: FilaCambio[] = [];
      for (const campo of CAMPOS_SENSIBLES) {
        const antes = previo[campo];
        const despues = fila[campo];
        if (vacio(antes) || vacio(despues)) continue;
        if (String(antes) !== String(despues) && Number(antes) !== Number(despues)) {
          propios.push({
            pedido_id: id,
            campo,
            valor_anterior: String(antes),
            valor_nuevo: String(despues),
            archivo,
          });
        }
      }
      if (propios.length) { cambios.push(...propios); actualizados += 1; }
      else sinCambios += 1;
    }

    pedidos.push(fila);
    for (const prod of pedido.productos || []) {
      productos.push(aFilaProducto(id, prod));
      piezas += Number(prod.cantidad) || 1;
    }
  }

  return { pedidos, productos, cambios, resumen: { nuevos, actualizados, sinCambios, piezas } };
}

/**
 * Huella del contenido del archivo, para no procesar dos veces lo mismo.
 *
 * Es un FNV-1a a proposito: tiene que dar EXACTAMENTE lo mismo calculado en la
 * app (TypeScript) y en el script de Google Apps Script (JavaScript), asi que
 * no puede depender de crypto ni de librerias. Sirve para deduplicar, no para
 * seguridad.
 */
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + '-' + texto.length.toString(16);
}

/** Valida que lo que llego sea realmente un reporte de Safra antes de tocarlo. */
export function validarReporte(dato: unknown): { ok: true; reporte: ReporteSafra } | { ok: false; motivo: string } {
  if (!dato || typeof dato !== 'object') return { ok: false, motivo: 'El archivo no es un objeto JSON.' };

  /**
   * NO se exige la clave `pedidos`. La primera version si, y por eso el 8 y el 9 de
   * septiembre no entro nada: Gemini renombro esa clave (`novedades_dia_08_septiembre`,
   * `novedad_dia_09_septiembre`) y el archivo entero quedo descartado en silencio.
   *
   * Ahora se normaliza primero — los pedidos se buscan por FORMA, no por nombre — y recien
   * despues se valida lo unico que de verdad hace falta: que haya pedidos con id.
   */
  const reporte = normalizarReporte(dato);
  if (reporte.pedidos.length === 0) {
    return { ok: false, motivo: 'No encontre ningun pedido con `pedido_id` en el archivo.' };
  }
  return { ok: true, reporte };
}
