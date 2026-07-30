import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CATALOG, db } from '../db';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject } from '../types';
import { solutionTotal, solutionArea } from './metrics';
import { deletePhotosOfProject, extractPhotos } from './photoStore';
import { enqueue } from './syncQueue';

/**
 * STORE LOCAL DEL ADMIN
 *
 * ── Cómo era y por qué se perdieron datos ─────────────────────────────────
 * Todos los proyectos del admin vivían en UNA clave de localStorage
 * (`juno_fallback_projects_v1`), con las fotos en base64 adentro. Cada
 * guardado hacía JSON.stringify de los ~150 proyectos completos y un solo
 * setItem. Eso trae tres problemas encadenados:
 *   1. localStorage tiene un tope DURO de ~5 MB (no es el disco del celular:
 *      el diagnóstico mostró 7,4 MB usados de una cuota mucho mayor).
 *   2. Al ser leer-modificar-escribir sobre la lista entera, cualquier ruta
 *      que leyera una lista parcial y la reescribiera borraba el resto.
 *   3. El navegador solo expone el valor ACTUAL de una clave: lo sobrescrito
 *      no se puede recuperar desde ningún lado.
 *
 * ── Cómo es ahora ─────────────────────────────────────────────────────────
 * Los proyectos viven en IndexedDB, UNA FILA POR PROYECTO. Guardar un
 * proyecto ya no toca a los otros, así que la clase de bug desaparece por
 * construcción. Las fotos salieron del proyecto a la tabla `photos` (Blob).
 *
 * La API pública sigue siendo SÍNCRONA para no obligar a reescribir las 11
 * pantallas que la consumen: un espejo en memoria sirve las lecturas y las
 * escrituras se persisten en segundo plano, por proyecto.
 */

const PROJECTS_KEY = 'juno_fallback_projects_v1';
const CATALOG_KEY = 'juno_fallback_catalog_v1';
const MIGRATED_KEY = 'juno_migrado_a_indexeddb_v1';
const CHANGE_EVENT = 'juno-fallback-storage-change';
const CATALOG_CHANGE_EVENT = 'juno-fallback-catalog-change';

/** Espejo en memoria. Fuente de verdad de las lecturas síncronas. */
let mirror = new Map<number, TechnicalProject>();
let ready = false;

/** Cadena de escritura por proyecto: evita carreras sobre la misma fila. */
const writeChains = new Map<number, Promise<unknown>>();

export function isStoreReady() {
  return ready;
}

function notify() {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function toast(kind: 'error' | 'success', message: string, id: string) {
  import('react-hot-toast').then(({ default: t }) => {
    t[kind](message, { id, duration: kind === 'error' ? 7000 : 4000 });
  });
}

/**
 * Persiste UN proyecto. Nunca toca a los demás: ese es el punto.
 * Encola además la subida a la nube.
 */
function persist(project: TechnicalProject, { sync = true } = {}) {
  const id = project.id!;
  const previous = writeChains.get(id) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      // Las fotos nuevas salen del proyecto antes de guardarlo.
      const { project: light } = await extractPhotos(project);
      mirror.set(id, light);
      await db.projects.put(light);
      // El refId identifica al DOCUMENTO en la nube: con códigos repetidos, dos
      // copias con el mismo refId se pisan en la cola. Ver `reconciliar()`.
      if (sync) await enqueue('upsert_project', light.cloudDocId || light.code, { code: light.code, id });
    })
    .catch(error => {
      console.error('No se pudo guardar el proyecto', error);
      toast('error', 'No se pudo guardar en el dispositivo. Revisá el espacio libre.', 'persist-error');
    });
  writeChains.set(id, next);
  return next;
}

/** Espera a que se vacíen las escrituras pendientes (para respaldos/cierre). */
export async function flushWrites() {
  await Promise.allSettled([...writeChains.values()]);
}

