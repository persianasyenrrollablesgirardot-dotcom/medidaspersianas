import { db } from '../db';
import type {
  EvidenceItem,
  SpaceRecord,
  TechnicalProject,
  TechnicalSolution,
  TrashedItem,
  WindowRecord,
} from '../types';
import { getFallbackProject, isFallbackId, mutateFallbackProject } from './localFallbackStore';
import { saveProject } from './projectStore';
import { evidenceLabel } from './labels';

/**
 * PAPELERA DE SUB-ELEMENTOS
 *
 * ── El problema ───────────────────────────────────────────────────────────
 * Borrar un espacio o una ventana era un `filter()` y nada más: sin aviso,
 * sin copia, sin vuelta atrás. Un toque de más en el celular y se iba un
 * ambiente entero con sus ventanas, sus persianas y sus fotos. La Papelera
 * solo conocía PROYECTOS, así que ahí no aparecía nada.
 *
 * ── Por qué no se marca `deletedAt` como en los proyectos ──────────────────
 * Porque un espacio marcado seguiría viviendo dentro de `project.spaces`, y
 * habría que filtrarlo en cada lugar que recorre el proyecto: totales, m2,
 * cotización, factura, PDF de fabricación, orden del proveedor, subida a la
 * nube, respaldos. Con que UNA ruta se olvide, el cliente paga un espacio
 * borrado o la fábrica lo produce. Demasiado riesgo para una papelera.
 *
 * ── Cómo funciona ─────────────────────────────────────────────────────────
 * El elemento SALE del proyecto igual que antes (el resto de la app no cambia
 * en nada), y antes de salir se guarda su copia COMPLETA acá, con el contexto
 * para volver a meterlo en el mismo lugar: proyecto, espacio, ventana y la
 * posición que ocupaba. Restaurar es re-insertarlo; nada se recalcula solo
 * porque el proyecto se guarda por las vías normales.
 *
 * Las fotos NO viajan en el payload: viven en la tabla `photos` con su propio
 * id y ahí se quedan mientras el elemento esté en la papelera. Solo se borran
 * cuando se vacía la papelera de verdad.
 */

type Trashable = SpaceRecord | WindowRecord | TechnicalSolution | EvidenceItem;

/** Copia profunda y sin `undefined` (Dexie no guarda proxies de React). */
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ─────────────────────────── Resúmenes visibles ─────────────────────────────

function plural(n: number, singular: string, plural_: string) {
  return `${n} ${n === 1 ? singular : plural_}`;
}

function spaceDetail(space: SpaceRecord) {
  const windows = space.windows?.length || 0;
  const solutions = (space.windows || []).reduce((sum, w) => sum + (w.solutions?.length || 0), 0);
  const photos = (space.windows || []).reduce((sum, w) => sum + (w.evidence?.length || 0), 0);
  return [plural(windows, 'ventana', 'ventanas'), plural(solutions, 'persiana', 'persianas'), plural(photos, 'foto', 'fotos')].join(' · ');
}

function windowDetail(win: WindowRecord) {
  return [plural(win.solutions?.length || 0, 'persiana', 'persianas'), plural(win.evidence?.length || 0, 'foto', 'fotos')].join(' · ');
}

export function trashKindLabel(kind: TrashedItem['kind']) {
  return kind === 'space' ? 'Espacio' : kind === 'window' ? 'Ventana' : kind === 'solution' ? 'Persiana' : 'Foto';
}

// ──────────────────────────── Mandar a la papelera ──────────────────────────

async function push(item: Omit<TrashedItem, 'id' | 'deletedAt'>) {
  try {
    await db.trash.add({ ...item, payload: snapshot(item.payload), deletedAt: Date.now() });
    return true;
  } catch (error) {
    console.error('No se pudo guardar el elemento en la papelera', error);
    return false;
  }
}

/**
 * Guarda la copia ANTES de que la pantalla saque el elemento del proyecto.
 * Devuelve `false` si no se pudo guardar: en ese caso quien llama NO debe
 * borrar, porque el elemento se perdería sin red.
 */
export function trashSpace(project: TechnicalProject, space: SpaceRecord) {
  return push({
    kind: 'space',
    projectId: project.id!,
    projectCode: project.code,
    projectName: project.clientName,
    label: space.name || 'Espacio sin nombre',
    context: project.clientName || project.code,
    index: project.spaces.findIndex(s => s.id === space.id),
    payload: space,
    detail: spaceDetail(space),
  });
}

