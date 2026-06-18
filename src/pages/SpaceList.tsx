import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../db';
import { PageHeader } from '../components/PageHeader';
import { TextInput } from '../components/Field';
import { newSpace } from '../lib/projectFactory';
import { saveProject } from '../lib/projectStore';
import { isFallbackId, useFallbackProject } from '../lib/localFallbackStore';
import { solutionTotal, solutionArea } from '../lib/metrics';
import { useAuth } from '../components/AuthContext';
import type { TechnicalProject } from '../types';

export function SpaceList() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fallbackProject = useFallbackProject(id);
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => isFallbackId(Number(id)) ? Promise.resolve(undefined) : db.projects.get(Number(id)), [id]);
  const project = fallbackProject || dbProject;
  const { role } = useAuth();

  if (!project) return <div className="page"><div className="empty">Cargando espacios...</div></div>;

  const add = () => saveProject({ ...project, spaces: [...project.spaces, newSpace(`Espacio ${project.spaces.length + 1}`)] });

  return (
    <div className="page">
      <PageHeader title="Espacios" subtitle={project.clientName || project.code} backTo="/" />
      <div className="section-title list-title">
        <div>
          <h2>Ambientes del proyecto</h2>
          <p className="muted">{project.spaces.length} espacios registrados</p>
        </div>
        {role === 'admin' && <button className="primary" onClick={add}><PlusIcon className="icon" /> Agregar</button>}
      </div>
      <section className="space-grid">
        {project.spaces.map(space => {
          const solutions = space.windows.reduce((sum, win) => sum + win.solutions.length, 0);
          const spaceTotal = space.windows.reduce((sum, win) => sum + win.solutions.reduce((wSum, sol) => wSum + solutionTotal(sol), 0), 0);
          const spaceAreaM2 = space.windows.reduce((sum, win) => sum + win.solutions.reduce((wSum, sol) => wSum + (sol.itemType !== 'maintenance' ? solutionArea(sol) : 0), 0), 0);
          return (
            <article key={space.id} className="space-tile">
              <button className="space-tile-main" onClick={() => navigate(`/project/${project.id}/space/${space.id}`)}>
                <strong>{space.name}</strong>
                <div className="card-meta" style={{ marginTop: '4px' }}>
                  <span>{space.windows.length} ventanas</span>
                  <span>{solutions} soluciones</span>
                  {spaceAreaM2 > 0 && <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{spaceAreaM2.toFixed(2)} m²</span>}
                  {role === 'admin' && spaceTotal > 0 && <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>$ {spaceTotal.toLocaleString('es-CO')}</span>}
                </div>
              </button>
              {role === 'admin' && (
                <div className="space-tile-edit">
                  <TextInput value={space.name} onChange={e => saveProject({ ...project, spaces: project.spaces.map(s => s.id === space.id ? { ...s, name: e.target.value } : s) })} aria-label={`Nombre de ${space.name}`} />
                  <button className="mini-danger" onClick={() => saveProject({ ...project, spaces: project.spaces.filter(s => s.id !== space.id) })} aria-label={`Eliminar ${space.name}`}>
                    <TrashIcon className="icon" />
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