export function isFallbackId(id?: number) {
  return typeof id === 'number' && id < 0;
}

// ─────────────────────────── Arranque y migración ───────────────────────────

/**
 * Carga el espejo y, la primera vez, migra lo que hubiera en localStorage.
 * NO borra el localStorage viejo: queda como respaldo de solo lectura por si
 * algo saliera mal. Es barato (unos KB una vez migradas las fotos) y es la
 * red de seguridad de la propia migración.
 */
export async function initLocalStore(): Promise<{ migrated: number; photos: number }> {
  await db.open();

  const yaMigrado = window.localStorage.getItem(MIGRATED_KEY) === '1';
  const enDexie = await db.projects.count();
  let migrated = 0;
  let photos = 0;

  if (!yaMigrado) {
    const legacy = leerLegado();
    if (legacy.length > 0) {
      // Copia del estado ORIGINAL antes de tocar nada. Si la migración fallara
      // a la mitad, esto queda intacto y se puede restaurar desde Ajustes.
      try {
        const payload = JSON.stringify(legacy);
        await db.backups.add({
          createdAt: Date.now(),
          reason: 'pre-migracion',
          projectCount: legacy.length,
          photoCount: 0,
          payload,
          bytes: payload.length,
        });
      } catch (error) {
        console.error('No se pudo guardar la copia previa a la migración', error);
      }

      // CANDADO: si Dexie ya tiene más proyectos que el legado, algo está mal
      // (¿migración a medias? ¿localStorage pisado?). No importamos encima.
      if (enDexie > legacy.length) {
        console.warn(`Migración omitida: Dexie tiene ${enDexie} y localStorage ${legacy.length}.`);
      } else {
        for (const raw of legacy) {
          try {
            const conId: TechnicalProject = {
              ...raw,
              id: typeof raw.id === 'number' ? raw.id : -Date.now() - Math.floor(Math.random() * 1000),
            };
            const { project, extracted } = await extractPhotos(conId);
            await db.projects.put(project);
            photos += extracted;
            migrated++;
          } catch (error) {
            console.error('Proyecto no migrado', error);
          }
        }
      }
    }
    window.localStorage.setItem(MIGRATED_KEY, '1');
  }

  const all = await db.projects.toArray();
  mirror = new Map(all.filter(p => typeof p.id === 'number').map(p => [p.id!, p]));
  ready = true;
  notify();

  if (migrated > 0) {
    toast('success', `${migrated} proyectos y ${photos} fotos movidos a almacenamiento seguro.`, 'migracion');
  }
  return { migrated, photos };
}

function leerLegado(): TechnicalProject[] {
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY) || window.sessionStorage.getItem(PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(p => p && Array.isArray(p.spaces)) : [];
  } catch {
    return [];
  }
}

/** El respaldo de solo lectura que quedó en localStorage tras migrar. */
export function getLegacySnapshot(): TechnicalProject[] {
  return leerLegado();
}

// ──────────────────────────────── Lecturas ──────────────────────────────────

export function getFallbackProjects(): TechnicalProject[] {
  return [...mirror.values()];
}

export function getFallbackProject(id: number): TechnicalProject | undefined {
  return mirror.get(id);
}

export function getCloudProjectCache(id: number): TechnicalProject | undefined {
  try {
    const raw = window.localStorage.getItem('cloud_projects_cache');
    if (raw) {
      const projs = JSON.parse(raw) as TechnicalProject[];
      return projs.find(p => p.id === id || (p as any).projectId === id);
    }
  } catch {}
  return undefined;
}

// ──────────────────────────────── Escrituras ────────────────────────────────

export function addFallbackProject(project: TechnicalProject): number {
  const id = -Date.now() - Math.floor(Math.random() * 1000);
  const nuevo: TechnicalProject = { ...project, id, updatedAt: Date.now(), synced: false };
  mirror.set(id, nuevo);
  notify();
  persist(nuevo);
  return id;
}

