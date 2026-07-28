import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { csvRows, downloadText, generateReportHtml, technicalSummary, type PdfReportProfile } from '../lib/exporters';
import type { TechnicalProject } from '../types';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { restoreProjects, useFallbackActiveProjects, useFallbackCatalog } from '../lib/localFallbackStore';
import { hydrateProjectsPhotos } from '../lib/photoStore';
import { descargarRespaldoCompleto } from '../lib/autoBackup';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { DEFAULT_CATALOG } from '../db';

export function ExportCenter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const projects = useFallbackActiveProjects();
  const catalog = useFallbackCatalog();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const generateReport = async (profile: PdfReportProfile) => {
    try {
      // Las fotos viven fuera del proyecto: hay que traerlas para el <img> del PDF.
      const conFotos = await hydrateProjectsPhotos(projects);
      const html = generateReportHtml(conFotos, catalog, profile);
      setPreviewHtml(html);
    } catch (e) {
      console.error(e);
      toast.error('Error al generar la vista preliminar');
    }
  };

  // El respaldo lleva las fotos incrustadas para que el archivo sirva por sí
  // solo, aunque se pierdan la app y el celular. Es el formato que salvó el
  // rescate de julio.
  const exportJson = async () => {
    try {
      const resultado = await descargarRespaldoCompleto();
      toast.success(`Respaldo descargado: ${resultado.proyectos} proyectos con sus fotos.`);
    } catch (e) {
      console.error(e);
      toast.error('No se pudo generar el respaldo');
    }
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
    let parsed: any;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error('El archivo no es un JSON válido');
      return;
    }
    // Aceptamos varios formatos: el respaldo oficial ({ app, projects }), el archivo
    // de rescate en crudo (un arreglo de proyectos) o { projects: [...] } sin etiqueta.
    let projects: TechnicalProject[] = [];
    if (Array.isArray(parsed)) projects = parsed;
    else if (parsed && Array.isArray(parsed.projects)) projects = parsed.projects;
    else {
      toast.error('Backup no compatible');
      return;
    }
    // Validación mínima: que parezcan proyectos (tienen espacios).
    projects = projects.filter(p => p && typeof p === 'object' && Array.isArray(p.spaces));
    if (projects.length === 0) {
      toast.error('El archivo no contiene proyectos');
      return;
    }
    // Combina por CÓDIGO de proyecto y nunca borra lo que ya existe. Antes se
    // agregaba a ciegas: importar dos veces duplicaba todo y, si no cabía en
    // los 5 MB, el proyecto entraba mutilado sin fotos.
    try {
      const r = await restoreProjects(projects);
      toast.success(
        `${r.added} proyectos nuevos, ${r.updated} actualizados${r.skipped ? `, ${r.skipped} descartados` : ''}.`,
        { duration: 7000 },
      );
    } catch (e) {
      console.error(e);
      toast.error('No se pudo importar el respaldo');
    }
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
