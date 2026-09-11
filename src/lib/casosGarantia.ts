/**
 * Casos de posventa y garantia: la escritura. Las reglas estan en `garantia.ts`, que es
 * puro y se prueba sin navegador.
 *
 * A diferencia de la bitacora de puertas y del seguimiento, esto NO es append-only, y la
 * diferencia es de fondo: aquellos son registros de hechos que pasaron, y un caso es un
 * pendiente que se abre y se cierra. Forzarlo a append-only obligaria a reconstruir el
 * estado de cada reclamo leyendo su historia, para nada.
 *
 * Lo que si se congela es el veredicto: `veredictoAlAbrir` y `explicacionAlAbrir` se
 * guardan al abrir y no se recalculan nunca. Si manana cambia una regla de garantia, el
 * caso sigue diciendo que se le respondio al cliente aquel dia. Recalcular al vuelo
 * reescribiria la historia, que es justo lo que no puede pasar en un reclamo.
 */
import { db } from '../db';
import { construirCaso, type CasoGarantia, type CausaGarantia, type ResolucionCaso } from './garantia';

export * from './garantia';

export async function abrirCaso(entrada: Parameters<typeof construirCaso>[0]): Promise<CasoGarantia> {
  const caso = construirCaso(entrada);
  const id = await db.warrantyCases.add(caso);
  return { ...caso, id };
}

/** Cierra un caso con su causa y su resolucion. No borra nada de lo que ya decia. */
export async function cerrarCaso(
  id: number,
  cierre: { causa: CausaGarantia; resolucion: ResolucionCaso; notaCierre?: string },
): Promise<void> {
  const cambios: Partial<CasoGarantia> = {
    causa: cierre.causa,
    resolucion: cierre.resolucion,
    cerradoEl: Date.now(),
  };
  const nota = (cierre.notaCierre || '').trim();
  if (nota) cambios.notaCierre = nota;
  await db.warrantyCases.update(id, cambios);
}

export async function casosDeProyecto(projectId: number): Promise<CasoGarantia[]> {
  return db.warrantyCases.where('projectId').equals(projectId).toArray();
}

/** Cuantos casos siguen abiertos, por proyecto. Una sola lectura para todo el Dashboard. */
export async function casosAbiertosPorProyecto(): Promise<Map<number, number>> {
  const cuenta = new Map<number, number>();
  for (const caso of await db.warrantyCases.toArray()) {
    if (caso.cerradoEl === undefined) {
      cuenta.set(caso.projectId, (cuenta.get(caso.projectId) ?? 0) + 1);
    }
  }
  return cuenta;
}
