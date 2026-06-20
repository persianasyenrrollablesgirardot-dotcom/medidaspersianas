import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../db';
import { PageHeader } from '../components/PageHeader';
import { newWindow } from '../lib/projectFactory';
import { updateSpace } from '../lib/projectStore';
import { statusLabel } from '../lib/labels';
import { isFallbackId, useFallbackProject } from '../lib/localFallbackStore';
import { solutionTotal, solutionArea } from '../lib/metrics';
import { useAuth } from '../components/AuthContext';
import type { TechnicalProject } from '../types';

export function WindowList() {
  const { id, spaceId } = useParams();
  const navigate = useNavigate();
  const fallbackProject = useFallbackProject(id);
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => isFallbackId(Number(id)) ? Promise.resolve(undefined) : db.projects.get(Number(id)), [id]);
  const project = fallbackProject || dbProject;
  const space = project?.spaces.find(s => s.id === spaceId);
  const { role } = useAuth();

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
        {role === 'admin' && <button className="primary" onClick={add}><PlusIcon className="icon" /> Agregar</button>}
      </div>
      <section className="window-grid">
        {space.windows.map(win => {
          const blockers = win.solutions.reduce((sum, sol) => sum + sol.alerts.filter(a => a.level === 'blocker').length, 0);
          const warnings = win.solutions.reduce((sum, sol) => sum + sol.alerts.filter(a => a.level === 'warning').length, 0);
          const badge = blockers ? `${blockers} bloqueo${blockers > 1 ? 's' : ''}` : warnings ? `${warnings} alerta${warnings > 1 ? 's' : ''}` : statusLabel(win.solutions[0]?.status || 'draft');
          const windowTotal = win.solutions.reduce((sum, sol) => sum + solutionTotal(sol), 0);
          const windowAreaM2 = win.solutions.reduce((sum, sol) => sum + (sol.itemType !== 'maintenance' ? solutionArea(sol) : 0), 0);
          return (
            <article key={win.id} className="window-tile">
              <button className="window-tile-main" onClick={() => navigate(
                  role === 'proveedor' 
                    ? `/project/${project.id}/space/${space.id}/supplier-window/${win.id}`
                    : `/project/${project.id}/space/${space.id}/window/${win.id}`
                )}>
                <strong>{win.label}</strong>
                <div className="card-meta" style={{ marginTop: '4px' }}>
                  <span>{win.solutions.length} soluciones</span>
                  <span>{win.evidence.length} fotos</span>
                  {windowAreaM2 > 0 && <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{windowAreaM2.toFixed(2)} m²</span>}
                  {role === 'admin' && windowTotal > 0 && <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>$ {windowTotal.toLocaleString('es-CO')}</span>}
                </div>
                <em className={blockers ? 'bad' : warnings ? 'warn' : 'ok'} style={{ marginTop: '4px' }}>{badge}</em>
              </button>
              {role === 'admin' && (
                <button className="mini-danger" onClick={() => updateSpace(project, space.id, current => ({ ...current, windows: current.windows.filter(w => w.id !== win.id) }))} aria-label={`Eliminar ${win.label}`}>
                  <TrashIcon className="icon" />
                </button>
              )}
            </article>
          );
        })}
        {space.windows.length === 0 && <div className="empty">Este espacio todavia no tiene ventanas.</div>}
      </section>
    </div>
  );
}
