export type ProjectStatus = 'draft' | 'quick_quote' | 'technical_pending' | 'ready_for_fabrication' | 'archived';
export type SolutionStatus = 'quick' | 'technical_pending' | 'needs_review' | 'ready_for_fabrication' | 'blocked';
export type MountLayer = 'inside' | 'outside' | 'wall' | 'ceiling' | 'frame' | 'mixed' | string;
export type InstallSurface = 'concrete' | 'drywall' | 'wood' | 'aluminum' | 'tile' | 'unknown';
export type DriveType = 'manual' | 'motor' | 'none';
export type EvidenceKind = 'general' | 'measurement' | 'obstacle' | 'electric' | 'level' | 'detail';
export type MountPlanId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type QuickWindowMode = 'simple' | 'angle45';

export interface TechnicalProject {
  id?: number;
  code: string;
  clientName: string;
  clientDocument?: string;
  siteName?: string;
  city?: string;
  address?: string;
  contactPhone?: string;
  status: ProjectStatus;
  isClone?: boolean;
  spaces: SpaceRecord[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  synced: boolean;
  sentToSupplier?: boolean;
  discountPercent?: number;
  /**
   * `updatedAt` de la última versión que se confirmó SUBIDA a la nube.
   * Si no coincide con `updatedAt`, el reconciliador lo vuelve a encolar solo.
   * Que se pierda no rompe nada: falla hacia el lado seguro (vuelve a subir).
   */
  cloudSyncedUpdatedAt?: number;
  /**
   * Nombre del documento en la nube. Normalmente es el `code`, que es la
   * identidad real entre dispositivos. Pero en este store hay códigos
   * REPETIDOS (el rescate de julio dejó 28 códigos con 2 a 4 copias), y con el
   * código como nombre del documento todas las copias escriben encima de la
   * misma y solo UNA quedaba respaldada. A las copias extra se les asigna acá
   * un nombre propio (`CODE__2`, `CODE__3`…) para que ninguna quede afuera.
   */
  cloudDocId?: string;
  /**
   * Bajo QUÉ nombre de documento se confirmó la última subida. Sin esto, una
   * copia que ya se había subido con el código pelado y después recibió nombre
   * propio quedaba marcada como "respaldada" bajo un nombre que nunca se
   * escribió. Si falta, se asume el `code` (que es lo que hacía antes).
   */
  cloudSyncedDocId?: string;
  catalogSnapshot?: {
    customWindowFields?: Array<{ id: string; label: string; options: string[] }>;
  };
}

export interface ProjectSummary {
  id?: number;
  projectId: number;
  code: string;
  clientName: string;
  siteName?: string;
  address?: string;
  contactPhone?: string;
  status: ProjectStatus;
  isClone?: boolean;
  spacesCount: number;
  windowsCount: number;
  solutionsCount: number;
  totalEstimate?: number;
  totalAreaM2?: number;
  systemTotals?: Record<string, { area: number; price: number }>;
  createdAt: number;
  deletedAt?: number;
  updatedAt: number;
  synced: boolean;
  sentToSupplier?: boolean;
  discountPercent?: number;
}

export interface SpaceRecord {
  id: string;
  name: string;
  notes?: string;
  isExcluded?: boolean;
  windows: WindowRecord[];
}

export interface WindowRecord {
  id: string;
  label: string;
  openingType?: string;
  shape?: string;
  quickMode?: QuickWindowMode;
  planTemplate?: MountPlanTemplate;
  customFields?: Record<string, string>;
  geometry: WindowGeometry;
  siteConditions: SiteCondition[];
  evidence: EvidenceItem[];
  solutions: TechnicalSolution[];
  notes?: string;
  isExcluded?: boolean;
}

export interface WindowGeometry {
  widthTop?: number;
  widthMiddle?: number;
  widthBottom?: number;
  heightLeft?: number;
  heightCenter?: number;
  heightRight?: number;
  depth?: number;
  angleDegrees?: number;
  levelStatus?: 'level' | 'minor_unlevel' | 'severe_unlevel';
}

export interface SiteCondition {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  notes?: string;
}

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  /**
   * LEGADO. Foto en base64 incrustada en el proyecto. Es lo que hacía reventar
   * el tope de ~5 MB de localStorage. Las fotos nuevas van a la tabla Dexie
   * `photos` como Blob y acá queda ''. Se conserva el campo porque los
   * respaldos viejos y la copia de la nube todavía lo traen.
   */
  dataUrl: string;
  /** Apunta a PhotoRecord.id en la tabla `photos` (fotos nuevas). */
  photoId?: string;
  /** URL pública en Supabase Storage, una vez subida. */
  remoteUrl?: string;
  createdAt: number;
}

