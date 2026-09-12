import Dexie, { type Table } from 'dexie';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject, SyncQueueItem, InvoiceRecord, ReceiptRecord, PhotoRecord, BackupRecord, TrashedItem } from './types';
import type { GateEvent } from './lib/puertas';
import type { TrackingEvent } from './lib/seguimiento';
import type { CasoGarantia } from './lib/garantia';
import type { CapturaEvidencia } from './lib/evidencias';
import { siguienteConsecutivo } from './lib/registrosRespaldo';
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
  projectEvents!: Table<GateEvent, number>;
  trackingEvents!: Table<TrackingEvent, number>;
  warrantyCases!: Table<CasoGarantia, number>;
  evidenceCaptures!: Table<CapturaEvidencia, number>;

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
    // v6: bitácora de puertas. Seis de los puntos donde el proyecto se detiene —aprobar
    // el precio, validar el abono, autorizar un descuento, aprobar un cambio con la
    // producción iniciada, verificar medidas antes de taladrar y entregar la capacitación—
    // se hacían y no quedaba constancia de ninguno. El paso existía y nadie podía probar
    // después que se cumplió, que es exactamente lo que hace falta cuando llega un reclamo.
    //
    // Es append-only: `bitacora.ts` no expone update ni delete. Para enmendar se agrega un
    // evento con `corrigeA`. Ver `puertas.ts` para el catálogo y el porqué.
    //
    // Solo AGREGA tabla. Las existentes se repiten idénticas: los proyectos del admin
    // viven únicamente en este dispositivo y no hay respaldo completo en la nube.
    this.version(6).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, refId, status, nextAttemptAt, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status',
      photos: 'id, projectId, projectCode, createdAt, uploadedAt',
      backups: '++id, createdAt, reason',
      trash: '++id, projectId, kind, deletedAt',
      projectEvents: '++id, projectId, projectCode, etapa, at',
    });
    // v7: seguimiento del pedido. `ProjectStatus` termina en `ready_for_fabrication` y no
    // sabe nada de lo que pasa despues: si el pedido salio al proveedor, si esta en
    // produccion, si quedo retenido, si se entrego o si ya esta instalado. Tampoco habia
    // forma de registrar como salio una visita.
    //
    // Va en su PROPIO eje, no ampliando `ProjectStatus`: ese responde "que tan completo
    // esta el levantamiento" y este "donde va el pedido". Un proyecto puede estar
    // ready_for_fabrication y en_produccion a la vez. Mezclarlos habria obligado a los
    // filtros del Dashboard a decidir de que lado cae `retenido`, y no hay respuesta buena.
    //
    // Append-only como la bitacora: el estado vigente es el ultimo evento y los anteriores
    // quedan. No alcanza con saber que algo esta instalado; hace falta poder decir cuando
    // entro a produccion y por que estuvo frenado. Un campo mutable borraria eso cada vez.
    //
    // Solo AGREGA tabla.
    this.version(7).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, refId, status, nextAttemptAt, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status',
      photos: 'id, projectId, projectCode, createdAt, uploadedAt',
      backups: '++id, createdAt, reason',
      trash: '++id, projectId, kind, deletedAt',
      projectEvents: '++id, projectId, projectCode, etapa, at',
      trackingEvents: '++id, projectId, projectCode, tipo, estado, at',
    });
    // v8: casos de posventa y garantia. No habia donde registrar un reclamo, su causa ni
    // que se le respondio al cliente — y la respuesta es justamente lo que hace falta
    // probar meses despues.
    //
    // A diferencia de las dos tablas anteriores, esta NO es append-only: un caso es un
    // pendiente que se abre y se cierra, no un hecho que ya paso. Lo que si se congela es
    // el veredicto de cobertura al abrirlo, para que un cambio de regla no reescriba lo
    // que se prometio aquel dia. Ver `garantia.ts`.
    //
    // Solo AGREGA tabla.
    this.version(8).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, refId, status, nextAttemptAt, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status',
      photos: 'id, projectId, projectCode, createdAt, uploadedAt',
      backups: '++id, createdAt, reason',
      trash: '++id, projectId, kind, deletedAt',
      projectEvents: '++id, projectId, projectCode, etapa, at',
      trackingEvents: '++id, projectId, projectCode, tipo, estado, at',
      warrantyCases: '++id, projectId, projectCode, abiertoEl, cerradoEl',
    });
    // v9: capturas de evidencia. El proveedor no responde una garantia con buena voluntad:
    // pide foto de la caja, foto por persiana, imagen con la persiana nivelada y lista de
    // empaque que coincida. Si falta una, el caso no arranca y nadie avisa.
    //
    // Registrar "el paso se hizo" no alcanzaba: hay que tener el artefacto. Y seis de las
    // catorce son ANTICIPADAS — se capturan cuando no hay ningun problema, porque el dia que
    // hagan falta ya no se van a poder tomar. La caja se bota al abrirla; la observacion en
    // la guia solo se escribe al firmar.
    //
    // El catalogo NO vive aca: lo genera la base de conocimiento en `evidenciasCatalogo.ts`.
    //
    // Solo AGREGA tabla.
    this.version(9).stores({
      projects: '++id, code, clientName, status, createdAt, updatedAt, deletedAt, synced',
      projectSummaries: '++id, &projectId, code, clientName, status, updatedAt, deletedAt, synced',
      catalog: '++id',
      syncQueue: '++id, type, refId, status, nextAttemptAt, createdAt',
      invoices: '++id, type, documentNumber, clientName, date',
      receipts: '++id, projectId, projectCode, clientName, date, status',
      photos: 'id, projectId, projectCode, createdAt, uploadedAt',
      backups: '++id, createdAt, reason',
      trash: '++id, projectId, kind, deletedAt',
      projectEvents: '++id, projectId, projectCode, etapa, at',
      trackingEvents: '++id, projectId, projectCode, tipo, estado, at',
      warrantyCases: '++id, projectId, projectCode, abiertoEl, cerradoEl',
      evidenceCaptures: '++id, projectId, projectCode, evidencia, at',
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

/**
 * Proximo consecutivo. Se calcula sobre el MAXIMO numero, no sobre el ultimo id.
 *
 * Antes tomaba la fila con el id mas alto y le sumaba uno. Eso funciona mientras el orden
 * de insercion coincida con el orden de los numeros, y deja de funcionar en cuanto se
 * restaura un respaldo: las facturas viejas entran con ids nuevos, asi que la ultima por
 * id pasa a ser una vieja por numero, y el siguiente consecutivo seria uno que YA existe.
 * Dos facturas con el mismo numero es un problema de verdad. Mirando el maximo, el orden
 * de insercion deja de importar. La logica y su prueba estan en `registrosRespaldo.ts`.
 */
export async function generateDocumentSequence(type: 'COTIZACION' | 'FACTURA'): Promise<string> {
  const documentos = await db.invoices.where('type').equals(type).toArray();
  return siguienteConsecutivo(documentos, type);
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
