import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { buildBackup, csvRows, downloadText, generateReportHtml, technicalSummary, type BackupPayload, type PdfReportProfile } from '../lib/exporters';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { addFallbackProject, useFallbackActiveProjects, useFallbackCatalog } from '../lib/localFallbackStore';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { DEFAULT_CATALOG } from '../db';

export function ExportCenter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const projects = useFallbackActiveProjects();
  const catalog = useFallbackCatalog();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const generateReport = async (profile: PdfReportProfile) => {
    try {
      const html = generateReportHtml(projects, catalog, profile);
      setPreviewHtml(html);
    } catch (e) {
      console.error(e);
      toast.error('Error al generar la vista preliminar');
    }
  };

  const exportJson = () => {
    downloadText(`backup_app_tecnica_campo_juno_${Date.now()}.json`, JSON.stringify(buildBackup(projects), null, 2), 'application/json');
    toast.success('Backup JSON exportado');
  };

  const exportCsv = () => {
    downloadText(`soluciones_tecnicas_${Date.now()}.csv`, csvRows(projects), 'text/csv');
    toast.success('CSV exportado');
  };

  const exportText = () => {
    const content = projects.map(p => technicalSummary(p, catalog || DEFAULT_CATALOG)).join('\n\n----------------------\n\n');
    downloadText(`resumen_tecnico_${Date.now()}.txt`, content);
    toast.success('Resumen tecnico exportado');
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const payload = JSON.parse(text) as BackupPayload;
    if (payload.app !== 'App_Tecnica_Campo_Juno' || !Array.isArray(payload.projects)) {
      toast.error('Backup no compatible');
      return;
    }
    for (const project of payload.projects) {
      addFallbackProject({ ...project, id: undefined, synced: false, updatedAt: Date.now() });
    }
    toast.success(`${payload.projects.length} proyectos importados`);
  };

  return (
    <div className="page">
      <header className="hero compact">
        <p>Salidas y respaldo</p>
        <h1>Exportar e importar datos tecnicos</h1>
      </header>

      <section className="panel export-grid">
        <button className="export-action" onClick={exportJson}><ArrowDownTrayIcon className="icon" /><strong>Backup JSON</strong><span>Respaldo completo offline.</span></button>
        <button className="export-action" onClick={exportCsv}><DocumentTextIcon className="icon" /><strong>CSV tecnico</strong><span>Una fila por solucion.</span></button>
        <button className="export-action" onClick={exportText}><DocumentTextIcon className="icon" /><strong>Resumen tecnico</strong><span>Texto para revisar o compartir.</span></button>
        <button className="export-action" onClick={() => generateReport('client')}><DocumentTextIcon className="icon" /><strong>PDF cliente</strong><span>Sin medidas internas; solo m2 por item.</span></button>
        <button className="export-action" onClick={() => generateReport('supplier')}><DocumentTextIcon className="icon" /><strong>PDF proveedor</strong><span>Variables tecnicas y campos personalizados.</span></button>
        <button className="export-action" onClick={() => generateReport('installer')}><DocumentTextIcon className="icon" /><strong>PDF instalador</strong><span>Montaje, sitio, alertas y fotos tecnicas.</span></button>
        <button className="export-action" onClick={() => generateReport('internal')}><DocumentTextIcon className="icon" /><strong>PDF interno</strong><span>Expediente completo de trabajo.</span></button>
        <button className="export-action" onClick={() => inputRef.current?.click()}><ArrowUpTrayIcon className="icon" /><strong>Importar JSON</strong><span>Recuperar proyectos guardados.</span></button>
        <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={e => importJson(e.target.files?.[0])} />
      </section>

      <section className="panel">
        <h2>Estado local</h2>
        <p className="muted">{projects.length} proyectos tecnicos disponibles para respaldo o sincronizacion futura.</p>
      </section>
      
      <PdfPreviewModal htmlContent={previewHtml} onClose={() => setPreviewHtml(null)} />
    </div>
  );
}
