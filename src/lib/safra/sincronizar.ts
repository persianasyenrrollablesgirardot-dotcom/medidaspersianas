import type { ReporteSafra } from './tipos';
import { huella, prepararIngesta, validarReporte } from './ingesta';
import {
  escribirIngesta, guardarReporteCrudo, marcarProcesado, pedidosGuardados,
  reportesSinProcesar,
} from './nube';

/**
 * Orquesta el camino completo de un reporte: validar -> guardar crudo ->
 * comparar con lo que hay -> escribir. En ese orden y no en otro.
 *
 * El orden importa: el archivo crudo se guarda ANTES de interpretarlo. Si la
 * interpretacion falla a mitad de camino, el original ya quedo a salvo en
 * `safra_reportes` y se puede reprocesar cuando el problema este resuelto.
 */

export interface Resultado {
  archivo: string;
  nuevos: number;
  actualizados: number;
  sinCambios: number;
  piezas: number;
  cambiosDetectados: number;
  duplicado?: boolean;
}

/** Vuelca un reporte ya validado a las tablas de pedidos y piezas. */
async function volcar(reporte: ReporteSafra, archivo: string): Promise<Resultado> {
  const ids = (reporte.pedidos || []).map(p => String(p.pedido_id || '')).filter(Boolean);
  const guardados = await pedidosGuardados(ids);
  const ingesta = prepararIngesta(reporte, guardados, archivo);
  await escribirIngesta(ingesta);
  return {
    archivo,
    ...ingesta.resumen,
    cambiosDetectados: ingesta.cambios.length,
  };
}

/**
 * Importacion MANUAL: Jhon elige un archivo y entra por aca.
 *
 * Existe como red de seguridad del automatico. Si un dia el script de Google
 * no corre, o Gemini genera el archivo tarde, siempre se puede meter a mano y
 * no quedar bloqueado. Es el mismo camino y las mismas defensas: importar dos
 * veces el mismo archivo no duplica nada.
 */
export async function importarTexto(nombreArchivo: string, texto: string): Promise<Resultado> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON valido.');
  }

  const validacion = validarReporte(crudo);
  if (!validacion.ok) throw new Error(validacion.motivo);
  const reporte = validacion.reporte;

  const archivo = nombreArchivo || `reporte_safra_${reporte.fecha_reporte || 'sin-fecha'}.json`;
  const guardado = await guardarReporteCrudo(archivo, reporte, huella(texto));

  // Aunque el archivo ya estuviera subido, se vuelve a volcar: es idempotente
  // y cubre el caso de que la subida haya funcionado pero el volcado no.
  const resultado = await volcar(reporte, archivo);
  if (guardado.id) await marcarProcesado(guardado.id);
  return { ...resultado, duplicado: guardado.duplicado };
}

/**
 * Procesa lo que el script de Google haya dejado en `safra_reportes` sin
 * volcar. Se llama sola al abrir el modulo.
 *
 * El script de Apps Script hace lo minimo posible — leer el archivo de Drive y
 * dejarlo crudo en la base — porque es codigo que vive fuera del repo y no se
 * puede probar. Toda la parte delicada (deduplicar, no pisar con vacio,
 * registrar cambios) pasa aca, en TypeScript, donde si se puede.
 */
export async function procesarPendientes(): Promise<Resultado[]> {
  const pendientes = await reportesSinProcesar();
  const resultados: Resultado[] = [];
  for (const fila of pendientes || []) {
    const validacion = validarReporte(fila.json_crudo);
    if (!validacion.ok) {
      // No se marca como procesado: queda pendiente y a la vista, con el crudo
      // intacto. Preferible a darlo por bueno y perderlo de vista.
      console.warn(`Reporte ${fila.archivo} ignorado: ${validacion.motivo}`);
      continue;
    }
    resultados.push(await volcar(validacion.reporte, fila.archivo));
    await marcarProcesado(fila.id);
  }
  return resultados;
}
