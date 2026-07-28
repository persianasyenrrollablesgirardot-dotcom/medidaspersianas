import Dexie from 'dexie';
import { collection, getDocs } from 'firebase/firestore';
import { dbFirestore } from './firebase';
import type { TechnicalProject } from '../types';
import { restoreProjects } from './localFallbackStore';

// Nota: la clave legada `juno_fallback_projects_v1` ya no se escribe. El escaneo
// la sigue encontrando porque recorre TODAS las claves de localStorage, así que
// los datos viejos se siguen rescatando. Ver `localFallbackStore.ts`.

// Nombres de bases IndexedDB conocidas de la historia de la app. Se usan SOLO como
// respaldo si el navegador no soporta indexedDB.databases() (que enumera TODAS).
const KNOWN_DB_NAMES = [
  'AppCampoJunoMobileV3DB', 'AppCampoJunoMobileV2DB', 'AppCampoJunoMobileV1DB', 'AppCampoJunoMobileDB',
  'AppCampoJunoStableDB', 'AppTecnicaCampoJunoDB', 'AppCampoJunoDB',
];

export interface StoreReport {
  /** Etiqueta legible del cajón escaneado. */
  source: string;
  /** true si se pudo leer; false si falló por completo. */
  ok: boolean;
  /** Cuántos proyectos se recuperaron de este cajón. */
  count: number;
  /** true si el contenido estaba dañado/incompleto y hubo que repararlo. */
  repaired?: boolean;
  /** Tamaño aproximado en KB del contenido crudo (para diagnóstico de las 5MB). */
  approxKb?: number;
  /** Nota de diagnóstico (por qué falló, si se reparó, etc.). */
  note?: string;
  /** Proyectos recuperados de este cajón. */
  projects: TechnicalProject[];
}

export interface ScanResult {
  reports: StoreReport[];
  /** Todos los proyectos únicos encontrados en cualquier cajón (deduplicados). */
  merged: TechnicalProject[];
}

/**
 * Rescata objetos JSON completos de un texto que puede estar TRUNCADO/dañado
 * (típico cuando localStorage se llenó a mitad de una escritura). Recorre el
 * arreglo y va extrayendo cada objeto `{...}` que cierre bien; descarta el
 * último si quedó a medias. Así recuperamos TODOS los proyectos completos aunque
 * el archivo entero no sea un JSON válido.
 */
export function salvageArrayObjects(raw: string): any[] {
  const out: any[] = [];
  let i = raw.indexOf('[');
  if (i === -1) return out;
  i++; // saltar el '['
  const n = raw.length;
  while (i < n) {
    while (i < n && (raw[i] === ',' || /\s/.test(raw[i]))) i++;
    if (i >= n || raw[i] === ']') break;
    if (raw[i] !== '{') { i++; continue; }
    let depth = 0;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < n; i++) {
      const c = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
      }
    }
    if (depth === 0) {
      const sub = raw.slice(start, i);
      try { out.push(JSON.parse(sub)); } catch { /* objeto ilegible, se ignora */ }
    } else {
      break; // último objeto truncado: fin del rescate
    }
  }
  return out;
}

/** Valida grosso modo que el objeto parezca un proyecto técnico. */
function looksLikeProject(p: any): p is TechnicalProject {
  if (!p || typeof p !== 'object') return false;
  // Un proyecto tiene espacios (aunque estén vacíos) y algún identificador/nombre.
  if (Array.isArray(p.spaces) && ('code' in p || 'clientName' in p)) return true;
  return false;
}

/**
 * Rescata objetos `{...}` con "spaces" de CUALQUIER punto de un texto, aunque
 * estén incrustados en medio de otra cosa (no solo dentro de un arreglo).
 * Es el carver más agresivo: sirve para respaldos truncados, volcados crudos y
 * archivos que mezclan varios formatos.
 */
export function carveProjects(raw: string): TechnicalProject[] {
  const out: TechnicalProject[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;
    let depth = 0, inStr = false, esc = false, j = i;
    for (; j < raw.length; j++) {
      const c = raw[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { j++; break; } }
      }
    }
    if (depth !== 0) continue;
    const sub = raw.slice(i, j);
    if (!sub.includes('"spaces"')) continue;
    try {
      const o = JSON.parse(sub);
      if (looksLikeProject(o)) { out.push(o); i = j - 1; }
    } catch { /* fragmento ilegible */ }
  }
  return out;
}

