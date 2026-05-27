import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetLocalAppData } from '../db';
import { newProject } from '../lib/projectFactory';
import { CalculatorIcon, DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, IdentificationIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { openPrintableReport, type PdfReportProfile } from '../lib/exporters';
import { addFallbackProject, getFallbackProject, trashFallbackProject, useFallbackSummaries } from '../lib/localFallbackStore';

export function Dashboard() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const visibleProjects = useFallbackSummaries();
  const reportProfiles: Array<{ profile: PdfReportProfile; label: string }> = [
    { profile: 'client', label: 'Cliente' },
    { profile: 'supplier', label: 'Proveedor' },
    { profile: 'installer', label: 'Instalador' },
    { profile: 'internal', label: 'Interno' },
  ];

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const fallbackId = addFallbackProject(newProject());
      toast.success('Proyecto creado');
      navigate(`/project/${fallbackId}`);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo guardar en este dispositivo. Revisa espacio disponible o reinstala la app.');
    } finally {
      setCreating(false);
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
        <Stat label="Proyectos" value={visibleProjects.length} />
        <Stat label="Pendientes" value={visibleProjects.filter(p => p.status !== 'ready_for_fabrication').length} />
        <Stat label="Listos" value={visibleProjects.filter(p => p.status === 'ready_for_fabrication').length} />
      </section>

      <div className="section-title list-title">
        <div>
          <h2>Proyectos activos</h2>
          <p className="muted">{visibleProjects.length} registros locales</p>
        </div>
      </div>

      <section className="list">
        {visibleProjects.map(project => {
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
                  className="project-setup"
                  onClick={() => navigate(`/project/${project.projectId}`)}
                  aria-label={`Editar datos de ${project.clientName || project.code}`}
                >
                  <IdentificationIcon className="icon" />
                </button>
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
                  onClick={() => {
                    const fullProject = getFallbackProject(project.projectId);
                    if (fullProject) openPrintableReport([fullProject], undefined, 'internal');
                  }}
                  aria-label={`PDF interno de ${project.clientName || project.code}`}
                >
                  <DocumentArrowDownIcon className="icon" />
                </button>
                <button
                  className="project-delete"
                  onClick={() => {
                    trashFallbackProject(project.projectId);
                    toast.success('Proyecto movido a papelera');
                  }}
                  aria-label={`Mover ${project.clientName || project.code} a papelera`}
                >
                  <TrashIcon className="icon" />
                </button>
              </div>
              <div className="project-report-actions">
                <button
                  type="button"
                  className="project-data-pill"
                  onClick={() => navigate(`/project/${project.projectId}`)}
                >
                  <IdentificationIcon className="icon" /> Datos basicos
                </button>
                <span>PDF</span>
                {reportProfiles.map(item => (
                  <button
                    key={item.profile}
                    type="button"
                    className={`report-pill ${item.profile}`}
                    onClick={() => {
                      const fullProject = getFallbackProject(project.projectId);
                      if (fullProject) openPrintableReport([fullProject], undefined, item.profile);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
        {visibleProjects.length === 0 && <div className="empty">Todavia no hay proyectos tecnicos.</div>}
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
