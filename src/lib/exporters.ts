import type { TechnicalCatalog, TechnicalProject } from '../types';
import { quoteArea, quoteTotal, solutionArea } from './metrics';
// @ts-ignore
import html2pdf from 'html2pdf.js';

export type PdfReportProfile = 'client' | 'supplier' | 'installer' | 'internal';

const PROFILE_LABELS: Record<PdfReportProfile, string> = {
  client: 'Reporte para cliente',
  supplier: 'Orden para proveedor / fabrica',
  installer: 'Ficha para instalador',
  internal: 'Expediente interno completo',
};

export interface BackupPayload {
  app: 'App_Tecnica_Campo_Juno';
  version: 1;
  exportedAt: number;
  projects: TechnicalProject[];
}

export function buildBackup(projects: TechnicalProject[]): BackupPayload {
  return { app: 'App_Tecnica_Campo_Juno', version: 1, exportedAt: Date.now(), projects };
}

export function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function technicalSummary(project: TechnicalProject): string {
  const lines: string[] = [];
  lines.push('FICHA TECNICA CAMPO JUNO');
  lines.push(`Proyecto: ${project.clientName || 'Sin cliente'}`);
  lines.push(`Codigo: ${project.code}`);
  if (project.siteName) lines.push(`Lugar: ${project.siteName}`);
  if (project.address) lines.push(`Direccion: ${project.address}`);
  lines.push('');

  const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
    ...s,
    windows: s.windows.filter(w => !w.isExcluded)
  }));

  for (const space of activeSpaces) {
    lines.push(`== ${space.name.toUpperCase()} ==`);
    for (const win of space.windows) {
      lines.push(`- ${win.label} | ${win.openingType || 'tipo pendiente'} | ${win.shape || 'forma pendiente'}`);
      for (const sol of win.solutions) {
        lines.push(`  > ${sol.name} [${sol.layer}] ${sol.system} ${sol.fabric || ''}`);
        if (sol.quickQuote) {
          lines.push(`    Cotizacion: ${quoteArea(sol.quickQuote).toFixed(2)} m2 - ${quoteTotal(sol.quickQuote).toLocaleString('es-CO')} COP estimado`);
        }
        lines.push(`    Area: ${solutionArea(sol).toFixed(2)} m2`);
        if (sol.divisions.length) lines.push(`    Divisiones: ${sol.divisions.map(d => `${d.label} ${d.width}x${d.height}`).join(' | ')}`);
        if (sol.alerts.length) lines.push(`    Alertas: ${sol.alerts.map(a => a.message).join(' | ')}`);
        if (sol.notes) lines.push(`    Notas: ${sol.notes}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function csvRows(projects: TechnicalProject[]): string {
  const headers = ['proyecto', 'espacio', 'ventana', 'solucion', 'plano', 'capa', 'sistema', 'tela', 'ancho', 'alto', 'area_tecnica', 'divisiones', 'estado'];
  const rows = [headers];
  for (const project of projects) {
    const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
      ...s,
      windows: s.windows.filter(w => !w.isExcluded)
    }));
    for (const space of activeSpaces) {
      for (const win of space.windows) {
        for (const sol of win.solutions) {
          const plan = sol.planTemplate || win.planTemplate;
          rows.push([
            project.clientName || project.code,
            space.name,
            win.label,
            sol.name,
            plan?.label || '',
            sol.layer,
            sol.system,
            sol.fabric || '',
            String(sol.assembly.fabricationWidth || sol.quickQuote?.width || ''),
            String(sol.assembly.fabricationHeight || sol.quickQuote?.height || ''),
            solutionArea(sol).toFixed(2),
            String(sol.divisions.length),
            sol.status,
          ]);
        }
      }
    }
  }
  return rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
}

export function generateReportHtml(projects: TechnicalProject[], catalog?: TechnicalCatalog, profile: PdfReportProfile = 'internal'): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(PROFILE_LABELS[profile])}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: Arial, sans-serif; color: #111; margin: 0; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    h2 { font-size: 18px; margin: 24px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    h3 { font-size: 15px; margin: 16px 0 6px; }
    p, li, td, th { font-size: 12px; line-height: 1.35; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
    th, td { border: 1px solid #ddd; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f2f2f2; }
    .project { page-break-after: always; }
    .muted { color: #666; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0; }
    .box { border: 1px solid #ddd; border-radius: 4px; padding: 6px; }
    .box span { display: block; color: #666; font-size: 10px; text-transform: uppercase; font-weight: bold; }
    .box strong { display: block; font-size: 12px; overflow-wrap: anywhere; }
    .badge { display: inline-block; border: 1px solid #ddd; border-radius: 999px; padding: 3px 7px; margin: 2px; font-size: 10px; font-weight: bold; color: #444; }
    .note { border: 1px solid #ddd; background: #fafafa; padding: 7px; border-radius: 4px; margin: 6px 0; }
    .plan { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; border: 1px solid #ddd; padding: 6px; margin: 8px 0; }
    .plan img { width: 120px; background: #fff; }
    .photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; break-inside: avoid; }
    .photos img { width: 100%; height: 120px; object-fit: contain; background: #fafafa; border: 1px solid #ddd; border-radius: 4px; }
    .window, .solution-card { break-inside: avoid; }
    .solution-card { border: 1px solid #d9d9d9; border-radius: 6px; padding: 9px; margin: 9px 0 12px; background: #fff; }
    .solution-head { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; }
    .solution-head h4 { font-size: 13px; margin: 0; }
    .solution-head p { margin: 2px 0 0; }
    .solution-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .solution-field { border: 1px solid #e5e5e5; border-radius: 4px; padding: 6px; background: #fafafa; }
    .solution-field span { display: block; color: #666; font-size: 9px; text-transform: uppercase; font-weight: bold; }
    .solution-field strong { display: block; font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
    .solution-block { margin-top: 8px; }
    .solution-block-title { font-size: 10px; text-transform: uppercase; font-weight: bold; color: #444; margin: 0 0 4px; }
    .solution-list { margin: 0; padding-left: 16px; }
    .solution-list li { margin: 2px 0; }
  </style>
  </head>
  <body>
    ${projects.map(project => renderProjectReport(project, catalog, profile)).join('')}
  </body>
</html>`;
}

function renderProjectReport(project: TechnicalProject, catalog: TechnicalCatalog | undefined, profile: PdfReportProfile) {
  const showContact = profile !== 'supplier';
  const showClientId = profile === 'internal';
  const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
    ...s,
    windows: s.windows.filter(w => !w.isExcluded)
  }));
  
  return `
    <section class="project">
      <h1>${escapeHtml(PROFILE_LABELS[profile])}</h1>
      <p class="muted">Codigo: ${escapeHtml(project.code)} - Fecha: ${new Date(project.updatedAt).toLocaleString('es-CO')}</p>
      <p><strong>Cliente / obra:</strong> ${escapeHtml(project.clientName || 'Sin definir')}</p>
      ${showClientId ? `<p><strong>Documento:</strong> ${escapeHtml(project.clientDocument || '')}</p>` : ''}
      ${showContact ? `<p><strong>Telefono:</strong> ${escapeHtml(project.contactPhone || '')}</p>` : ''}
      <p><strong>Lugar:</strong> ${escapeHtml(project.siteName || '')} ${escapeHtml(project.address || '')}</p>
      <div class="grid">
        <div class="box"><span>Espacios</span><strong>${activeSpaces.length}</strong></div>
        <div class="box"><span>Ventanas</span><strong>${activeSpaces.reduce((sum, space) => sum + space.windows.length, 0)}</strong></div>
        <div class="box"><span>Persianas</span><strong>${activeSpaces.reduce((sum, space) => sum + space.windows.reduce((wSum, win) => wSum + win.solutions.length, 0), 0)}</strong></div>
      </div>
      ${activeSpaces.map(space => `
        <h2>${escapeHtml(space.name)}</h2>
        ${space.notes && profile === 'internal' ? `<p class="note"><strong>Nota de espacio:</strong> ${escapeHtml(space.notes)}</p>` : ''}
        ${space.windows.map(win => renderWindowReport(win, catalog, profile)).join('')}
      `).join('')}
    </section>
  `;
}