/** Extrae proyectos de un texto crudo, ya sea JSON válido o dañado/truncado. */
function projectsFromRaw(raw: string): { projects: TechnicalProject[]; repaired: boolean } {
  let repaired = false;
  let projects: TechnicalProject[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) projects = parsed.filter(looksLikeProject);
    else if (parsed && Array.isArray(parsed.projects)) projects = parsed.projects.filter(looksLikeProject);
    else if (looksLikeProject(parsed)) projects = [parsed];
  } catch {
    repaired = true;
    projects = salvageArrayObjects(raw).filter(looksLikeProject);
  }
  // Red de seguridad: si el parseo "limpio" no encontró nada, o si el archivo
  // guarda los proyectos DENTRO de un string (caso del volcado crudo, donde cada
  // clave de localStorage es texto), carveamos igual.
  if (projects.length === 0) {
    const carved = carveProjects(raw);
    if (carved.length > 0) { projects = carved; repaired = true; }
  }
  return { projects, repaired };
}

/** Recorre TODAS las claves de un Storage y rescata proyectos de cualquiera. */
function scanWebStorage(store: Storage, label: string): StoreReport[] {
  const reports: StoreReport[] = [];
  let keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k) keys.push(k);
    }
  } catch (e: any) {
    return [{ source: label, ok: false, count: 0, projects: [], note: String(e?.message || e) }];
  }
  for (const key of keys) {
    let raw: string | null = null;
    try { raw = store.getItem(key); } catch { continue; }
    if (!raw) continue;
    const approxKb = Math.round(raw.length / 1024);
    // Solo intentamos rescatar de valores que parezcan contener proyectos (tienen "spaces").
    const mightHaveProjects = raw.includes('"spaces"');
    if (!mightHaveProjects) {
      // Reportamos igual las claves grandes (para ver qué ocupa el espacio).
      if (approxKb >= 5) reports.push({ source: `${label} · ${key}`, ok: true, count: 0, approxKb, projects: [], note: 'sin proyectos' });
      continue;
    }
    const { projects, repaired } = projectsFromRaw(raw);
    reports.push({
      source: `${label} · ${key}`,
      ok: true,
      count: projects.length,
      repaired,
      approxKb,
      note: repaired ? `dañado: reparados ${projects.length}` : undefined,
      projects,
    });
  }
  if (reports.length === 0) reports.push({ source: label, ok: true, count: 0, projects: [], note: 'sin datos' });
  return reports;
}

/** Abre una base IndexedDB existente y rescata proyectos de CUALQUIER tabla. */
async function readDexieAllTables(dbName: string): Promise<StoreReport[]> {
  let dexie: Dexie | undefined;
  try {
    // Modo dinámico: abrir una base existente SIN declarar esquema; Dexie lee el real.
    dexie = new Dexie(dbName);
    await dexie.open();
    const tables = dexie.tables;
    if (tables.length === 0) {
      dexie.close();
      return [{ source: `IndexedDB · ${dbName}`, ok: true, count: 0, projects: [], note: 'sin tablas' }];
    }
    const out: StoreReport[] = [];
    for (const t of tables) {
      try {
        const rows = await t.toArray();
        const projects = rows.filter(looksLikeProject);
        if (projects.length > 0 || rows.length > 0) {
          out.push({
            source: `IndexedDB · ${dbName} → ${t.name}`,
            ok: true,
            count: projects.length,
            projects,
            note: projects.length === 0 ? `${rows.length} filas (sin proyectos)` : undefined,
          });
        }
      } catch { /* tabla ilegible, seguir */ }
    }
    dexie.close();
    if (out.length === 0) return [{ source: `IndexedDB · ${dbName}`, ok: true, count: 0, projects: [], note: 'sin datos' }];
    return out;
  } catch {
    try { dexie?.close(); } catch { /* noop */ }
    return [{ source: `IndexedDB · ${dbName}`, ok: true, count: 0, projects: [], note: 'no se pudo abrir' }];
  }
}

/**
 * Escanea TODOS los cajones de almacenamiento del dispositivo: cada clave de
 * localStorage y sessionStorage, y TODAS las bases IndexedDB que existan (enumeradas
 * dinámicamente), tabla por tabla. Devuelve un reporte por cajón + la lista unificada
 * y deduplicada de proyectos. NO escribe ni borra nada.
 */
