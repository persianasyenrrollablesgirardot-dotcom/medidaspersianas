import type { PedidoSafra, ProductoSafra, ReporteSafra } from './tipos';

/**
 * ENCONTRAR LOS PEDIDOS SIN DEPENDER DE COMO SE LLAME LA CLAVE.
 *
 * El archivo lo genera Gemini, y el 8 de septiembre cambio la forma entera. El 9 la volvio a
 * cambiar:
 *
 *   07-sep   { pedidos: [ ...7 pedidos con todo el detalle... ] }
 *   08-sep   { novedades_dia_08_septiembre: { pedidos_recientes: [...] },
 *              pedidos_facturados_anteriores_septiembre: [...resumidos...] }
 *   09-sep   { novedad_dia_09_septiembre: { ...UN pedido... },
 *              pedidos_anteriores_septiembre: [...resumidos...] }
 *
 * La clave lleva el numero del dia adentro, asi que **cambia todos los dias**. Cualquier
 * parser que busque `pedidos` por nombre se rompe manana. Por eso esto no busca por NOMBRE
 * sino por FORMA: recorre el JSON entero y junta todo objeto que tenga un `pedido_id`.
 *
 * Es feo y es a proposito: del otro lado no hay un sistema, hay un modelo que reescribe la
 * estructura cuando le parece. Lo unico estable es que un pedido tiene un `pedido_id`.
 */

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Todo objeto con `pedido_id` que haya en el arbol, este donde este. */
function buscarPedidos(nodo: unknown, encontrados: Record<string, unknown>[] = [], prof = 0): Record<string, unknown>[] {
  if (prof > 8) return encontrados;
  if (Array.isArray(nodo)) {
    for (const hijo of nodo) buscarPedidos(hijo, encontrados, prof + 1);
    return encontrados;
  }
  if (!esObjeto(nodo)) return encontrados;

  if (typeof nodo.pedido_id === 'string' && nodo.pedido_id.trim() !== '') {
    encontrados.push(nodo);
    // No se sigue hacia adentro: los `productos` de un pedido no son pedidos.
    return encontrados;
  }
  for (const hijo of Object.values(nodo)) buscarPedidos(hijo, encontrados, prof + 1);
  return encontrados;
}

/** El primer valor que no venga vacio, mirando varias claves posibles. */
function primero(o: Record<string, unknown>, claves: string[]): unknown {
  for (const c of claves) {
    const v = o[c];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * `null` cuando el dato no vino. NUNCA 0.
 *
 * Devolver 0 fue un bug real: un pedido resumido (sin subtotal ni IVA) generaba
 * `subtotal: 0`, y como 0 no es "vacio", pisaba el subtotal bueno que ya estaba guardado.
 * En la simulacion de los tres dias reales, el resumen del 9 dejo en cero los subtotales de
 * los 7 pedidos del dia 7 y disparo 24 avisos de cambio falsos.
 */
const aNumero = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "2026-09-08T09:12:08-05:00" -> "2026-09-08". Una fecha con hora no entra en un `date`. */
const soloFecha = (v: unknown): string => {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
};

/**
 * La facturacion, venga anidada o suelta.
 *
 * El 07 venia en `facturacion: {...}`; desde el 08 los mismos datos estan sueltos en el
 * pedido. Y `factura_numero` puede no existir todavia: Safra la emite despues, y mientras
 * tanto Gemini escribe "Pendiente de emision por Safra" — eso NO es un numero de factura y
 * guardarlo como tal haria que un pedido facturado de verdad no se reconociera.
 */
function facturacionDe(p: Record<string, unknown>): PedidoSafra['facturacion'] {
  const f = esObjeto(p.facturacion) ? p.facturacion : {};
  const numero = String(primero(f, ['factura_numero']) ?? primero(p, ['factura_numero']) ?? '').trim();
  const pendiente = /pendiente/i.test(numero);
  return {
    factura_numero: pendiente ? '' : numero,
    fecha: soloFecha(primero(f, ['fecha']) ?? primero(p, ['fecha', 'fecha_generacion'])),
    forma_pago: String(primero(f, ['forma_pago']) ?? primero(p, ['forma_pago']) ?? '').trim(),
    subtotal: aNumero(primero(f, ['subtotal']) ?? primero(p, ['subtotal'])),
    iva: aNumero(primero(f, ['iva']) ?? primero(p, ['iva'])),
    total: aNumero(primero(f, ['total']) ?? primero(p, ['total'])),
  };
}

function productosDe(p: Record<string, unknown>): ProductoSafra[] {
  const lista = p.productos;
  if (!Array.isArray(lista)) return [];
  return lista
    .filter(esObjeto)
    .map((pr, i) => ({ ...pr, item: aNumero(pr.item) || i + 1 } as unknown as ProductoSafra));
}

/**
 * Deja el archivo con la forma que el resto de la app ya sabe leer, sin importar como venga.
 *
 * Los pedidos "resumidos" (los que Gemini manda sin detalle: solo id, fecha y total) entran
 * IGUAL. No se descartan: traen el total, y las defensas de la ingesta ya se encargan de que
 * un campo vacio no pise uno lleno. O sea, el resumen de hoy no borra el detalle de ayer.
 */
export function normalizarReporte(crudo: unknown): ReporteSafra {
  const raiz = esObjeto(crudo) ? crudo : {};
  const pedidos: PedidoSafra[] = buscarPedidos(raiz).map((p) => ({
    pedido_id: String(p.pedido_id).trim(),
    referencia_personalizada: String(primero(p, ['referencia_personalizada', 'resumen']) ?? '').trim(),
    facturacion: facturacionDe(p),
    productos: productosDe(p),
  }));

  // Si el mismo pedido aparece dos veces en el archivo (una en detalle y otra en el resumen),
  // gana el que trae productos: es el que mas sabe.
  const porId = new Map<string, PedidoSafra>();
  for (const p of pedidos) {
    const previo = porId.get(p.pedido_id);
    if (!previo || p.productos.length > previo.productos.length) porId.set(p.pedido_id, p);
  }

  // El resumen tambien cambio de nombre (`resumen_economico` -> `resumen_economico_acumulado_septiembre`).
  const claveResumen = Object.keys(raiz).find((k) => k.startsWith('resumen_economico'));
  const resumen = claveResumen && esObjeto(raiz[claveResumen])
    ? (raiz[claveResumen] as unknown as ReporteSafra['resumen_economico'])
    : (undefined as unknown as ReporteSafra['resumen_economico']);

  return {
    fecha_reporte: String(raiz.fecha_reporte ?? '').trim(),
    generado_en: String(raiz.generado_en ?? raiz.corte_hora ?? '').trim(),
    empresa_proveedor: String(raiz.empresa_proveedor ?? '').trim(),
    cliente: String(raiz.cliente ?? '').trim(),
    nit_cliente: String(raiz.nit_cliente ?? '').trim(),
    resumen_economico: resumen,
    pedidos: [...porId.values()],
  };
}
