import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { newProject } from '../lib/projectFactory';
import { CalculatorIcon, DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, IdentificationIcon, PlusIcon, TrashIcon, SparklesIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { generateReportHtml, technicalSummary, type PdfReportProfile } from '../lib/exporters';
import { addFallbackProject, duplicateFallbackProject, getFallbackProject, trashFallbackProject, useFallbackSummaries, useFallbackCatalog } from '../lib/localFallbackStore';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { PaymentReceiptModal } from '../components/PaymentReceiptModal';
import type { TechnicalProject } from '../types';
import { DEFAULT_CATALOG } from '../db';

export function Dashboard() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const visibleProjects = useFallbackSummaries();
  const catalog = useFallbackCatalog();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<TechnicalProject | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  
  const reportProfiles: Array<{ profile: PdfReportProfile; label: string }> = [
    { profile: 'client', label: 'Cliente' },
    { profile: 'supplier', label: 'Proveedor' },
    { profile: 'installer', label: 'Instalador' },
    { profile: 'internal', label: 'Interno' },
  ];

  const duplicateProject = (projectId: number) => {
    if (confirm('¿Deseas duplicar este proyecto? Se creará una copia exacta para que puedas editarla sin afectar la original.')) {
      duplicateFallbackProject(projectId);
      toast.success('Proyecto duplicado con éxito');
    }
  };

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

  const generateReport = async (project: any, profile: PdfReportProfile) => {
    try {
      const html = generateReportHtml([project], catalog || DEFAULT_CATALOG, profile);
      setPreviewHtml(html);
    } catch (e) {
      console.error(e);
      toast.error('Error al generar vista preliminar', { id: 'pdf' });
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
            <article key={project.projectId} className={`project-card ${project.isClone ? 'is-clone' : ''}`}>
              <button className="project-open" onClick={() => navigate(`/project/${project.projectId}/spaces`)}>
                <div>
                  <strong>{project.clientName || 'Proyecto sin cliente'}</strong>
                  <span>{project.siteName || project.address || project.code}</span>
                </div>
                <div className="card-meta">
                  <span>{project.spacesCount} espacios</span>
                  <span>{project.windowsCount} ventanas</span>
                  <span>{project.solutionsCount} soluciones</span>
                  {project.totalAreaM2 ? <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{project.totalAreaM2.toFixed(2)} m²</span> : null}
                  {project.totalEstimate ? <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>$ {project.totalEstimate.toLocaleString('es-CO')}</span> : null}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    const fullProject = getFallbackProject(project.projectId);
                    if (fullProject) {
                      const html = generateReportHtml([fullProject], catalog || DEFAULT_CATALOG, 'internal');
                      setPreviewHtml(html);
                    }
                  }}
                  aria-label={`PDF interno de ${project.clientName || project.code}`}
                >
                  <DocumentArrowDownIcon className="icon" />
                </button>
                <button
                  className="project-duplicate"
                  onClick={() => duplicateProject(project.projectId)}
                  aria-label={`Duplicar ${project.clientName || project.code}`}
                  title="Duplicar proyecto"
                >
                  <DocumentDuplicateIcon className="icon" />
                </button>
                <button
                  className="project-delete"
                  onClick={() => {
                    trashFallbackProject(project.projectId);
                    toast.success('Proyecto movido a papelera');
                  }}
                  aria-label={`Mover ${project.clientName || project.code} a papelera`}
                  title="Mover a papelera"
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
                    className="report-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      const fullProject = getFallbackProject(project.projectId);
                      if (fullProject) generateReport(fullProject, item.profile);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="report-pill"
                  style={{ color: '#10b981', borderColor: '#10b981', fontWeight: 'bold' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const fullProject = getFallbackProject(project.projectId);
                    if (fullProject) {
                      const summary = technicalSummary(fullProject, catalog || DEFAULT_CATALOG);
                      navigate('/facturacion', { state: { autoGenerateText: summary } });
                    }
                  }}
                >
                  <SparklesIcon className="icon" style={{width: 14, height: 14, display: 'inline', marginRight: 4}} /> IA
                </button>
                <button
                  type="button"
                  className="report-pill"
                  style={{ color: '#3b82f6', borderColor: '#3b82f6', fontWeight: 'bold' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const fullProject = getFallbackProject(project.projectId);
                    if (fullProject) {
                      setActiveProject(fullProject);
                      setShowReceiptModal(true);
                    }
                  }}
                >
                  Recibo
                </button>
              </div>
            </article>
          );
        })}
        {visibleProjects.length === 0 && <div className="empty">Todavia no hay proyectos tecnicos.</div>}
      </section>

      <PdfPreviewModal htmlContent={previewHtml} onClose={() => setPreviewHtml(null)} />
      {showReceiptModal && activeProject && (
        <PaymentReceiptModal 
          project={activeProject} 
          total={visibleProjects.find(p => p.projectId === activeProject.id)?.totalEstimate || 0}
          onClose={() => {
            setShowReceiptModal(false);
            setActiveProject(null);
          }} 
        />
      )}
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
