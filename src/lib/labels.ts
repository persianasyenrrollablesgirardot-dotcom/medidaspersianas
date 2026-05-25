import type { EvidenceKind } from '../types';

export function evidenceLabel(kind: EvidenceKind) {
  const labels: Record<EvidenceKind, string> = {
    general: 'General',
    measurement: 'Medida',
    obstacle: 'Obstaculo',
    electric: 'Electrico',
    level: 'Nivel',
    detail: 'Detalle',
  };
  return labels[kind];
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    quick_quote: 'Rapida',
    technical_pending: 'Tecnica pendiente',
    ready_for_fabrication: 'Lista fabricacion',
    archived: 'Archivado',
    quick: 'Rapida',
    needs_review: 'Revisar',
    blocked: 'Bloqueada',
  };
  return labels[status] || status;
}
