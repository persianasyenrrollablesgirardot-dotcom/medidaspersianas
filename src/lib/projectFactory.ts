import type { TechnicalProject, TechnicalSolution, WindowRecord } from '../types';
import { projectCode, uid } from './ids';

export function newProject(): TechnicalProject {
  const now = Date.now();
  return {
    code: projectCode(),
    clientName: '',
    status: 'draft',
    spaces: [newSpace('Sala')],
    createdAt: now,
    updatedAt: now,
    deletedAt: 0,
    synced: false,
  };
}

export function newSpace(name = 'Ambiente') {
  return { id: uid('space'), name, windows: [] };
}

export function newWindow(label = 'Ventana 1'): WindowRecord {
  return {
    id: uid('window'),
    label,
    geometry: {},
    siteConditions: [],
    evidence: [],
    solutions: [],
  };
}

export function newSolution(name = 'Solucion tecnica', layer: TechnicalSolution['layer'] = 'inside'): TechnicalSolution {
  return {
    id: uid('solution'),
    itemType: 'blind',
    name,
    layer,
    system: 'Enrollables',
    drive: 'manual',
    quickQuote: { width: 0, height: 0, quantity: 1 },
    assembly: {},
    divisions: [],
    accessories: [],
    status: 'quick',
    alerts: [],
  };
}

export function newMaintenance(system = 'Enrollables'): TechnicalSolution {
  return {
    id: uid('solution'),
    itemType: 'maintenance',
    name: 'Servicio Mantenimiento',
    layer: 'inside', // placeholder
    system,
    drive: 'none',
    assembly: {},
    divisions: [],
    accessories: [],
    status: 'quick',
    alerts: [],
    maintenance: {
      tasks: [],
    },
  };
}
