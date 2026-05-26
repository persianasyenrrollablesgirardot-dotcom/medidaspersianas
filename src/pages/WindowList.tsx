import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../db';
import { PageHeader } from '../components/PageHeader';
import { newWindow } from '../lib/projectFactory';
import { updateSpace } from '../lib/projectStore';
import { statusLabel } from '../lib/labels';

export function WindowList() {
  const { id, spaceId } = useParams();
  const navigate = useNavigate();
  const project = useLiveQuery(() => db.projects.get(Number(id)), [id]);
  const space = project?.spaces.find(s => s.id === spaceId);

  if (!project || !space) return <div className="page"><div className="empty">Cargando ventanas...</div></div>;

  const add = () => updateSpace(project, space.id, current => ({ ...current, windows: [...current.windows, newWindow(`Ventana ${current.windows.length + 1}`)] }));

  return (
    <div className="page">
      <PageHeader title={space.name} subtitle="Ventanas del espacio" backTo={`/project/${project.id}/spaces`} />
      <div className="section-title list-title">
        <div>
          <h2>Ventanas levantadas</h2>
          <p className="muted">{space.windows.length} ventanas en este espacio</p>
        </div>
        <button className="primary" onClick={add}><PlusIcon className="icon" /> Agregar</button>
      </div>
      <section className="window-grid">
        {space.windows.map(win => {
          const blockers = win.solutions.reduce((sum, sol) => sum + sol.alerts.filter(a => a.level === 'blocker').length, 0);
          const warnings = win.solutions.reduce((sum, sol) => sum + sol.alerts.filter(a => a.level === 'warning').length, 0);
          const badge = blockers ? `${blockers} bloqueo${blockers > 1 ? 's' : ''}` : warnings ? `${warnings} alerta${warnings > 1 ? 's' : ''}` : statusLabel(win.solutions[0]?.status || 'draft');
          return (
            <article key={win.id} className="window-tile">
              <button className="window-tile-main" onClick={() => navigate(`/project/${project.id}/space/${space.id}/window/${win.id}`)}>
                <strong>{win.label}</strong>
                <span>{win.solutions.length} soluciones</span>
                <span>{win.evidence.length} fotos</span>
                <em className={blockers ? 'bad' : warnings ? 'warn' : 'ok'}>{badge}</em>
              </button>
              <button className="mini-danger" onClick={() => updateSpace(project, space.id, current => ({ ...current, windows: current.windows.filter(w => w.id !== win.id) }))} aria-label={`Eliminar ${win.label}`}>
                <TrashIcon className="icon" />
              </button>
            </article>
          );
        })}
        {space.windows.length === 0 && <div className="empty">Este espacio todavia no tiene ventanas.</div>}
      </section>
    </div>
  );
}