/**
 * Una foto guardada como Blob nativo en IndexedDB, FUERA del proyecto.
 * Blob pesa ~33% menos que el mismo contenido en base64 y no pasa por
 * JSON.stringify, que era el cuello de botella real.
 */
export interface PhotoRecord {
  /** Igual al EvidenceItem.id que la referencia. */
  id: string;
  projectId: number;
  projectCode: string;
  blob: Blob;
  mime: string;
  bytes: number;
  createdAt: number;
  /** URL pública en Supabase Storage cuando ya se subió. */
  remoteUrl?: string;
  uploadedAt?: number;
}

/** Snapshot rotativo del store, en un cajón aparte del store vivo. */
export interface BackupRecord {
  id?: number;
  createdAt: number;
  reason: 'diario' | 'manual' | 'pre-migracion' | 'pre-restauracion';
  projectCount: number;
  photoCount: number;
  /** JSON de los proyectos SIN fotos (las fotos viven en `photos`). */
  payload: string;
  bytes: number;
}

/**
 * PAPELERA DE SUB-ELEMENTOS (espacio / ventana / persiana / foto).
 *
 * Los proyectos se mandan a la papelera marcándolos con `deletedAt` y
 * dejándolos en su tabla. Con los sub-elementos NO se puede hacer lo mismo:
 * un espacio "marcado como borrado" seguiría dentro de `project.spaces`, y
 * habría que acordarse de filtrarlo en las ~30 rutas que recorren el
 * proyecto (totales, m2, PDF de fabricación, orden del proveedor, nube,
 * facturación...). Una sola que se olvide = un espacio borrado que se le
 * factura al cliente o que la fábrica produce.
 *
 * Por eso el sub-elemento SALE del proyecto (como hasta ahora) y su copia
 * completa se guarda acá, junto con el contexto para volver a insertarlo en
 * el mismo lugar. El resto de la app no se entera de que existe la papelera.
 */
export interface TrashedItem {
  id?: number;
  kind: 'space' | 'window' | 'solution' | 'evidence';
  /** Proyecto del que salió. Puede ser negativo (proyecto local del admin). */
  projectId: number;
  projectCode: string;
  projectName?: string;
  /** Nombre visible del elemento borrado. */
  label: string;
  /** Ruta legible: "Sala > Ventana 1". */
  context: string;
  /** Padres necesarios para restaurar (según `kind`). */
  spaceId?: string;
  windowId?: string;
  /** Posición original dentro del arreglo del padre. */
  index: number;
  /** Copia completa del elemento (con todo su contenido). */
  payload: SpaceRecord | WindowRecord | TechnicalSolution | EvidenceItem;
  /** Resumen para mostrar sin abrir el payload ("3 ventanas - 5 persianas"). */
  detail?: string;
  deletedAt: number;
}

