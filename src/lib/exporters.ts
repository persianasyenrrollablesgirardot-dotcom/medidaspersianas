import type { TechnicalCatalog, TechnicalProject } from '../types';
import { quoteArea, quoteTotal, solutionArea } from './metrics';

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
  lines.push(`FICHA TECNICA CAMPO JUNO`);
  lines.push(`Proyecto: ${project.clientName || 'Sin cliente'}`);
  lines.push(`Codigo: ${project.code}`);
  if (project.siteName) lines.push(`Lugar: ${project.siteName}`);
  if (project.address) lines.push(`Direccion: ${project.address}`);
  lines.push('');

  for (const space of project.spaces) {
    lines.push(`== ${space.name.toUpperCase()} ==`);
    for (const win of space.windows) {
      lines.push(`- ${win.label} | ${win.openingType || 'tipo pendiente'} | ${win.shape || 'forma pendiente'}`);
      if (win.planTemplate) {
        lines.push(`  Plano ventana: ${win.planTemplate.label} | ${win.planTemplate.layout} | ${win.planTemplate.solutionCount} persianas`);
      }
      const g = win.geometry;
      lines.push(`  Medidas vano: ancho ${g.widthTop || '-'} / ${g.widthMiddle || '-'} / ${g.widthBottom || '-'} · alto ${g.heightLeft || '-'} / ${g.heightCenter || '-'} / ${g.heightRight || '-'}`);
      if (g.depth) lines.push(`  Profundidad: ${g.depth} m`);
      if (win.siteConditions.length) lines.push(`  Condiciones: ${win.siteConditions.map(c => `${c.label} (${c.severity})`).join(', ')}`);
      for (const sol of win.solutions) {
        lines.push(`  > ${sol.name} [${sol.layer}] ${sol.system} ${sol.fabric || ''}`);
        if (sol.planTemplate) {
          lines.push(`    Plano: ${sol.planTemplate.label} | ${sol.planTemplate.layout} | ${sol.planTemplate.rollDirection === 'front' ? 'enrolla por frente' : 'enrolla por detras'}`);
        }
        if (sol.quickQuote) {
          lines.push(`    Rapida: ${sol.quickQuote.width || 0} x ${sol.quickQuote.height || 0} · ${quoteArea(sol.quickQuote).toFixed(2)} m2 · ${quoteTotal(sol.quickQuote).toLocaleString('es-CO')} COP estimado`);
        }
        lines.push(`    Fabricacion: ${sol.assembly.fabricationWidth || '-'} x ${sol.assembly.fabricationHeight || '-'} · area tecnica ${solutionArea(sol).toFixed(2)} m2`);
        if (sol.divisions.length) {
          lines.push(`    Divisiones: ${sol.divisions.map(d => `${d.label} ${d.width}x${d.height}`).join(' | ')}`);
        }
        if (sol.alerts.length) {
          lines.push(`    Alertas: ${sol.alerts.map(a => a.message).join(' | ')}`);
        }
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
    for (const space of project.spaces) {
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

export function openPrintableReport(projects: TechnicalProject[], catalog?: TechnicalCatalog) {
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Ficha Campo Juno</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
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
    .plan { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center; border: 1px solid #ddd; padding: 6px; margin: 8px 0; }
    .plan img { width: 120px; background: #fff; }
    .window, .solution { break-inside: avoid; }
  </style>
</head>
<body>
  ${projects.map(project => `
    <section class="project">
      <h1>Ficha Campo Juno</h1>
      <p class="muted">Codigo: ${escapeHtml(project.code)} · Fecha: ${new Date(project.updatedAt).toLocaleString('es-CO')}</p>
      <p><strong>Cliente / obra:</strong> ${escapeHtml(project.clientName || 'Sin definir')}</p>
      <p><strong>Documento:</strong> ${escapeHtml(project.clientDocument || '')} · <strong>Telefono:</strong> ${escapeHtml(project.contactPhone || '')}</p>
      <p><strong>Lugar:</strong> ${escapeHtml(project.siteName || '')} ${escapeHtml(project.address || '')}</p>
      <div class="grid">
        <div class="box"><span>Espacios</span><strong>${project.spaces.length}</strong></div>
        <div class="box"><span>Ventanas</span><strong>${project.spaces.reduce((sum, space) => sum + space.windows.length, 0)}</strong></div>
        <div class="box"><span>Persianas</span><strong>${project.spaces.reduce((sum, space) => sum + space.windows.reduce((wSum, win) => wSum + win.solutions.length, 0), 0)}</strong></div>
      </div>
      ${project.spaces.map(space => `
        <h2>${escapeHtml(space.name)}</h2>
        ${space.windows.map(win => `
          <h3>${escapeHtml(win.label)} · ${escapeHtml(win.openingType || '')} · ${escapeHtml(win.shape || '')}</h3>
          <p><strong>Vano:</strong> ancho ${win.geometry.widthTop || '-'} / ${win.geometry.widthMiddle || '-'} / ${win.geometry.widthBottom || '-'} · alto ${win.geometry.heightLeft || '-'} / ${win.geometry.heightCenter || '-'} / ${win.geometry.heightRight || '-'} · profundidad ${win.geometry.depth || '-'}</p>
          ${catalog?.customWindowFields?.length ? `<div class="grid">${catalog.customWindowFields.map(field => `<div class="box"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(win.customFields?.[field.id] || 'Sin definir')}</strong></div>`).join('')}</div>` : ''}
          ${win.siteConditions.length ? `<p><strong>Condiciones:</strong> ${win.siteConditions.map(c => escapeHtml(c.label)).join(', ')}</p>` : ''}
          <table>
            <thead><tr><th>Solucion</th><th>Plano</th><th>Sistema</th><th>Montaje</th><th>Tela</th><th>Medidas</th><th>Divisiones</th></tr></thead>
            <tbody>
              ${win.solutions.map(sol => `
                <tr>
                  <td>${escapeHtml(sol.name)}</td>
                  <td>${escapeHtml((sol.planTemplate || win.planTemplate)?.label || '-')}</td>
                  <td>${escapeHtml(sol.system)}</td>
                  <td>${escapeHtml(sol.layer)}</td>
                  <td>${escapeHtml(sol.fabric || '')}</td>
                  <td>${sol.assembly.fabricationWidth || sol.quickQuote?.width || '-'} x ${sol.assembly.fabricationHeight || sol.quickQuote?.height || '-'}</td>
                  <td>${sol.divisions.length ? sol.divisions.map(d => `${escapeHtml(d.label)} ${d.width}x${d.height}`).join('<br>') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `).join('')}
      `).join('')}
    </section>
  `).join('')}
  <script>window.onload = () => setTimeout(() => window.print(), 250)</script>
</body>
</html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