function renderWindowReport(win: TechnicalProject['spaces'][number]['windows'][number], catalog: TechnicalCatalog | undefined, profile: PdfReportProfile) {
  if (profile === 'client') return renderClientWindow(win);

  const showConditions = profile === 'installer' || profile === 'internal';
  const showPhotos = (profile === 'installer' || profile === 'internal') && win.evidence.length > 0;

  return `
    <h3>${escapeHtml(win.label)} - ${escapeHtml(win.openingType || '')} - ${escapeHtml(win.shape || '')}</h3>
    <p><strong>Vano:</strong> ancho ${formatRaw(win.geometry.widthTop)} / ${formatRaw(win.geometry.widthMiddle)} / ${formatRaw(win.geometry.widthBottom)} - alto ${formatRaw(win.geometry.heightLeft)} / ${formatRaw(win.geometry.heightCenter)} / ${formatRaw(win.geometry.heightRight)} - profundidad ${formatRaw(win.geometry.depth)}</p>
    ${win.planTemplate ? renderPlan(win.planTemplate) : ''}
    ${catalog?.customWindowFields?.length ? `<div class="grid">${catalog.customWindowFields.map(field => `<div class="box"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(win.customFields?.[field.id] || 'Sin definir')}</strong></div>`).join('')}</div>` : ''}
    ${showConditions && win.siteConditions.length ? `<p><strong>Condiciones:</strong> ${win.siteConditions.map(c => `<span class="badge">${escapeHtml(c.label)} | ${escapeHtml(c.severity)}</span>`).join('')}</p>` : ''}
    ${win.notes && profile === 'internal' ? `<p class="note"><strong>Nota ventana:</strong> ${escapeHtml(win.notes)}</p>` : ''}
    ${showPhotos ? `<div class="photos">${win.evidence.map(ev => `<div><img src="${escapeHtml(ev.dataUrl)}" alt="${escapeHtml(ev.label)}"><p class="muted">${escapeHtml(ev.kind)}</p></div>`).join('')}</div>` : ''}
    ${renderTechnicalSolutions(win, profile)}
  `;
}

