import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { db } from '../db';
import { buildBackup, csvRows, downloadText, openPrintableReport, technicalSummary, type BackupPayload } from '../lib/exporters';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export function ExportCenter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const projects = useLiveQuery(() => db.projects.where('deletedAt').equals(0).toArray()) || [];

  const exportJson = () => {
    downloadText(`backup_app_tecnica_campo_juno_${Date.now()}.json`, JSON.stringify(buildBackup(projects), null, 2), 'application/json');
    toast.success('Backup JSON exportado');
  };

  const exportCsv = () => {
    downloadText(`soluciones_tecnicas_${Date.now()}.csv`, csvRows(projects), 'text/csv');
    toast.success('CSV exportado');
  };

  const exportText = () => {
    const content = projects.map(technicalSummary).join('\n\n----------------------\n\n');
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
    await db.transaction('rw', db.projects, async () => {
      for (const project of payload.projects) {
        const copy = { ...project, id: undefined, synced: false, updatedAt: Date.now() };
        await db.projects.add(copy);
      }
    });
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
        <button className="export-action" onClick={() => openPrintableReport(projects)}><DocumentTextIcon className="icon" /><strong>PDF tecnico</strong><span>Abre reporte imprimible para guardar como PDF.</span></button>
        <button className="export-action" onClick={() => inputRef.current?.click()}><ArrowUpTrayIcon className="icon" /><strong>Importar JSON</strong><span>Recuperar proyectos guardados.</span></button>
        <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={e => importJson(e.target.files?.[0])} />
      </section>

      <section className="panel">
        <h2>Estado local</h2>
        <p className="muted">{projects.length} proyectos tecnicos disponibles para respaldo o sincronizacion futura.</p>
      </section>
    </div>
  );
}
