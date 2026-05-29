export type ProjectStatus = 'draft' | 'quick_quote' | 'technical_pending' | 'ready_for_fabrication' | 'archived';
export type SolutionStatus = 'quick' | 'technical_pending' | 'needs_review' | 'ready_for_fabrication' | 'blocked';
export type MountLayer = 'inside' | 'outside' | 'wall' | 'ceiling' | 'frame' | 'mixed';
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
}

export interface ProjectSummary {
  id?: number;
  projectId: number;
  code: string;
  clientName: string;
  siteName?: string;
  address?: string;
  status: ProjectStatus;
  isClone?: boolean;
  spacesCount: number;
  windowsCount: number;
  solutionsCount: number;
  totalEstimate?: number;
  deletedAt?: number;
  updatedAt: number;
  synced: boolean;
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
  dataUrl: string;
  createdAt: number;
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
  type: 'upsert_project' | 'delete_project';
  payload: unknown;
  status: 'pending' | 'processing' | 'failed';
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
