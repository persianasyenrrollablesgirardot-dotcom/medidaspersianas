import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { db, resetLocalAppData } from '../db';
import { newProject } from '../lib/projectFactory';
import { CalculatorIcon, DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { openPrintableReport } from '../lib/exporters';

export function Dashboard() {
  const navigate = useNavigate();
  const projects = useLiveQuery(async () => {
    const all = await db.projects.toArray();
    return all
      .filter(project => (project.deletedAt || 0) === 0)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }) || [];
  const catalog = useLiveQuery(() => db.catalog.toCollection().first());

  const create = async () => {
    try {
      const id = await db.projects.add(newProject());
      toast.success('Proyecto creado');
      navigate(`/project/${id}`);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo crear. Reinicia la app y borra cache si persiste.');
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p>App Tecnica Campo Juno</p>
        <h1>Levantamiento tecnico de campo</h1>
        <div className="hero-actions">
          <button className="primary" onClick={create}>
            <PlusIcon className="icon" /> Nuevo proyecto
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
      </div>

      <section className="list">
        {projects.map(project => {
          const windows = project.spaces.reduce((sum, space) => sum + space.windows.length, 0);
          const solutions = project.spaces.reduce((sum, space) => sum + space.windows.reduce((wSum, w) => wSum + w.solutions.length, 0), 0);
          return (
            <article key={project.id} className="project-card">
              <button className="project-open" onClick={() => navigate(`/project/${project.id}/spaces`)}>
                <div>
                  <strong>{project.clientName || 'Proyecto sin cliente'}</strong>
                  <span>{project.siteName || project.address || project.code}</span>
                </div>
                <div className="card-meta">
                  <span>{project.spaces.length} espacios</span>
                  <span>{windows} ventanas</span>
                  <span>{solutions} soluciones</span>
                </div>
              </button>
              <div className="project-card-actions">
                <button
                  className="project-quote"
                  onClick={() => navigate(`/project/${project.id}/quote`)}
                  aria-label={`Cotizacion rapida de ${project.clientName || project.code}`}
                >
                  <CalculatorIcon className="icon" />
                </button>
                <button
                  className="project-detail"
                  onClick={() => navigate(`/project/${project.id}/detail`)}
                  aria-label={`Ver detalle de ${project.clientName || project.code}`}
                >
                  <DocumentMagnifyingGlassIcon className="icon" />
                </button>
                <button
                  className="project-pdf"
                  onClick={() => openPrintableReport([project], catalog)}
                  aria-label={`Descargar PDF de ${project.clientName || project.code}`}
                >
                  <DocumentArrowDownIcon className="icon" />
                </button>
                <button
                  className="project-delete"
                  onClick={async () => {
                    await db.projects.update(project.id!, { deletedAt: Date.now(), updatedAt: Date.now(), synced: false });
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
