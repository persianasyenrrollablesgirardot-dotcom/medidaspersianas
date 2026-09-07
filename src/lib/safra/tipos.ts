/**
 * Forma del reporte diario que Safra deja en Google Drive
 * (`Mi unidad/Reporte Safra/reporte_safra_YYYY-MM-DD.json`).
 *
 * Sacada del archivo REAL del 2026-09-07, no inventada. Dos cosas importantes
 * que salieron de mirar ese archivo:
 *
 * 1. Los campos de cada producto DEPENDEN del tipo de persiana. Solo 11 son
 *    comunes a todas; el resto aparece o no segun el sistema (una Vertical
 *    trae `cantidad_lamas`, un Panel Japones trae `cenefa`, una Enrollable
 *    Premium trae `cover_light`...). Por eso `ProductoSafra` tiene los
 *    opcionales sueltos MAS un index signature: si Safra agrega un campo
 *    nuevo manana, la pantalla lo muestra igual en vez de tragarselo.
 *
 * 2. `resumen_economico` NO siempre cuadra con la suma de las facturas. En el
 *    archivo del 07-sep el subtotal del resumen daba $10.000 menos que la suma
 *    real de los 7 pedidos (y el IVA arrastraba la diferencia), mientras que
 *    factura por factura la suma de `precio_final` SI daba el subtotal. O sea:
 *    el detalle esta bien y el resumen esta mal. Nunca mostrar el resumen como
 *    verdad — ver `calcularResumen()` en `resumen.ts`.
 */

export interface ProductoSafra {
  item: number;
  tipo: string;
  tela: string;
  cantidad: number;
  ancho_m: number;
  alto_m: number;
  mando: string;
  coordinado: string;
  encajonada: boolean;
  ubicacion: string;
  precio_final: number;
  // Campos que solo traen algunos tipos de persiana.
  cabezal?: string;
  perfil?: string;
  enrollado?: string;
  cover_light?: string;
  apertura?: string;
  cantidad_lamas?: number;
  pesa_lama?: string;
  altura_cordon?: string;
  color_cordon?: string;
  posicion_telo_fijo?: string;
  cenefa?: string;
  // Cualquier campo nuevo que Safra agregue.
  [clave: string]: unknown;
}

export interface FacturacionSafra {
  factura_numero: string;
  fecha: string;
  /** "Credito", "CUPO", "PSE"... tal cual lo escribe Safra. */
  forma_pago: string;
  subtotal: number;
  iva: number;
  total: number;
}

export interface PedidoSafra {
  pedido_id: string;
  /** Casi siempre el nombre del cliente final ("CAMILO RICAURTE", "nubia"). */
  referencia_personalizada: string;
  facturacion: FacturacionSafra;
  productos: ProductoSafra[];
}

export interface ResumenEconomicoSafra {
  total_pedidos: number;
  total_piezas: number;
  subtotal_cop: number;
  iva_cop: number;
  total_cop: number;
}

export interface ReporteSafra {
  fecha_reporte: string;
  generado_en: string;
  empresa_proveedor: string;
  cliente: string;
  nit_cliente: string;
  resumen_economico: ResumenEconomicoSafra;
  pedidos: PedidoSafra[];
}