export async function scanEverything(): Promise<ScanResult> {
  const reports: StoreReport[] = [];

  reports.push(...scanWebStorage(window.localStorage, 'localStorage'));
  try { reports.push(...scanWebStorage(window.sessionStorage, 'sessionStorage')); } catch { /* noop */ }

  // Enumerar TODAS las bases IndexedDB del dispositivo (no una lista adivinada).
  let dbNames: string[] = [];
  try {
    const anyIdb = window.indexedDB as any;
    if (anyIdb && typeof anyIdb.databases === 'function') {
      const list = await anyIdb.databases();
      dbNames = (list || []).map((d: any) => d?.name).filter((n: any): n is string => !!n);
    }
  } catch { /* no soportado */ }
  // Unir con la lista conocida por si databases() no está disponible o se salta alguna.
  const allNames = Array.from(new Set([...dbNames, ...KNOWN_DB_NAMES]));
  for (const name of allNames) {
    reports.push(...await readDexieAllTables(name));
  }

  // Último cajón del navegador: el sistema de archivos privado del origen.
  reports.push(...await scanOpfs());

  return { reports, merged: mergeProjects(reports.flatMap(r => r.projects)) };
}

// ===================== Unificación de versiones =====================

/**
 * Identidad de un proyecto ENTRE DISPOSITIVOS. Se usa el **código** (`TCJ-…`),
 * que viaja con el proyecto a todas partes. El `id` NO sirve: es local de cada
 * dispositivo (el admin usa `-Date.now()`), así que el mismo proyecto tiene ids
 * distintos en el celular y en la PC y deduplicar por id lo duplicaría.
 */
function identidad(p: TechnicalProject): string {
  const code = (p.code || '').trim().toUpperCase();
  if (code) return 'c:' + code;
  if (p.id != null) return 'i:' + p.id;
  return `n:${(p.clientName || '').trim().toLowerCase()}|${p.createdAt || ''}`;
}

/** Cuántas fotos con imagen REAL tiene una lista de evidencia. */
function fotosReales(ev?: { dataUrl?: string }[]): number {
  return (ev || []).filter(e => e && typeof e.dataUrl === 'string' && e.dataUrl.length > 100).length;
}

/** Riqueza estructural (espacios/ventanas/soluciones), sin contar fotos. */
function estructura(p: TechnicalProject): number {
  let n = 0;
  for (const s of p.spaces || []) {
    n += 1;
    for (const w of s.windows || []) n += 1 + (w.solutions?.length || 0);
  }
  return n;
}

function claveVentana(espNombre: string, iEsp: number, winNombre: string, iWin: number) {
  const e = (espNombre || '').trim().toLowerCase() || `esp${iEsp}`;
  const v = (winNombre || '').trim().toLowerCase() || `v${iWin}`;
  return `${e}|${v}`;
}

/**
 * Une todas las versiones halladas de cada proyecto en UNA sola:
 *  - la estructura viene de la versión más completa;
 *  - las fotos se INJERTAN desde cualquier versión que las tenga.
 * Esto último importa porque la copia de la nube trae la evidencia **vacía**
 * (Firestore no admite las imágenes): sin este injerto, elegir esa versión
 * borraría las fotos buenas de otra copia.
 */
