import Dexie, { type Table } from 'dexie';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject, SyncQueueItem, InvoiceRecord, ReceiptRecord, PhotoRecord, BackupRecord, TrashedItem } from './types';
import { DEFAULT_MAINTENANCE_CATALOG } from './lib/defaultTasks';

const DB_NAME = 'AppCampoJunoMobileV3DB';

export const DEFAULT_CATALOG: TechnicalCatalog = {
  systems: ['Enrollables Blackout', 'Enrollables Screen', 'Sheer Elegance', 'Panel Japones', 'Vertical', 'Horizontal Aluminio', 'Madera'],
  fabrics: ['Blackout', 'Screen 1%', 'Screen 3%', 'Screen 5%', 'Decorativa', 'Sheer', 'Traslucida'],
  colors: ['Blanco', 'Negro', 'Gris', 'Marfil', 'Beige', 'Cafe'],
  mounts: ['Interna entre vano', 'Externa a pared', 'A techo', 'Sobre marco', 'Mixta'],
  surfaces: ['Concreto', 'Drywall', 'Madera', 'Aluminio', 'Baldosa', 'Desconocida'],
  openingTypes: ['Corrediza', 'Batiente', 'Fija', 'Puerta ventana', 'Esquinera', 'Panoramica'],
  shapes: ['Rectangular', 'Irregular', 'A 45 grados', 'Curva', 'Con arco', 'Descuadrada'],
  customWindowFields: [],
  siteConditions: [
    { label: 'Pared desnivelada', severity: 'medium' },
    { label: 'Humedad visible', severity: 'high' },
    { label: 'Drywall o superficie debil', severity: 'high' },
    { label: 'Manija sobresalida', severity: 'medium' },
    { label: 'Reja u obstaculo', severity: 'medium' },
    { label: 'Punto electrico pendiente', severity: 'high' },
    { label: 'Obra en curso o polvo', severity: 'medium' },
  ],
  maintenanceCatalog: DEFAULT_MAINTENANCE_CATALOG,
  lastUpdatedAt: Date.now(),
};

class TechnicalFieldDB extends Dexie {
  projects!: Table<TechnicalProject, number>;
  projectSummaries!: Table<ProjectSummary, number>;
  catalog!: Table<TechnicalCatalog, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  invoices!: Table<InvoiceRecord, number>;
  receipts!: Table<ReceiptRecord, number>;
  photos!: Table<PhotoRecord, string>;
  backups!: Table<BackupRecord, number>;
  trash!: Table<TrashedItem, number>;

  constructor() {
    super(DB_NAME);
    this.version(2).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, status, createdAt',
      invoices: '++id, type, documentNumber, clientName, date'
    });
    this.version(3).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, status, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status'
    });
    // v4: los proyectos del admin dejan de vivir en UNA clave de localStorage
    // (tope duro de ~5 MB) y pasan acá, una fila por proyecto. Las fotos salen
    // del proyecto a su propia tabla, como Blob. Ver `localFallbackStore.ts`.
    this.version(4).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, refId, status, nextAttemptAt, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status',
      photos: 'id, projectId, projectCode, createdAt, uploadedAt',
      backups: '++id, createdAt, reason',
    });
    // v5: papelera de SUB-elementos (espacio / ventana / persiana / foto).
    // Antes borrar un espacio o una ventana era definitivo y sin aviso: el
    // filter() los sacaba del proyecto y no quedaba copia en ningun lado.
    this.version(5).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, refId, status, nextAttemptAt, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status',
      photos: 'id, projectId, projectCode, createdAt, uploadedAt',
      backups: '++id, createdAt, reason',
      trash: '++id, projectId, kind, deletedAt',
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

  // La purga automática de la papelera quedó DESACTIVADA a propósito.
  // Ver la nota en `cleanupExpiredProjects`.
});

/**
 * DESACTIVADA. Borraba sin avisar todo lo que llevara 40 días en la papelera.
 *
 * Tenía sentido cuando el store cabía en 5 MB y había que hacer lugar. Ahora
 * los proyectos viven en IndexedDB (cuota mucho mayor) y las fotos ni siquiera
 * están dentro del proyecto, así que la papelera no le pesa a nadie. Borrar en
 * silencio es justamente lo que hay que evitar acá: la papelera es la última
 * red antes de perder algo de verdad.
 *
 * El borrado definitivo sigue disponible, pero explícito, desde la Papelera.
 */
export async function cleanupExpiredProjects() {
  return;
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
    maintenanceCatalog: catalog.maintenanceCatalog !== undefined ? catalog.maintenanceCatalog : DEFAULT_CATALOG.maintenanceCatalog,
    lastUpdatedAt: Date.now(),
  };
}
