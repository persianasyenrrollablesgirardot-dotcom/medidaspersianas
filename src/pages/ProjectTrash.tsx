import toast from 'react-hot-toast';
import { ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';
import { deleteFallbackProject, restoreFallbackProject, useFallbackTrashSummaries } from '../lib/localFallbackStore';

const RETENTION_DAYS = 40;

export function ProjectTrash() {
  const projects = useFallbackTrashSummaries();

  const restore = (id: number) => {
    restoreFallbackProject(id);
    toast.success('Proyecto restaurado');
  };

  const removeForever = (id: number) => {
    if (!confirm('Eliminar definitivamente este proyecto? Esta accion no se puede deshacer.')) return;
    deleteFallbackProject(id);
    toast.success('Proyecto eliminado definitivamente');
  };

  const emptyTrash = () => {
    if (!confirm('Vaciar toda la papelera? Esta accion no se puede deshacer.')) return;
    projects.forEach(project => deleteFallbackProject(project.projectId));
    toast.success('Papelera vaciada');
  };

  return (
    <div className="page">
      <PageHeader title="Papelera" subtitle="Proyectos eliminados" backTo="/" />

      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Retencion de 40 dias</h2>
            <p className="muted">Los proyectos eliminados se conservan localmente durante 40 dias antes de la limpieza automatica.</p>
          </div>
          {projects.length > 0 && <button className="secondary danger-outline" onClick={emptyTrash}>Vaciar</button>}
        </div>
      </section>

      <section className="flow-list">
        {projects.map(project => {
          const deletedAt = project.deletedAt || Date.now();
          const elapsed = Math.floor((Date.now() - deletedAt) / (24 * 60 * 60 * 1000));
          const remaining = Math.max(RETENTION_DAYS - elapsed, 0);

          return (
            <article key={project.id} className="trash-card">
              <div>
                <strong>{project.clientName || 'Proyecto sin cliente'}</strong>
                <span>{project.siteName || project.address || project.code}</span>
                <em>Se elimina automaticamente en {remaining} dias</em>
              </div>
              <div className="trash-actions">
                <button className="secondary" onClick={() => restore(project.projectId)}>
                  <ArrowPathIcon className="icon" /> Restaurar
                </button>
                <button className="secondary danger-outline" onClick={() => removeForever(project.projectId)}>
                  <TrashIcon className="icon" /> Eliminar
                </button>
              </div>
            </article>
          );
        })}

        {projects.length === 0 && <div className="empty">La papelera esta vacia.</div>}
      </section>
    </div>
  );
}