export interface TechnicalSolution {
  id: string;
  itemType?: 'blind' | 'maintenance';
  name: string;
  layer: MountLayer;
  system: string;
  fabric?: string;
  color?: string;
  mount?: string;
  surface?: InstallSurface;
  drive: DriveType;
  controlSide?: 'left' | 'right' | 'center' | 'none';
  planTemplate?: MountPlanTemplate;
  quickQuote?: QuickQuote;
  assembly: AssemblyParams;
  divisions: DivisionPart[];
  accessories: AccessoryItem[];
  motor?: MotorParams;
  maintenance?: MaintenanceParams;
  status: SolutionStatus;
  alerts: TechnicalAlert[];
  notes?: string;
}

export interface MaintenanceParams {
  tasks: MaintenanceTask[];
}

export interface MaintenanceTask {
  id: string;
  label: string;
  price: number;
  selected: boolean;
}

export interface MountPlanTemplate {
  id: MountPlanId;
  label: string;
  imageUrl: string;
  layout: 'L' | 'U';
  rollDirection: 'front' | 'back';
  solutionCount: number;
  centralDivisions?: number;
  notes?: string;
}

export interface QuickQuote {
  width: number;
  height: number;
  manualArea?: number;
  pricePerM2?: number;
  quantity: number;
  estimatedTotal?: number;
  note?: string;
}

export interface AssemblyParams {
  fabricationWidth?: number;
  fabricationHeight?: number;
  profileColor?: string;
  tubeProfileRail?: string;
  bracketType?: string;
  valance?: string;
  chainColor?: string;
  bottomProfile?: string;
  deductionNotes?: string;
}

export interface DivisionPart {
  id: string;
  label: string;
  width: number;
  height: number;
  controlSide?: 'left' | 'right' | 'center' | 'none';
  notes?: string;
}

export interface AccessoryItem {
  id: string;
  name: string;
  qty: number;
  notes?: string;
}

export interface MotorParams {
  motorSide?: 'left' | 'right';
  powerPoint: 'available' | 'missing' | 'unknown';
  voltage?: string;
  groundPole?: 'yes' | 'no' | 'unknown';
  distanceToPowerM?: number;
  controlChannel?: string;
  wifiNeeded?: boolean;
  headrailSpaceOk?: 'yes' | 'no' | 'unknown';
  notes?: string;
}

export interface TechnicalAlert {
  id: string;
  level: 'info' | 'warning' | 'blocker';
  message: string;
}

export interface TechnicalCatalog {
  id?: number;
  systems: string[];
  fabrics: string[];
  colors: string[];
  mounts: string[];
  surfaces: string[];
  openingTypes: string[];
  shapes: string[];
  customWindowFields: Array<{
    id: string;
    label: string;
    options: string[];
  }>;
  siteConditions: Array<{ label: string; severity: 'low' | 'medium' | 'high' }>;
  maintenanceCatalog: Array<{
    systemName: string;
    displayAs?: 'maintenance' | 'addon';
    services: Array<{ id: string; label: string; defaultPrice: number }>;
  }>;
  lastUpdatedAt: number;
}

export interface SyncQueueItem {
  id?: number;
  type: 'upsert_project' | 'delete_project' | 'upload_photo';
  /** Identidad estable del elemento: `code` del proyecto o id de la foto. */
  refId: string;
  payload: unknown;
  status: 'pending' | 'processing' | 'failed';
  attempts: number;
  lastError?: string;
  /** Backoff: no reintentar antes de este instante. */
  nextAttemptAt: number;
  createdAt: number;
}

export interface InvoiceRecord {
  id?: number;
  type: 'COTIZACION' | 'FACTURA';
  documentNumber: string;
  clientName: string;
  total: number;
  date: number; // timestamp
  formData?: any; // Objeto JSON de la factura para regenerar el PDF
}

export interface ReceiptRecord {
  id?: number;
  projectId: number;
  projectCode: string;
  clientName: string;
  total: number; // Subtotal
  discountPercent?: number; // Discount applied
  abono: number;
  saldo: number;
  date: number; // timestamp
  status: 'open' | 'closed';
}