export function mergeProjects(todos: TechnicalProject[]): TechnicalProject[] {
  const grupos = new Map<string, TechnicalProject[]>();
  for (const p of todos) {
    const k = identidad(p);
    const g = grupos.get(k);
    if (g) g.push(p); else grupos.set(k, [p]);
  }

  const salida: TechnicalProject[] = [];
  for (const versiones of grupos.values()) {
    const base = versiones.slice().sort((a, b) => estructura(b) - estructura(a))[0];
    const merged: TechnicalProject = JSON.parse(JSON.stringify(base));

    const mejores = new Map<string, any[]>();
    for (const v of versiones) {
      (v.spaces || []).forEach((esp: any, iEsp: number) => (esp.windows || []).forEach((win: any, iWin: number) => {
        const n = fotosReales(win.evidence);
        if (n === 0) return;
        const k = claveVentana(esp.name, iEsp, win.name, iWin);
        if (n > fotosReales(mejores.get(k))) mejores.set(k, win.evidence);
      }));
    }
    (merged.spaces || []).forEach((esp: any, iEsp: number) => (esp.windows || []).forEach((win: any, iWin: number) => {
      const mejor = mejores.get(claveVentana(esp.name, iEsp, win.name, iWin));
      if (mejor && fotosReales(mejor) > fotosReales(win.evidence)) win.evidence = mejor;
    }));

    salida.push(merged);
  }
  return salida.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// ===================== Búsqueda profunda (fuera de la app) =====================

/**
 * Lee archivos que el usuario elija del teléfono (Descargas, documentos de
 * WhatsApp, etc.) y saca los proyectos que haya adentro. Es la vía que llega a
 * datos que la app **no puede ver por sí sola**: los respaldos que ella misma
 * exportó, los que compartiste por WhatsApp, o los de otro dispositivo.
 * Acepta cualquier archivo de texto/JSON, incluso truncado o dañado.
 */
export async function scanArchivos(files: File[]): Promise<StoreReport[]> {
  const reports: StoreReport[] = [];
  for (const file of files) {
    const approxKb = Math.round(file.size / 1024);
    try {
      if (file.size > 60 * 1024 * 1024) {
        reports.push({ source: `Archivo · ${file.name}`, ok: false, count: 0, approxKb, projects: [], note: 'demasiado grande' });
        continue;
      }
      const texto = await file.text();
      if (!texto.includes('"spaces"')) {
        reports.push({ source: `Archivo · ${file.name}`, ok: true, count: 0, approxKb, projects: [], note: 'sin proyectos adentro' });
        continue;
      }
      const { projects, repaired } = projectsFromRaw(texto);
      reports.push({
        source: `Archivo · ${file.name}`,
        ok: true,
        count: projects.length,
        repaired,
        approxKb,
        note: repaired && projects.length ? `rescatados de un archivo dañado` : undefined,
        projects,
      });
    } catch (e: any) {
      reports.push({ source: `Archivo · ${file.name}`, ok: false, count: 0, approxKb, projects: [], note: String(e?.message || e) });
    }
  }
  return reports;
}

/**
 * Trae TODO lo que haya en la nube (Firestore `cloud_projects`), no solo lo que
 * el Dashboard muestra. Son los proyectos que en algún momento se enviaron al
 * proveedor: sobreviven aunque el celular se haya quedado sin memoria, porque
 * viven en otro lado. Ojo: la nube guarda la evidencia **sin la imagen** (límite
 * de 1 MB por documento), por eso el merge injerta las fotos desde las copias
 * locales en vez de dejar que esta versión las pise.
 */
export async function scanNube(): Promise<StoreReport[]> {
  const label = 'Nube · cloud_projects';
  try {
    const snap = await getDocs(collection(dbFirestore, 'cloud_projects'));
    const projects: TechnicalProject[] = [];
    snap.forEach(d => {
      const data = d.data() as any;
      if (looksLikeProject(data)) projects.push(data);
    });
    return [{
      source: label,
      ok: true,
      count: projects.length,
      projects,
      note: projects.length === 0 ? `${snap.size} documentos, ninguno con proyectos` : 'fotos vacías (límite de la nube)',
    }];
  } catch (e: any) {
    const code = e?.code || '';
    const note = code === 'permission-denied'
      ? 'permiso denegado — revisar las reglas de Firestore (vencen a los 30 días)'
      : String(e?.message || e);
    return [{ source: label, ok: false, count: 0, projects: [], note }];
  }
}

/** Sistema de archivos privado del origen (OPFS): otro cajón que casi nadie mira. */
async function scanOpfs(): Promise<StoreReport[]> {
  const out: StoreReport[] = [];
  try {
    const anyStorage = navigator.storage as any;
    if (!anyStorage?.getDirectory) return out;
    const root = await anyStorage.getDirectory();
    if (!root?.entries) return out;
    for await (const [name, handle] of root.entries()) {
      if (handle?.kind !== 'file') continue;
      try {
        const f: File = await handle.getFile();
        if (f.size > 60 * 1024 * 1024) continue;
        const texto = await f.text();
        if (!texto.includes('"spaces"')) continue;
        const { projects, repaired } = projectsFromRaw(texto);
        out.push({ source: `Archivos privados · ${name}`, ok: true, count: projects.length, repaired, approxKb: Math.round(f.size / 1024), projects });
      } catch { /* archivo ilegible */ }
    }
  } catch { /* no soportado */ }
  return out;
}

export interface Diagnostics {
  storageEstimate?: { usageMB: number; quotaMB: number };
  localStorage: { totalKb: number; keys: { key: string; kb: number; hasProjects: boolean }[] };
  sessionStorage: { totalKb: number; keys: { key: string; kb: number; hasProjects: boolean }[] };
  indexedDbs: { name: string; tables: { name: string; rows: number; projects: number }[]; error?: string }[];
  caches: { name: string; entries: number }[];
}

function inspectStorage(store: Storage): Diagnostics['localStorage'] {
  const keys: { key: string; kb: number; hasProjects: boolean }[] = [];
  let totalKb = 0;
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k) continue;
      const v = store.getItem(k) || '';
      const kb = Math.round(v.length / 1024);
      totalKb += kb;
      keys.push({ key: k, kb, hasProjects: v.includes('"spaces"') });
    }
  } catch { /* noop */ }
  keys.sort((a, b) => b.kb - a.kb);
  return { totalKb, keys };
}

