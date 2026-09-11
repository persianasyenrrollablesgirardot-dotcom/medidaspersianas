import { db } from '../db';
import type { BackupRecord, TechnicalProject } from '../types';
import { flushWrites, getFallbackProjects, restoreProjects } from './localFallbackStore';
import { hydrateProjectsPhotos } from './photoStore';

/**
 * RESPALDO AUTOMÁTICO
 *
 * Los datos se perdieron porque el único respaldo era manual: el botón
 * "Backup JSON". Lo que salvó el rescate de julio fueron unos exports viejos
 * que habían quedado en /sdcard/Download por casualidad.
 *
 * Ahora la app se respalda sola, todos los días, en un cajón APARTE del store
 * vivo. Si el store se corrompe, el snapshot sigue ahí.
 *
 * Ojo con el alcance: esto protege de errores de la app, NO de perder el
 * celular — vive en el mismo dispositivo. Para eso está la nube
 * (`cloudBackup.ts`) y el recordatorio de export a Descargas.
 */

const MAX_SNAPSHOTS = 10;
const UN_DIA_MS = 24 * 60 * 60 * 1000;
const ULTIMO_EXPORT_KEY = 'juno_ultimo_export_manual';

/** Toma un snapshot de los proyectos (sin fotos: las fotos ya viven aparte). */
export async function tomarSnapshot(reason: BackupRecord['reason'] = 'manual'): Promise<BackupRecord | undefined> {
  await flushWrites();
  const proyectos = getFallbackProjects();
  if (proyectos.length === 0) return undefined;

  const payload = JSON.stringify(proyectos);
  const photoCount = await db.photos.count();
  const registro: BackupRecord = {
    createdAt: Date.now(),
    reason,
    projectCount: proyectos.length,
    photoCount,
    payload,
    bytes: payload.length,
  };

  const id = await db.backups.add(registro);
  await rotar();
  return { ...registro, id: id as number };
}

async function rotar() {
  const todos = await db.backups.orderBy('createdAt').reverse().toArray();
  const sobrantes = todos.slice(MAX_SNAPSHOTS);
  if (sobrantes.length > 0) {
    await db.backups.bulkDelete(sobrantes.map(b => b.id!).filter(Boolean));
  }
}

/** Snapshot diario. Se llama al arrancar la app; es barato y no molesta. */
export async function respaldoDiarioSiCorresponde(): Promise<void> {
  try {
    const ultimo = await db.backups.orderBy('createdAt').reverse().first();
    if (ultimo && Date.now() - ultimo.createdAt < UN_DIA_MS) return;
    await tomarSnapshot('diario');
  } catch (error) {
    console.error('No se pudo tomar el respaldo diario', error);
  }
}

export async function listarSnapshots(): Promise<Array<Omit<BackupRecord, 'payload'>>> {
  const todos = await db.backups.orderBy('createdAt').reverse().toArray();
  // Sin el payload: la lista se muestra en la UI y puede pesar varios MB.
  return todos.map(({ payload: _payload, ...resto }) => resto);
}

/**
 * Restaura desde un snapshot. NO borra nada: combina por código de proyecto.
 * Antes de restaurar toma un snapshot del estado actual, por si la
 * restauración misma fuera un error.
 */
export async function restaurarSnapshot(id: number): Promise<{ added: number; updated: number; skipped: number }> {
  const snapshot = await db.backups.get(id);
  if (!snapshot) throw new Error('El respaldo ya no existe');

  await tomarSnapshot('pre-restauracion');

  const proyectos = JSON.parse(snapshot.payload) as TechnicalProject[];
  return restoreProjects(proyectos);
}

// ─────────────────────── Export manual a Descargas ──────────────────────────

export function descargarTexto(nombre: string, contenido: string, tipo = 'application/json') {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Respaldo portable: incluye las fotos en base64 para que el archivo sirva por
 * sí solo, aunque se pierda la app y el celular. Es el formato que salvó julio.
 *
 * Desde la v2 se lleva ademas los registros que NO viven dentro del proyecto:
 * recibos, facturas, constancias de puerta y seguimiento del pedido. Antes se perdian
 * en silencio — el archivo decia "respaldo completo" y solo traia proyectos.
 *
 * `version: 2` y las claves nuevas son ADITIVAS: quien lee el archivo sigue buscando
 * `projects`, asi que un respaldo nuevo se puede restaurar con el rescate de siempre y
 * uno viejo se sigue leyendo igual.
 *
 * OJO: la restauracion de hoy (`restoreIntoFallback`) solo reinstala PROYECTOS. Estas
 * tablas viajan en el archivo pero todavia no se vuelven a cargar solas. Es mejor que
 * perderlas, y es lo siguiente que hay que cerrar.
 */
export async function descargarRespaldoCompleto(): Promise<{ proyectos: number; bytes: number }> {
  await flushWrites();
  const proyectos = await hydrateProjectsPhotos(getFallbackProjects());
  const [receipts, invoices, gateEvents, trackingEvents] = await Promise.all([
    db.receipts.toArray(),
    db.invoices.toArray(),
    db.projectEvents.toArray(),
    db.trackingEvents.toArray(),
  ]);
  const contenido = JSON.stringify(
    {
      app: 'App_Tecnica_Campo_Juno',
      version: 2,
      exportedAt: Date.now(),
      projects: proyectos,
      receipts,
      invoices,
      gateEvents,
      trackingEvents,
    },
    null,
    2,
  );
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  descargarTexto(`backup_app_tecnica_campo_juno_${sello}.json`, contenido);
  window.localStorage.setItem(ULTIMO_EXPORT_KEY, String(Date.now()));
  return { proyectos: proyectos.length, bytes: contenido.length };
}

/** Días desde el último export manual a Descargas (Infinity si nunca hubo). */
export function diasDesdeUltimoExport(): number {
  const guardado = Number(window.localStorage.getItem(ULTIMO_EXPORT_KEY) || 0);
  if (!guardado) return Infinity;
  return (Date.now() - guardado) / UN_DIA_MS;
}