export function duplicateFallbackProject(projectId: number): number | undefined {
  const p = getFallbackProject(projectId);
  if (!p) return undefined;

  const id = -Date.now() - Math.floor(Math.random() * 1000);
  const clone: TechnicalProject = {
    ...p,
    id,
    code: p.code + '-COPIA',
    clientName: `${p.clientName || 'Proyecto'} (Copia)`,
    isClone: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    synced: false,
    // La copia referencia las MISMAS fotos; no se duplican bytes. Antes
    // duplicar casi doblaba el peso del store y por eso a veces fallaba.
  };
  mirror.set(id, clone);
  notify();
  persist(clone);
  return id;
}

export function saveFallbackProject(project: TechnicalProject) {
  if (!isFallbackId(project.id)) return;
  const updated = { ...project, updatedAt: Date.now(), synced: false };
  mirror.set(updated.id!, updated);
  notify();
  persist(updated);
}

/**
 * Muta un proyecto leyendo la copia MÁS FRESCA (el espejo), no un snapshot de
 * React. Sigue siendo necesario: dos fotos seguidas se comprimen en paralelo y
 * sin esto la segunda pisaba a la primera.
 */
export function mutateFallbackProject(
  id: number,
  updater: (project: TechnicalProject) => TechnicalProject,
): boolean {
  const actual = mirror.get(id);
  if (!actual) return false;
  const updated = { ...updater(actual), id, updatedAt: Date.now(), synced: false };
  mirror.set(id, updated);
  notify();
  persist(updated);
  return true;
}

export function deleteFallbackProject(id: number) {
  mirror.delete(id);
  notify();
  const previous = writeChains.get(id) || Promise.resolve();
  writeChains.set(
    id,
    previous
      .catch(() => undefined)
      .then(async () => {
        await db.projects.delete(id);
        await deletePhotosOfProject(id);
        await enqueue('delete_project', String(id), { id });
      })
      .catch(error => console.error('No se pudo borrar el proyecto', error)),
  );
}

export function trashFallbackProject(id: number) {
  const deletedAt = Date.now();
  mutateFallbackProject(id, project => ({ ...project, deletedAt }));
}

export function restoreFallbackProject(id: number) {
  mutateFallbackProject(id, project => ({ ...project, deletedAt: 0 }));
}

/**
 * Restaura un lote de proyectos (respaldo, rescate, importación).
 * CANDADO: nunca borra lo que ya existe; combina por `code`, que es la
 * identidad real entre dispositivos (el `id` del admin es `-Date.now()`, o
 * sea distinto en cada aparato: deduplicar por id mezcla proyectos ajenos).
 */
export async function restoreProjects(incoming: TechnicalProject[]): Promise<{
  added: number;
  updated: number;
  skipped: number;
}> {
  const porCodigo = new Map<string, TechnicalProject>();
  getFallbackProjects().forEach(p => {
    if (p.code) porCodigo.set(p.code, p);
  });

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of incoming) {
    if (!raw || !Array.isArray(raw.spaces)) {
      skipped++;
      continue;
    }
    const existente = raw.code ? porCodigo.get(raw.code) : undefined;
    if (!existente) {
      addFallbackProject({ ...raw, id: undefined });
      added++;
      continue;
    }
    // Gana el más reciente, pero las fotos NUNCA se pierden: la copia de la
    // nube trae evidencia con dataUrl vacío y no debe pisar a la buena.
    const gana = (raw.updatedAt || 0) > (existente.updatedAt || 0) ? raw : existente;
    const fusionado = injertarFotos(gana, gana === raw ? existente : raw);
    saveFallbackProject({ ...fusionado, id: existente.id });
    updated++;
  }

  await flushWrites();
  return { added, updated, skipped };
}