function renderClientWindow(win: TechnicalProject['spaces'][number]['windows'][number]) {
  const showPhotos = win.evidence.length > 0;
  return `
    <h3>${escapeHtml(win.label)}</h3>
    <table>
      <thead><tr><th>Item</th><th>Producto</th><th>Tela / color</th><th>Cant.</th><th>Total m2</th><th>Valor m2</th><th>Total</th></tr></thead>
      <tbody>
        ${win.solutions.map((sol, index) => {
          const quantity = sol.quickQuote?.quantity || 1;
          const area = (quoteArea(sol.quickQuote) || solutionArea(sol)) * quantity;
          return `
            <tr>
              <td>${escapeHtml(`${win.label} - item ${index + 1}`)}</td>
              <td>${escapeHtml(sol.system)}</td>
              <td>${escapeHtml([sol.fabric, sol.color].filter(Boolean).join(' / ') || 'Por definir')}</td>
              <td>${quantity}</td>
              <td>${area.toFixed(2)} m2</td>
              <td>${sol.quickQuote?.pricePerM2 ? sol.quickQuote.pricePerM2.toLocaleString('es-CO') : '-'}</td>
              <td>${sol.quickQuote ? quoteTotal(sol.quickQuote).toLocaleString('es-CO') : '-'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    ${showPhotos ? `<div class="photos">${win.evidence.map(ev => `<div><img src="${escapeHtml(ev.dataUrl)}" alt="${escapeHtml(ev.label)}"><p class="muted">${escapeHtml(ev.kind)}</p></div>`).join('')}</div>` : ''}
  `;
}

function renderTechnicalSolutions(win: TechnicalProject['spaces'][number]['windows'][number], profile: PdfReportProfile) {
  const includePrice = profile === 'internal';
  const includeAlerts = profile === 'installer' || profile === 'internal';
  const includeProduction = profile === 'supplier' || profile === 'internal';
  return `
    ${win.solutions.map((sol, index) => {
      const plan = sol.planTemplate || win.planTemplate;
      return `
        <article class="solution-card">
          <div class="solution-head">
            <div>
              <h4>${escapeHtml(sol.name || `Persiana ${index + 1}`)}</h4>
              <p class="muted">${escapeHtml(sol.layer)} - ${escapeHtml(sol.status)}</p>
            </div>
            <div><span class="badge">${escapeHtml(sol.system || 'Sistema pendiente')}</span></div>
          </div>
          <div class="solution-grid">
            ${renderSolutionField('Plano', plan?.label || '-')}
            ${renderSolutionField('Sistema', sol.system || '-')}
            ${renderSolutionField('Montaje', sol.layer || '-')}
            ${renderSolutionField('Tela / color', [sol.fabric, sol.color].filter(Boolean).join(' / ') || '-')}
            ${renderSolutionField('Fabricacion', `${formatRaw(sol.assembly.fabricationWidth || sol.quickQuote?.width)} x ${formatRaw(sol.assembly.fabricationHeight || sol.quickQuote?.height)}`)}
            ${renderSolutionField('Area tecnica', `${solutionArea(sol).toFixed(2)} m2`)}
            ${renderSolutionField('Operacion', sol.drive || '-')}
            ${renderSolutionField('Cantidad cotizada', String(sol.quickQuote?.quantity || 1))}
          </div>
          ${includeProduction ? renderAssemblyDetailsBlock(sol) : ''}
          ${includeProduction ? renderDivisionsBlock(sol) : ''}
          ${includePrice ? renderPriceBlock(sol) : ''}
          ${includeAlerts ? renderAlertsBlock(sol) : ''}
        </article>
      `;
    }).join('')}
  `;
}

function renderSolutionField(label: string, value: unknown) {
  return `<div class="solution-field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '-')}</strong></div>`;
}

function renderAssemblyDetailsBlock(sol: TechnicalProject['spaces'][number]['windows'][number]['solutions'][number]) {
  const details = [
    ['Color perfil', sol.assembly.profileColor],
    ['Tubo / perfil / riel', sol.assembly.tubeProfileRail],
    ['Soporte', sol.assembly.bracketType],
    ['Cenefa', sol.assembly.valance],
    ['Cadena', sol.assembly.chainColor],
    ['Perfil inferior', sol.assembly.bottomProfile],
    ['Descuentos / notas', sol.assembly.deductionNotes],
    ['Motor', sol.drive === 'motor' && sol.motor ? `${sol.motor.powerPoint || '-'} ${sol.motor.motorSide || ''} ${sol.motor.voltage || ''}` : ''],
    ['Accesorios', sol.accessories.length ? sol.accessories.map(a => `${a.name} x${a.qty}`).join(', ') : ''],
  ].filter(([, value]) => Boolean(value));
  return details.length
    ? `<div class="solution-block"><p class="solution-block-title">Parametros de fabricacion</p><div class="solution-grid">${details.map(([label, value]) => renderSolutionField(String(label), value)).join('')}</div></div>`
    : '';
}

function renderDivisionsBlock(sol: TechnicalProject['spaces'][number]['windows'][number]['solutions'][number]) {
  if (!sol.divisions.length) return '';
  return `
    <div class="solution-block">
      <p class="solution-block-title">Divisiones</p>
      <ul class="solution-list">
        ${sol.divisions.map(d => `<li><strong>${escapeHtml(d.label)}</strong>: ${formatRaw(d.width)} x ${formatRaw(d.height)}${d.notes ? ` - ${escapeHtml(d.notes)}` : ''}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderPriceBlock(sol: TechnicalProject['spaces'][number]['windows'][number]['solutions'][number]) {
  return `
    <div class="solution-block">
      <p class="solution-block-title">Valores internos</p>
      <div class="solution-grid">
        ${renderSolutionField('Area cotizada', sol.quickQuote ? `${quoteArea(sol.quickQuote).toFixed(2)} m2` : '-')}
        ${renderSolutionField('Total estimado', sol.quickQuote ? `${quoteTotal(sol.quickQuote).toLocaleString('es-CO')} COP` : '-')}
      </div>
    </div>
  `;
}

function renderAlertsBlock(sol: TechnicalProject['spaces'][number]['windows'][number]['solutions'][number]) {
  const items = [...sol.alerts.map(a => a.message), sol.notes].filter(Boolean);
  if (!items.length) return '';
  return `
    <div class="solution-block">
      <p class="solution-block-title">Alertas / notas</p>
      <ul class="solution-list">${items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>
    </div>
  `;
}

function renderPlan(plan: NonNullable<TechnicalProject['spaces'][number]['windows'][number]['planTemplate']>) {
  return `<div class="plan"><img src="${escapeHtml(plan.imageUrl)}" alt="${escapeHtml(plan.label)}"><div><strong>${escapeHtml(plan.label)}</strong><p>${escapeHtml(plan.layout)} - ${plan.solutionCount} persianas - ${plan.rollDirection === 'front' ? 'enrolla por frente' : 'enrolla por detras'}</p></div></div>`;
}

function formatRaw(value?: number) {
  return value ? String(value) : '-';
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
