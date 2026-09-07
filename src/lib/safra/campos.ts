import type { ProductoSafra, PedidoSafra, ReporteSafra } from './tipos';

/** Estos 11 campos vienen en TODA pieza, sea cual sea el sistema. */
const COMUNES = new Set([
  'item', 'tipo', 'tela', 'cantidad', 'ancho_m', 'alto_m',
  'mando', 'coordinado', 'encajonada', 'ubicacion', 'precio_final',
]);

/**
 * Etiquetas en castellano. Si Safra manda un campo que no esta en esta lista,
 * `etiqueta()` lo muestra igual con el nombre prolijeado — preferible a que un
 * dato de fabricacion desaparezca de la pantalla sin que nadie se entere.
 */
const ETIQUETAS: Record<string, string> = {
  cabezal: 'Cabezal',
  perfil: 'Perfil',
  enrollado: 'Enrollado',
  cover_light: 'Cover Light',
  apertura: 'Apertura',
  cantidad_lamas: 'Cantidad de lamas',
  pesa_lama: 'Pesa lama',
  altura_cordon: 'Altura del cordon',
  color_cordon: 'Color del cordon',
  posicion_telo_fijo: 'Posicion del telon fijo',
  cenefa: 'Cenefa',
  mando: 'Mando',
  coordinado: 'Coordinado',
  encajonada: 'Encajonada',
  ubicacion: 'Ubicacion',
  tela: 'Tela',
};

export function etiqueta(clave: string): string {
  if (ETIQUETAS[clave]) return ETIQUETAS[clave];
  const limpio = clave.replace(/_/g, ' ');
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

/**
 * Los campos PROPIOS del tipo de persiana de esta pieza, en el orden en que
 * vinieron. Una grilla fija de columnas quedaria medio vacia: una Enrollable
 * no tiene `cantidad_lamas` y una Vertical no tiene `cover_light`.
 */
export function camposPropios(producto: ProductoSafra): Array<{ clave: string; valor: string }> {
  return Object.entries(producto)
    .filter(([clave, valor]) => !COMUNES.has(clave) && valor !== null && valor !== undefined && valor !== '')
    .map(([clave, valor]) => ({ clave, valor: formatearValor(valor) }));
}

function formatearValor(valor: unknown): string {
  if (typeof valor === 'boolean') return valor ? 'Si' : 'No';
  return String(valor);
}

export const pesos = (n: number) =>
  '$ ' + Math.round(n).toLocaleString('es-CO');

export const metros = (n: number) => `${n.toFixed(2)} m`;

/** m² de una pieza: ancho x alto x cantidad. */
export const areaPieza = (p: ProductoSafra) => p.ancho_m * p.alto_m * (p.cantidad || 1);

export const areaPedido = (pedido: PedidoSafra) =>
  pedido.productos.reduce((suma, p) => suma + areaPieza(p), 0);

export const piezasPedido = (pedido: PedidoSafra) =>
  pedido.productos.reduce((suma, p) => suma + (p.cantidad || 1), 0);

/** Fecha "2026-09-01" -> "1 sep 2026", sin pasar por Date (evita el corrimiento de zona horaria). */
export function fechaCorta(iso: string): string {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const [a, m, d] = (iso || '').split('-').map(Number);
  if (!a || !m || !d) return iso;
  return `${d} ${meses[m - 1]} ${a}`;
}

/**
 * Recalcula el resumen desde las facturas y lo compara con el que trae el
 * archivo. En el reporte del 07-sep NO coincidian: el resumen decia
 * $4.755.758 de subtotal y la suma de las 7 facturas daba $4.765.758
 * ($10.000 exactos de diferencia, con el IVA arrastrando $1.899,63).
 *
 * Como factura por factura la suma de `precio_final` SI da el subtotal, el
 * detalle es el que esta bien. Por eso la pantalla muestra SIEMPRE lo
 * recalculado y avisa cuando el archivo no cuadra, en vez de repetir un
 * numero que puede estar mal.
 */
export function calcularResumen(reporte: ReporteSafra) {
  const pedidos = reporte.pedidos || [];
  const real = {
    facturas: new Set(pedidos.map(p => p.facturacion.factura_numero)).size,
    pedidos: pedidos.length,
    piezas: pedidos.reduce((s, p) => s + piezasPedido(p), 0),
    subtotal: pedidos.reduce((s, p) => s + p.facturacion.subtotal, 0),
    iva: pedidos.reduce((s, p) => s + p.facturacion.iva, 0),
    total: pedidos.reduce((s, p) => s + p.facturacion.total, 0),
    areaM2: pedidos.reduce((s, p) => s + areaPedido(p), 0),
  };

  const decl = reporte.resumen_economico;
  const dif = (a: number, b: number) => Math.abs(a - b) > 0.5;
  const descuadres: Array<{ campo: string; archivo: number; real: number }> = [];
  if (decl) {
    if (dif(decl.subtotal_cop, real.subtotal)) descuadres.push({ campo: 'Subtotal', archivo: decl.subtotal_cop, real: real.subtotal });
    if (dif(decl.iva_cop, real.iva)) descuadres.push({ campo: 'IVA', archivo: decl.iva_cop, real: real.iva });
    if (dif(decl.total_cop, real.total)) descuadres.push({ campo: 'Total', archivo: decl.total_cop, real: real.total });
    if (decl.total_piezas !== real.piezas) descuadres.push({ campo: 'Piezas', archivo: decl.total_piezas, real: real.piezas });
    if (decl.total_pedidos !== real.pedidos) descuadres.push({ campo: 'Pedidos', archivo: decl.total_pedidos, real: real.pedidos });
  }

  return { real, declarado: decl, descuadres };
}

/** Cuanto se facturo por cada forma de pago (CUPO / Credito / PSE...). */
export function porFormaDePago(pedidos: PedidoSafra[]) {
  const mapa = new Map<string, { forma: string; cuantas: number; total: number }>();
  for (const p of pedidos) {
    const forma = p.facturacion.forma_pago || 'Sin forma de pago';
    const actual = mapa.get(forma) || { forma, cuantas: 0, total: 0 };
    actual.cuantas += 1;
    actual.total += p.facturacion.total;
    mapa.set(forma, actual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/** Cuanto se facturo por tipo de persiana, para ver que se vende. */
export function porTipoDePersiana(pedidos: PedidoSafra[]) {
  const mapa = new Map<string, { tipo: string; piezas: number; areaM2: number; subtotal: number }>();
  for (const pedido of pedidos) {
    for (const prod of pedido.productos) {
      const actual = mapa.get(prod.tipo) || { tipo: prod.tipo, piezas: 0, areaM2: 0, subtotal: 0 };
      actual.piezas += prod.cantidad || 1;
      actual.areaM2 += areaPieza(prod);
      actual.subtotal += prod.precio_final;
      mapa.set(prod.tipo, actual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.subtotal - a.subtotal);
}

export function tiposDePersiana(pedidos: PedidoSafra[]): string[] {
  return [...new Set(pedidos.flatMap(p => p.productos.map(pr => pr.tipo)))].sort();
}

export function formasDePago(pedidos: PedidoSafra[]): string[] {
  return [...new Set(pedidos.map(p => p.facturacion.forma_pago))].sort();
}

/** Busqueda sin tildes ni mayusculas, igual que el Dashboard. */
export function normalizar(valor?: string) {
  return (valor || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