/** Copia al proyecto `base` las evidencias con foto real que solo tiene `otro`. */
function injertarFotos(base: TechnicalProject, otro: TechnicalProject): TechnicalProject {
  const conFoto = new Map<string, TechnicalProject['spaces'][0]['windows'][0]['evidence'][0]>();
  otro.spaces?.forEach(space =>
    space.windows?.forEach(win =>
      (win.evidence || []).forEach(ev => {
        if (ev.photoId || (ev.dataUrl && ev.dataUrl.length > 100)) conFoto.set(ev.id, ev);
      }),
    ),
  );
  if (conFoto.size === 0) return base;

  return {
    ...base,
    spaces: (base.spaces || []).map(space => ({
      ...space,
      windows: (space.windows || []).map(win => {
        const existentes = new Set((win.evidence || []).map(ev => ev.id));
        const recuperadas = (win.evidence || []).map(ev => {
          const tieneFoto = ev.photoId || (ev.dataUrl && ev.dataUrl.length > 100);
          const mejor = conFoto.get(ev.id);
          return !tieneFoto && mejor ? mejor : ev;
        });
        // Evidencias que solo existen en la otra copia.
        const faltantes = [...conFoto.values()].filter(ev => !existentes.has(ev.id));
        return { ...win, evidence: [...recuperadas, ...faltantes] };
      }),
    })),
  };
}

// ──────────────────────────────── Hooks ─────────────────────────────────────

function useMirror() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, []);
  return version;
}

export function useFallbackTrashSummaries() {
  const version = useMirror();
  return useMemo(
    () =>
      getFallbackProjects()
        .filter(project => (project.deletedAt || 0) > 0)
        .map(projectToSummary)
        .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)),
    [version],
  );
}

export function useFallbackProject(id?: string) {
  const numericId = Number(id);
  const version = useMirror();
  return useMemo(
    () => getFallbackProject(numericId) || getCloudProjectCache(numericId),
    [numericId, version],
  );
}

export function useFallbackSummaries() {
  const version = useMirror();
  return useMemo(
    () =>
      getFallbackProjects()
        .filter(project => (project.deletedAt || 0) === 0)
        .map(projectToSummary)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [version],
  );
}

export function useFallbackActiveProjects() {
  const version = useMirror();
  return useMemo(
    () =>
      getFallbackProjects()
        .filter(project => (project.deletedAt || 0) === 0)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [version],
  );
}

// ──────────────────────────────── Catálogo ──────────────────────────────────
// El catálogo pesa unos pocos KB y se sigue guardando en localStorage, que
// ahora está prácticamente vacío porque los proyectos y las fotos se fueron.

export function getFallbackCatalog(): TechnicalCatalog {
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY) || window.sessionStorage.getItem(CATALOG_KEY);
    return normalizeFallbackCatalog(raw ? (JSON.parse(raw) as TechnicalCatalog) : DEFAULT_CATALOG);
  } catch {
    return normalizeFallbackCatalog(DEFAULT_CATALOG);
  }
}

export function saveFallbackCatalog(patch: Partial<TechnicalCatalog>) {
  const next = normalizeFallbackCatalog({ ...getFallbackCatalog(), ...patch, lastUpdatedAt: Date.now() });
  try {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('No se pudo guardar el catálogo', error);
    toast('error', 'No se pudo guardar el catálogo. Liberá espacio en el dispositivo.', 'catalog-error');
  }
  window.dispatchEvent(new CustomEvent(CATALOG_CHANGE_EVENT));
}

export function useFallbackCatalog() {
  const [catalog, setCatalog] = useState<TechnicalCatalog>(() => getFallbackCatalog());
  useEffect(() => {
    const refresh = () => setCatalog(getFallbackCatalog());
    window.addEventListener(CATALOG_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CATALOG_CHANGE_EVENT, refresh);
  }, []);
  return catalog;
}