export function trashWindow(project: TechnicalProject, space: SpaceRecord, win: WindowRecord) {
  return push({
    kind: 'window',
    projectId: project.id!,
    projectCode: project.code,
    projectName: project.clientName,
    label: win.label || 'Ventana sin nombre',
    context: `${project.clientName || project.code} › ${space.name}`,
    spaceId: space.id,
    index: space.windows.findIndex(w => w.id === win.id),
    payload: win,
    detail: windowDetail(win),
  });
}

export function trashSolution(project: TechnicalProject, space: SpaceRecord, win: WindowRecord, solution: TechnicalSolution) {
  return push({
    kind: 'solution',
    projectId: project.id!,
    projectCode: project.code,
    projectName: project.clientName,
    label: solution.name || 'Persiana sin nombre',
    context: `${project.clientName || project.code} › ${space.name} › ${win.label}`,
    spaceId: space.id,
    windowId: win.id,
    index: win.solutions.findIndex(s => s.id === solution.id),
    payload: solution,
    detail: [solution.system, solution.itemType === 'maintenance' ? 'Mantenimiento' : undefined].filter(Boolean).join(' · '),
  });
}

export function trashEvidence(project: TechnicalProject, space: SpaceRecord, win: WindowRecord, evidence: EvidenceItem) {
  return push({
    kind: 'evidence',
    projectId: project.id!,
    projectCode: project.code,
    projectName: project.clientName,
    label: evidence.label || 'Foto',
    context: `${project.clientName || project.code} › ${space.name} › ${win.label}`,
    spaceId: space.id,
    windowId: win.id,
    index: win.evidence.findIndex(e => e.id === evidence.id),
    payload: evidence,
    detail: evidenceLabel(evidence.kind),
  });
}

// ──────────────────────────────── Restaurar ─────────────────────────────────

/** Inserta en la posición original; si ya no existe, va al final. */
function insertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  const at = index >= 0 && index <= next.length ? index : next.length;
  next.splice(at, 0, item);
  return next;
}

function mutate(projectId: number, updater: (project: TechnicalProject) => TechnicalProject) {
  if (isFallbackId(projectId)) {
    return Promise.resolve(mutateFallbackProject(projectId, updater));
  }
  return db.projects.get(projectId).then(async project => {
    if (!project) return false;
    await saveProject(updater(project));
    return true;
  });
}

function projectOf(projectId: number): Promise<TechnicalProject | undefined> {
  if (isFallbackId(projectId)) return Promise.resolve(getFallbackProject(projectId));
  return db.projects.get(projectId);
}

export type RestoreResult = { ok: true } | { ok: false; reason: string };

export async function restoreTrashedItem(item: TrashedItem): Promise<RestoreResult> {
  const project = await projectOf(item.projectId);
  if (!project) return { ok: false, reason: 'El proyecto ya no existe en este dispositivo.' };

  const payload = item.payload as any;

  if (item.kind === 'space') {
    if (project.spaces.some(s => s.id === payload.id)) {
      await db.trash.delete(item.id!);
      return { ok: true };
    }
    const ok = await mutate(item.projectId, current => ({
      ...current,
      spaces: insertAt(current.spaces, payload as SpaceRecord, item.index),
    }));
    if (!ok) return { ok: false, reason: 'No se pudo escribir en el proyecto.' };
    await db.trash.delete(item.id!);
    return { ok: true };
  }

  const space = project.spaces.find(s => s.id === item.spaceId);
  if (!space) {
    return { ok: false, reason: 'El espacio que lo contenía ya no existe. Restaurá primero ese espacio.' };
  }

  if (item.kind === 'window') {
    if (space.windows.some(w => w.id === payload.id)) {
      await db.trash.delete(item.id!);
      return { ok: true };
    }
    const ok = await mutate(item.projectId, current => ({
      ...current,
      spaces: current.spaces.map(s => s.id !== item.spaceId ? s : ({
        ...s,
        windows: insertAt(s.windows, payload as WindowRecord, item.index),
      })),
    }));
    if (!ok) return { ok: false, reason: 'No se pudo escribir en el proyecto.' };
    await db.trash.delete(item.id!);
    return { ok: true };
  }

  const win = space.windows.find(w => w.id === item.windowId);
  if (!win) {
    return { ok: false, reason: 'La ventana que lo contenía ya no existe. Restaurá primero esa ventana.' };
  }

  const yaEsta = item.kind === 'solution'
    ? win.solutions.some(s => s.id === payload.id)
    : win.evidence.some(e => e.id === payload.id);
  if (yaEsta) {
    await db.trash.delete(item.id!);
    return { ok: true };
  }

  const ok = await mutate(item.projectId, current => ({
    ...current,
    spaces: current.spaces.map(s => s.id !== item.spaceId ? s : ({
      ...s,
      windows: s.windows.map(w => w.id !== item.windowId ? w : (
        item.kind === 'solution'
          ? { ...w, solutions: insertAt(w.solutions, payload as TechnicalSolution, item.index) }
          : { ...w, evidence: insertAt(w.evidence, payload as EvidenceItem, item.index) }
      )),
    })),
  }));
  if (!ok) return { ok: false, reason: 'No se pudo escribir en el proyecto.' };
  await db.trash.delete(item.id!);
  return { ok: true };
}

