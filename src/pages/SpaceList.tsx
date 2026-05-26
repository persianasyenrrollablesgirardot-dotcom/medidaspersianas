import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../db';
import { PageHeader } from '../components/PageHeader';
import { TextInput } from '../components/Field';
import { newSpace } from '../lib/projectFactory';
import { saveProject } from '../lib/projectStore';

export function SpaceList() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useLiveQuery(() => db.projects.get(Number(id)), [id]);

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
        <button className="primary" onClick={add}><PlusIcon className="icon" /> Agregar</button>
      </div>
      <section className="space-grid">
        {project.spaces.map(space => {
          const solutions = space.windows.reduce((sum, win) => sum + win.solutions.length, 0);
          return (
            <article key={space.id} className="space-tile">
              <button className="space-tile-main" onClick={() => navigate(`/project/${project.id}/space/${space.id}`)}>
                <strong>{space.name}</strong>
                <span>{space.windows.length} ventanas</span>
                <span>{solutions} soluciones</span>
              </button>
              <div className="space-tile-edit">
                <TextInput value={space.name} onChange={e => saveProject({ ...project, spaces: project.spaces.map(s => s.id === space.id ? { ...s, name: e.target.value } : s) })} aria-label={`Nombre de ${space.name}`} />
                <button className="mini-danger" onClick={() => saveProject({ ...project, spaces: project.spaces.filter(s => s.id !== space.id) })} aria-label={`Eliminar ${space.name}`}>
                  <TrashIcon className="icon" />
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
