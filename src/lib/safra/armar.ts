import type { PedidoSafra, ProductoSafra, ReporteSafra } from './tipos';
import type { PedidoFila, ProductoFila } from './nube';

/**
 * Reconstruye la forma `ReporteSafra` a partir de las filas de Supabase.
 *
 * Es a proposito: la pantalla ya sabe dibujar un `ReporteSafra` (lo hizo con el
 * archivo incrustado), asi que en vez de escribir un segundo renderizador para
 * "los datos de la base", se traducen las filas a la misma forma. La pantalla
 * ni se entera de si los datos vinieron de un archivo o de la nube.
 *
 * `extra` se vuelve a desarmar sobre el producto, asi que los campos propios de
 * cada sistema (cover_light, cenefa, cantidad_lamas...) vuelven a aparecer
 * exactamente como venian, incluidos los que Safra agregue en el futuro.
 */
export function armarReporte(pedidos: PedidoFila[], productos: ProductoFila[]): ReporteSafra {
  const porPedido = new Map<string, ProductoSafra[]>();
  for (const p of productos) {
    const lista = porPedido.get(p.pedido_id) || [];
    lista.push({
      item: p.item,
      tipo: p.tipo || '',
      tela: p.tela || '',
      cantidad: p.cantidad ?? 1,
      ancho_m: p.ancho_m ?? 0,
      alto_m: p.alto_m ?? 0,
      mando: p.mando || '',
      coordinado: p.coordinado || '',
      encajonada: p.encajonada ?? false,
      ubicacion: p.ubicacion || '',
      precio_final: p.precio_final ?? 0,
      ...(p.extra || {}),
    });
    porPedido.set(p.pedido_id, lista);
  }

  const armados: PedidoSafra[] = pedidos.map(fila => ({
    pedido_id: fila.pedido_id,
    referencia_personalizada: fila.referencia_personalizada || '',
    facturacion: {
      factura_numero: fila.factura_numero || '',
      fecha: fila.factura_fecha || '',
      forma_pago: fila.forma_pago || '',
      subtotal: fila.subtotal ?? 0,
      iva: fila.iva ?? 0,
      total: fila.total ?? 0,
    },
    productos: (porPedido.get(fila.pedido_id) || []).sort((a, b) => a.item - b.item),
  }));

  const fechas = armados.map(p => p.facturacion.fecha).filter(Boolean).sort();

  return {
    fecha_reporte: fechas[fechas.length - 1] || '',
    generado_en: '',
    empresa_proveedor: 'PERSIANAS Y ENROLLABLES SAFRA S A S',
    cliente: '',
    nit_cliente: '',
    // Sin resumen declarado a proposito: en la base los totales SIEMPRE salen
    // de sumar las facturas, asi que no hay nada contra que descuadrar. El
    // aviso de descuadre se calcula aparte, contra el ultimo archivo crudo.
    resumen_economico: undefined as unknown as ReporteSafra['resumen_economico'],
    pedidos: armados,
  };
}