// ─────────────────────────── Borrado definitivo ─────────────────────────────

/** Ids de foto que quedarían huérfanos al borrar definitivamente el elemento. */
function photoIdsOf(item: TrashedItem): string[] {
  const payload = item.payload as any;
  const fromEvidence = (list: EvidenceItem[] = []) =>
    list.map(ev => ev.photoId).filter((id): id is string => Boolean(id));

  if (item.kind === 'evidence') return fromEvidence([payload as EvidenceItem]);
  if (item.kind === 'window') return fromEvidence((payload as WindowRecord).evidence);
  if (item.kind === 'space') {
    return ((payload as SpaceRecord).windows || []).flatMap(w => fromEvidence(w.evidence));
  }
  return [];
}

export async function purgeTrashedItem(item: TrashedItem) {
  const ids = photoIdsOf(item);
  if (ids.length > 0) {
    // Solo si NINGÚN proyecto vivo sigue apuntando a esa foto: la copia de un
    // proyecto comparte los mismos `photoId` a propósito (no se duplican bytes).
    const enUso = await photoIdsEnUso();
    const huerfanas = ids.filter(id => !enUso.has(id));
    if (huerfanas.length > 0) await db.photos.bulkDelete(huerfanas);
  }
  await db.trash.delete(item.id!);
}

async function photoIdsEnUso(): Promise<Set<string>> {
  const usados = new Set<string>();
  const recorrer = (project: TechnicalProject) => {
    (project.spaces || []).forEach(space =>
      (space.windows || []).forEach(win =>
        (win.evidence || []).forEach(ev => {
          if (ev.photoId) usados.add(ev.photoId);
        }),
      ),
    );
  };
  (await db.projects.toArray()).forEach(recorrer);
  // Lo que sigue en la papelera también cuenta como "en uso".
  (await db.trash.toArray()).forEach(item => {
    if (item.kind === 'space') recorrer({ spaces: [item.payload as SpaceRecord] } as TechnicalProject);
    if (item.kind === 'window') recorrer({ spaces: [{ windows: [item.payload as WindowRecord] }] } as TechnicalProject);
    if (item.kind === 'evidence') {
      const ev = item.payload as EvidenceItem;
      if (ev.photoId) usados.add(ev.photoId);
    }
  });
  return usados;
}

export async function emptyItemTrash() {
  const items = await db.trash.toArray();
  for (const item of items) await purgeTrashedItem(item);
}

/** Se llama cuando un proyecto se borra DEFINITIVAMENTE: su papelera se va con él. */
export async function purgeTrashOfProject(projectId: number) {
  const items = await db.trash.where('projectId').equals(projectId).toArray();
  for (const item of items) await db.trash.delete(item.id!);
}

// ──────────────────────────────── Lecturas ──────────────────────────────────

export async function listTrashedItems(): Promise<TrashedItem[]> {
  const items = await db.trash.toArray();
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Cuántos sub-elementos hay en la papelera (para el badge del Dashboard). */
export async function countTrashedItems(): Promise<number> {
  return db.trash.count();
}

export type { Trashable };
