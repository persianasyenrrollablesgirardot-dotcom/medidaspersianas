import Dexie, { type Table } from 'dexie';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject, SyncQueueItem, InvoiceRecord } from './types';
import { DEFAULT_MAINTENANCE_TASKS } from './lib/defaultTasks';

const DB_NAME = 'AppCampoJunoMobileV3DB';

export const DEFAULT_CATALOG: TechnicalCatalog = {
  systems: ['Enrollables Blackout', 'Enrollables Screen', 'Sheer Elegance', 'Panel Japones', 'Vertical', 'Horizontal Aluminio', 'Madera'],
  fabrics: ['Blackout', 'Screen 1%', 'Screen 3%', 'Screen 5%', 'Decorativa', 'Sheer', 'Traslucida'],
  colors: ['Blanco', 'Negro', 'Gris', 'Marfil', 'Beige', 'Cafe'],
  mounts: ['Interna entre vano', 'Externa a pared', 'A techo', 'Sobre marco', 'Mixta'],
  surfaces: ['Concreto', 'Drywall', 'Madera', 'Aluminio', 'Baldosa', 'Desconocida'],
  openingTypes: ['Corrediza', 'Batiente', 'Fija', 'Puerta ventana', 'Esquinera', 'Panoramica'],
  shapes: ['Rectangular', 'Irregular', 'A 45 grados', 'Curva', 'Con arco', 'Descuadrada'],
  customWindowFields: [
    { id: 'marco', label: 'Tipo de marco', options: ['Aluminio', 'Madera', 'PVC', 'Sin marco definido'] },
    { id: 'condicion_especial', label: 'Condicion especial', options: ['Ninguna', 'Esquinera', 'Muy alta', 'Dificil acceso', 'Requiere validacion'] },
  ],
  siteConditions: [
    { label: 'Pared desnivelada', severity: 'medium' },
    { label: 'Humedad visible', severity: 'high' },
    { label: 'Drywall o superficie debil', severity: 'high' },
    { label: 'Manija sobresalida', severity: 'medium' },
    { label: 'Reja u obstaculo', severity: 'medium' },
    { label: 'Punto electrico pendiente', severity: 'high' },
    { label: 'Obra en curso o polvo', severity: 'medium' },
  ],
  maintenanceTasks: DEFAULT_MAINTENANCE_TASKS,
  lastUpdatedAt: Date.now(),
};

class TechnicalFieldDB extends Dexie {
  projects!: Table<TechnicalProject, number>;
  projectSummaries!: Table<ProjectSummary, number>;
  catalog!: Table<TechnicalCatalog, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  invoices!: Table<InvoiceRecord, number>;

  constructor() {
    super(DB_NAME);
    this.version(2).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, status, createdAt',
      invoices: '++id, type, documentNumber, clientName, date'
    });
  }
}

export const db = new TechnicalFieldDB();
let storageReadyPromise: Promise<void> | undefined;

export function ensureStorageReady() {
  if (!storageReadyPromise) {
    storageReadyPromise = db.open().then(() => undefined).catch(error => {
      storageReadyPromise = undefined;
      throw error;
    });
  }
  return storageReadyPromise;
}

export async function generateDocumentSequence(type: 'COTIZACION' | 'FACTURA'): Promise<string> {
  const prefix = type === 'COTIZACION' ? 'COT-' : 'FAC-';
  const lastRecord = await db.invoices
    .where('type')
    .equals(type)
    .reverse()
    .sortBy('id')
    .then(arr => arr[0]);

  if (!lastRecord || !lastRecord.documentNumber) {
    return `${prefix}0001`;
  }
  
  const lastNumber = parseInt(lastRecord.documentNumber.replace(prefix, ''), 10);
  const nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}

export async function resetLocalAppData() {
  db.close();
  await Promise.all([
    Dexie.delete(DB_NAME),
    Dexie.delete('AppCampoJunoStableDB'),
    Dexie.delete('AppTecnicaCampoJunoDB'),
  ]);
  window.location.reload();
}

export async function repairLocalAppStorage() {
  db.close();
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }
  await Promise.all([
    Dexie.delete(DB_NAME),
    Dexie.delete('AppCampoJunoStableDB'),
    Dexie.delete('AppTecnicaCampoJunoDB'),
  ]);
  window.location.replace(`/?reparado=${Date.now()}`);
}

export async function clearPwaCacheOnly() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }
  window.location.replace(`/?cacheCleared=${Date.now()}`);
}

db.on('blocked', () => {
  window.dispatchEvent(new CustomEvent('juno-storage-blocked'));
});

db.on('versionchange', () => {
  db.close();
  window.location.reload();
});

db.on('ready', async () => {
  const count = await db.catalog.count();
  if (count === 0) await db.catalog.add({ ...DEFAULT_CATALOG });
  else {
    const catalog = await db.catalog.toCollection().first();
    if (catalog) {
      await db.catalog.update(catalog.id!, normalizeCatalog(catalog));
    }
  }

  window.setTimeout(() => {
    cleanupExpiredProjects().catch(error => console.error('No se pudo limpiar papelera vencida', error));
  }, 2500);
});

async function cleanupExpiredProjects() {
  const fortyDaysAgo = Date.now() - (40 * 24 * 60 * 60 * 1000);
  const expired = await db.projects.where('deletedAt').belowOrEqual(fortyDaysAgo).and(project => (project.deletedAt || 0) > 0).primaryKeys();
  if (expired.length > 0) await db.projects.bulkDelete(expired as number[]);
  const expiredSummaries = await db.projectSummaries.where('deletedAt').belowOrEqual(fortyDaysAgo).and(project => (project.deletedAt || 0) > 0).primaryKeys();
  if (expiredSummaries.length > 0) await db.projectSummaries.bulkDelete(expiredSummaries as number[]);
}

function normalizeCatalog(catalog: TechnicalCatalog): Partial<TechnicalCatalog> {
  return {
    systems: catalog.systems !== undefined ? catalog.systems : DEFAULT_CATALOG.systems,
    fabrics: catalog.fabrics !== undefined ? catalog.fabrics : DEFAULT_CATALOG.fabrics,
    colors: catalog.colors !== undefined ? catalog.colors : DEFAULT_CATALOG.colors,
    mounts: catalog.mounts !== undefined ? catalog.mounts : DEFAULT_CATALOG.mounts,
    surfaces: catalog.surfaces !== undefined ? catalog.surfaces : DEFAULT_CATALOG.surfaces,
    openingTypes: catalog.openingTypes !== undefined ? catalog.openingTypes : DEFAULT_CATALOG.openingTypes,
    shapes: catalog.shapes !== undefined ? catalog.shapes : DEFAULT_CATALOG.shapes,
    customWindowFields: catalog.customWindowFields !== undefined ? catalog.customWindowFields : DEFAULT_CATALOG.customWindowFields,
    siteConditions: catalog.siteConditions !== undefined ? catalog.siteConditions : DEFAULT_CATALOG.siteConditions,
    maintenanceTasks: catalog.maintenanceTasks !== undefined ? catalog.maintenanceTasks.map(t => ({ ...t, system: t.system || 'Enrollables' })) : DEFAULT_CATALOG.maintenanceTasks,
    lastUpdatedAt: Date.now(),
  };
}