export function normalizeFallbackCatalog(catalog: TechnicalCatalog): TechnicalCatalog {
  return {
    ...DEFAULT_CATALOG,
    ...catalog,
    systems: catalog.systems !== undefined ? catalog.systems : DEFAULT_CATALOG.systems,
    fabrics: catalog.fabrics !== undefined ? catalog.fabrics : DEFAULT_CATALOG.fabrics,
    colors: catalog.colors !== undefined ? catalog.colors : DEFAULT_CATALOG.colors,
    mounts: catalog.mounts !== undefined ? catalog.mounts : DEFAULT_CATALOG.mounts,
    surfaces: catalog.surfaces !== undefined ? catalog.surfaces : DEFAULT_CATALOG.surfaces,
    openingTypes: catalog.openingTypes !== undefined ? catalog.openingTypes : DEFAULT_CATALOG.openingTypes,
    shapes: catalog.shapes !== undefined ? catalog.shapes : DEFAULT_CATALOG.shapes,
    customWindowFields: catalog.customWindowFields !== undefined ? catalog.customWindowFields : DEFAULT_CATALOG.customWindowFields,
    siteConditions: catalog.siteConditions !== undefined ? catalog.siteConditions : DEFAULT_CATALOG.siteConditions,
    lastUpdatedAt: catalog.lastUpdatedAt || Date.now(),
  };
}

// ──────────────────────────────── Resumen ───────────────────────────────────

function projectToSummary(project: TechnicalProject): ProjectSummary {
  const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
    ...s,
    windows: s.windows.filter(w => !w.isExcluded),
  }));
  const windowsCount = activeSpaces.reduce((sum, space) => sum + space.windows.length, 0);
  const solutionsCount = activeSpaces.reduce((sum, space) => sum + space.windows.reduce((winSum, window) => winSum + window.solutions.length, 0), 0);
  const subtotalEstimate = activeSpaces.reduce((sum, space) =>
    sum + space.windows.reduce((wSum, win) =>
      wSum + win.solutions.reduce((sSum, sol) => sSum + solutionTotal(sol), 0)
    , 0)
  , 0);

  const discountAmount = subtotalEstimate * ((project.discountPercent || 0) / 100);
  const totalEstimate = subtotalEstimate - discountAmount;

  const totalAreaM2 = activeSpaces.reduce((sum, space) =>
    sum + space.windows.reduce((wSum, win) =>
      wSum + win.solutions.reduce((sSum, sol) => sSum + (sol.itemType !== 'maintenance' ? solutionArea(sol) : 0), 0)
    , 0)
  , 0);

  const systemTotals = activeSpaces.reduce((acc, space) => {
    space.windows.forEach(win => {
      win.solutions.forEach(sol => {
        const sys = sol.system || 'Sin sistema';
        if (!acc[sys]) acc[sys] = { area: 0, price: 0 };
        if (sol.itemType !== 'maintenance') acc[sys].area += solutionArea(sol);
        acc[sys].price += solutionTotal(sol);
      });
    });
    return acc;
  }, {} as Record<string, { area: number; price: number }>);

  return {
    projectId: project.id!,
    code: project.code,
    clientName: project.clientName,
    siteName: project.siteName,
    address: project.address,
    status: project.status,
    isClone: project.isClone,
    spacesCount: activeSpaces.length,
    windowsCount,
    solutionsCount,
    totalEstimate,
    totalAreaM2,
    systemTotals,
    createdAt: project.createdAt || project.updatedAt,
    contactPhone: project.contactPhone,
    deletedAt: project.deletedAt || 0,
    updatedAt: project.updatedAt,
    synced: false,
    sentToSupplier: project.sentToSupplier,
    discountPercent: project.discountPercent,
  };
}

/**
 * Compatibilidad: antes recomprimía las fotos gigantes para que el store
 * cupiera en 5 MB. Ya no hace falta — las fotos no están en localStorage y se
 * comprimen al entrar. Se conserva el export porque hay llamadas vivas.
 */
export async function autoCompressOldEvidence() {
  return;
}
