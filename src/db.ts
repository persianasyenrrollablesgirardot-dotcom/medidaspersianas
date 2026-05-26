import Dexie, { type Table } from 'dexie';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject, SyncQueueItem } from './types';

const DB_NAME = 'AppCampoJunoMobileV3DB';

export const DEFAULT_CATALOG: TechnicalCatalog = {
  systems: ['Enrollables', 'Blackout', 'Screen Solar', 'Sheer Elegance', 'Panel Japones', 'Romana', 'Vertical', 'Hannas', 'Toldo Romano', 'Riel'],
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
  lastUpdatedAt: Date.now(),
};

class TechnicalFieldDB extends Dexie {
  projects!: Table<TechnicalProject, number>;
  projectSummaries!: Table<ProjectSummary, number>;
  catalog!: Table<TechnicalCatalog, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, status, createdAt',
    });
  }
}

export const db = new TechnicalFieldDB();

export async function resetLocalAppData() {
  db.close();
  await Promise.all([
    Dexie.delete(DB_NAME),
    Dexie.delete('AppCampoJunoStableDB'),
    Dexie.delete('AppTecnicaCampoJunoDB'),
  ]);
  window.location.reload();
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

  const fortyDaysAgo = Date.now() - (40 * 24 * 60 * 60 * 1000);
  const expired = await db.projects.where('deletedAt').belowOrEqual(fortyDaysAgo).and(project => (project.deletedAt || 0) > 0).primaryKeys();
  if (expired.length > 0) await db.projects.bulkDelete(expired as number[]);
  const expiredSummaries = await db.projectSummaries.where('deletedAt').belowOrEqual(fortyDaysAgo).and(project => (project.deletedAt || 0) > 0).primaryKeys();
  if (expiredSummaries.length > 0) await db.projectSummaries.bulkDelete(expiredSummaries as number[]);
});

function normalizeCatalog(catalog: TechnicalCatalog): Partial<TechnicalCatalog> {
  return {
    systems: catalog.systems?.length ? catalog.systems : DEFAULT_CATALOG.systems,
    fabrics: catalog.fabrics?.length ? catalog.fabrics : DEFAULT_CATALOG.fabrics,
    colors: catalog.colors?.length ? catalog.colors : DEFAULT_CATALOG.colors,
    mounts: catalog.mounts?.length ? catalog.mounts : DEFAULT_CATALOG.mounts,
    surfaces: catalog.surfaces?.length ? catalog.surfaces : DEFAULT_CATALOG.surfaces,
    openingTypes: catalog.openingTypes?.length ? catalog.openingTypes : DEFAULT_CATALOG.openingTypes,
    shapes: catalog.shapes?.length ? catalog.shapes : DEFAULT_CATALOG.shapes,
    customWindowFields: catalog.customWindowFields?.length ? catalog.customWindowFields : DEFAULT_CATALOG.customWindowFields,
    siteConditions: catalog.siteConditions?.length ? catalog.siteConditions : DEFAULT_CATALOG.siteConditions,
    lastUpdatedAt: Date.now(),
  };
}
