/**
 * Capturar evidencias: la escritura. La logica esta en `evidencias.ts`, que es puro.
 *
 * Las fotos van a la tabla `photos` que ya existe, con el mismo pipeline de compresion que
 * usa el levantamiento: no hay dos formas de guardar una imagen en esta app.
 *
 * Append-only, como la bitacora de puertas: capturar de nuevo AGREGA. Una evidencia que se
 * puede reemplazar en silencio deja de probar cuando se tomo, y el cuando es justamente lo
 * que discute el proveedor cuando el plazo esta al limite.
 */
import { db } from '../db';
import { compressToBlob, savePhoto } from './photoStore';
import { uid } from './ids';
import { construirCaptura, type CapturaEvidencia } from './evidencias';

export * from './evidencias';

/** Guarda la imagen y registra la captura en un solo paso. */
export async function capturarConFoto(entrada: {
  projectId: number;
  projectCode: string;
  evidencia: string;
  actor: string;
  archivo: Blob;
  nota?: string;
  solutionId?: string;
}): Promise<CapturaEvidencia> {
  const photoId = uid('ev');
  const blob = await compressToBlob(entrada.archivo);
  await savePhoto({
    id: photoId,
    projectId: entrada.projectId,
    projectCode: entrada.projectCode,
    blob,
  });
  return registrarCaptura({ ...entrada, photoId });
}

export async function registrarCaptura(entrada: {
  projectId: number;
  projectCode: string;
  evidencia: string;
  actor: string;
  photoId?: string;
  nota?: string;
  solutionId?: string;
}): Promise<CapturaEvidencia> {
  const captura = construirCaptura(entrada);
  const id = await db.evidenceCaptures.add(captura);
  return { ...captura, id };
}

export async function capturasDeProyecto(projectId: number): Promise<CapturaEvidencia[]> {
  return db.evidenceCaptures.where('projectId').equals(projectId).toArray();
}

/**
 * Cuantas evidencias anticipadas faltan, por proyecto, en una sola lectura.
 *
 * El Dashboard pinta muchas tarjetas: una consulta por proyecto serian N lecturas en cada
 * render. La tabla es chica y sale mas barato traerla entera y agrupar en memoria.
 */
export async function anticipadasPendientesPorProyecto(): Promise<Map<number, number>> {
  const { anticipadas, estadoDeEvidencias } = await import('./evidencias');
  const todas = await db.evidenceCaptures.toArray();
  const porProyecto = new Map<number, CapturaEvidencia[]>();
  for (const c of todas) {
    const lista = porProyecto.get(c.projectId);
    if (lista) lista.push(c);
    else porProyecto.set(c.projectId, [c]);
  }
  const total = anticipadas().length;
  const pendientes = new Map<number, number>();
  for (const [projectId, capturas] of porProyecto) {
    const reunidas = estadoDeEvidencias(capturas, anticipadas()).filter(e => e.reunida).length;
    if (reunidas < total) pendientes.set(projectId, total - reunidas);
  }
  return pendientes;
}
