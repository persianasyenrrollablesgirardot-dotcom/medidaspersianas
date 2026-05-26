import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { db, resetLocalAppData } from '../db';
import { newProject } from '../lib/projectFactory';
import { CalculatorIcon, DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { openPrintableReport } from '../lib/exporters';
import { rebuildMissingProjectSummaries, upsertProjectSummary } from '../lib/projectStore';

export function Dashboard() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const projects = useLiveQuery(async () => {
    const summaries = await db.projectSummaries.where('deletedAt').equals(0).toArray();
    return summaries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, []) || [];
  const fullProjectCount = useLiveQuery(() => db.projects.count(), []) || 0;
  const catalog = useLiveQuery(() => db.catalog.toCollection().first());

  useEffect(() => {
    const onBlocked = () => toast.error('El almacenamiento local esta bloqueado por una version anterior. Cierra la app completamente y abre de nuevo.');
    window.addEventListener('juno-storage-blocked', onBlocked);
    return () => window.removeEventListener('juno-storage-blocked', onBlocked);
  }, []);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const project = newProject();
      const id = await withTimeout(db.projects.add(project), 6000);
      await upsertProjectSummary({ ...project, id });
      toast.success('Proyecto creado');
      navigate(`/project/${id}`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'No se pudo crear el proyecto');
    } finally {
      setCreating(false);
    }
  };

  const recoverOldList = async () => {
    setRebuilding(true);
    try {
      await rebuildMissingProjectSummaries();
      toast.success('Listado reconstruido');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo reconstruir el listado');
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p>App Tecnica Campo Juno</p>
        <h1>Levantamiento tecnico de campo</h1>
        <div className="hero-actions">
          <button className="primary" onClick={create} disabled={creating}>
            <PlusIcon className="icon" /> {creating ? 'Creando...' : 'Nuevo proyecto'}
          </button>
          <button className="secondary" onClick={() => navigate('/papelera')}>
            <TrashIcon className="icon" /> Papelera
          </button>
          <button
            className="secondary danger-outline"
            onClick={() => {
              if (confirm('Esto borra los datos locales de esta app en este dispositivo y reinicia la app. Usalo solo si queda bloqueada.')) {
                resetLocalAppData();
              }
            }}
          >
            Reiniciar app local
          </button>
        </div>
      </header>

      <section className="stats-row">
        <Stat label="Proyectos" value={projects.length} />
        <Stat label="Pendientes" value={projects.filter(p => p.status !== 'ready_for_fabrication').length} />
        <Stat label="Listos" value={projects.filter(p => p.status === 'ready_for_fabrication').length} />
      </section>

      <div className="section-title list-title">
        <div>
          <h2>Proyectos activos</h2>
          <p className="muted">{projects.length} registros locales</p>
        </div>
        {fullProjectCount > projects.length && (
          <button className="secondary" type="button" disabled={rebuilding} onClick={recoverOldList}>
            {rebuilding ? 'Recuperando...' : 'Recuperar listado antiguo'}
          </button>
        )}
      </div>

      <section className="list">
        {projects.map(project => {
          return (
            <article key={project.id} className="project-card">
              <button className="project-open" onClick={() => navigate(`/project/${project.projectId}/spaces`)}>
                <div>
                  <strong>{project.clientName || 'Proyecto sin cliente'}</strong>
                  <span>{project.siteName || project.address || project.code}</span>
                </div>
                <div className="card-meta">
                  <span>{project.spacesCount} espacios</span>
                  <span>{project.windowsCount} ventanas</span>
                  <span>{project.solutionsCount} soluciones</span>
                </div>
              </button>
              <div className="project-card-actions">
                <button
                  className="project-quote"
                  onClick={() => navigate(`/project/${project.projectId}/quote`)}
                  aria-label={`Cotizacion rapida de ${project.clientName || project.code}`}
                >
                  <CalculatorIcon className="icon" />
                </button>
                <button
                  className="project-detail"
                  onClick={() => navigate(`/project/${project.projectId}/detail`)}
                  aria-label={`Ver detalle de ${project.clientName || project.code}`}
                >
                  <DocumentMagnifyingGlassIcon className="icon" />
                </button>
                <button
                  className="project-pdf"
                  onClick={async () => {
                    const fullProject = await db.projects.get(project.projectId);
                    if (fullProject) openPrintableReport([fullProject], catalog);
                  }}
                  aria-label={`Descargar PDF de ${project.clientName || project.code}`}
                >
                  <DocumentArrowDownIcon className="icon" />
                </button>
                <button
                  className="project-delete"
                  onClick={async () => {
                    const deletedAt = Date.now();
                    await db.projects.update(project.projectId, { deletedAt, updatedAt: deletedAt, synced: false });
                    await db.projectSummaries.update(project.id!, { deletedAt, updatedAt: deletedAt, synced: false });
                    toast.success('Proyecto movido a papelera');
                  }}
                  aria-label={`Mover ${project.clientName || project.code} a papelera`}
                >
                  <TrashIcon className="icon" />
                </button>
              </div>
            </article>
          );
        })}
        {projects.length === 0 && <div className="empty">Todavia no hay proyectos tecnicos.</div>}
      </section>
    </div>
  );
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('El almacenamiento local no respondio. Cierra completamente la app y abre de nuevo.')), ms)),
  ]);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