/**
 * Diagnóstico COMPLETO de almacenamiento del dispositivo: cuánto ocupa cada cosa,
 * cuánto es data y cuánto es caché de la app. Solo lee, no toca nada. Sirve para
 * saber con certeza dónde quedaron los datos (o qué los reemplazó).
 */
export async function collectDiagnostics(): Promise<Diagnostics> {
  const diag: Diagnostics = {
    localStorage: inspectStorage(window.localStorage),
    sessionStorage: (() => { try { return inspectStorage(window.sessionStorage); } catch { return { totalKb: 0, keys: [] }; } })(),
    indexedDbs: [],
    caches: [],
  };

  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      diag.storageEstimate = {
        usageMB: Math.round((est.usage || 0) / 1024 / 1024 * 10) / 10,
        quotaMB: Math.round((est.quota || 0) / 1024 / 1024),
      };
    }
  } catch { /* noop */ }

  let dbNames: string[] = [];
  try {
    const anyIdb = window.indexedDB as any;
    if (anyIdb?.databases) dbNames = ((await anyIdb.databases()) || []).map((d: any) => d?.name).filter(Boolean);
  } catch { /* noop */ }
  dbNames = Array.from(new Set([...dbNames, ...KNOWN_DB_NAMES]));

  for (const name of dbNames) {
    let dexie: Dexie | undefined;
    try {
      dexie = new Dexie(name);
      await dexie.open();
      const tables: { name: string; rows: number; projects: number }[] = [];
      for (const t of dexie.tables) {
        try {
          const rows = await t.count();
          let projects = 0;
          if (rows > 0) {
            const sample = await t.toArray();
            projects = sample.filter(looksLikeProject).length;
          }
          tables.push({ name: t.name, rows, projects });
        } catch { tables.push({ name: t.name, rows: -1, projects: 0 }); }
      }
      dexie.close();
      if (tables.length > 0) diag.indexedDbs.push({ name, tables });
    } catch {
      try { dexie?.close(); } catch { /* noop */ }
    }
  }

  try {
    if (window.caches) {
      const names = await caches.keys();
      for (const n of names) {
        try {
          const c = await caches.open(n);
          const reqs = await c.keys();
          diag.caches.push({ name: n, entries: reqs.length });
        } catch { /* noop */ }
      }
    }
  } catch { /* noop */ }

  return diag;
}

/**
 * Vuelca el contenido EXACTO, byte por byte, de todo el almacenamiento web
 * (localStorage + sessionStorage), sin interpretarlo. Sirve para analizar la memoria
 * cruda fuera de la app (herramienta forense más potente) y rescatar fragmentos que
 * el lector normal no ve.
 */
export function dumpRawStorage() {
  const grab = (store: Storage) => {
    const out: Record<string, string> = {};
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k) out[k] = store.getItem(k) ?? '';
      }
    } catch { /* noop */ }
    return out;
  };
  return {
    kind: 'juno-raw-storage-dump',
    localStorage: grab(window.localStorage),
    sessionStorage: (() => { try { return grab(window.sessionStorage); } catch { return {}; } })(),
  };
}

/** Descarga un objeto como archivo .json (respaldo que ya no depende de la app). */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface RestoreResult {
  ok: boolean;
  written: number;
  strippedPhotos: boolean;
  error?: string;
}

/**
 * Devuelve los proyectos rescatados al store de la app.
 *
 * ⚠️ ANTES ESTA FUNCIÓN ERA PELIGROSA: hacía
 *      localStorage.setItem(PROJECTS_KEY, JSON.stringify(todos))
 * es decir, REEMPLAZABA la lista entera. Si el escaneo devolvía menos
 * proyectos de los que había, la restauración borraba el resto — el mismo
 * mecanismo que causó la pérdida que vino a reparar. La UI ya prometía
 * "se combinan con los que ya ves (no borra nada)"; ahora es cierto.
 *
 * Delega en `restoreProjects`, que combina por CÓDIGO de proyecto, conserva
 * lo existente e injerta las fotos que falten. Tampoco hace falta ya el
 * plan B de "restaurar sin fotos": las fotos no compiten por los 5 MB.
 */
export async function restoreIntoFallback(projects: TechnicalProject[]): Promise<RestoreResult> {
  const stamped = projects.map(p => ({ ...p, synced: false, updatedAt: p.updatedAt || Date.now() }));
  try {
    const r = await restoreProjects(stamped);
    return { ok: true, written: r.added + r.updated, strippedPhotos: false };
  } catch (e: any) {
    return { ok: false, written: 0, strippedPhotos: false, error: String(e?.message || e) };
  }
}
