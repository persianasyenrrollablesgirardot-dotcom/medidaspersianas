import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { newProject } from '../lib/projectFactory';
import { CalculatorIcon, DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, IdentificationIcon, PlusIcon, TrashIcon, SparklesIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { generateReportHtml, technicalSummary, type PdfReportProfile } from '../lib/exporters';
import { addFallbackProject, duplicateFallbackProject, getFallbackProject, trashFallbackProject, useFallbackSummaries, useFallbackCatalog } from '../lib/localFallbackStore';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { PaymentReceiptModal } from '../components/PaymentReceiptModal';
import type { TechnicalProject, ProjectSummary } from '../types';
import { DEFAULT_CATALOG } from '../db';
import { useAuth } from '../components/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { dbFirestore } from '../lib/firebase';
import { useEffect } from 'react';

export function Dashboard() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { role } = useAuth();
  const visibleLocalProjects = useFallbackSummaries();
  const [cloudProjects, setCloudProjects] = useState<ProjectSummary[]>([]);
  
  useEffect(() => {
    if (role === 'proveedor') {
      getDocs(collection(dbFirestore, 'cloud_projects')).then(snapshot => {
        const projs = snapshot.docs.map(doc => ({ ...doc.data(), projectId: doc.data().id || doc.data().projectId } as unknown as ProjectSummary));
        setCloudProjects(projs);
      }).catch(e => {
        console.error(e);
        toast.error('Error cargando proyectos de la nube');
      });
    }
  }, [role]);

  const visibleProjects = role === 'proveedor' ? cloudProjects : visibleLocalProjects;
  const catalog = useFallbackCatalog();
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<TechnicalProject | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const filteredProjects = useMemo(() => {
    let result = visibleProjects;

    if (dateFilter !== 'all') {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      result = result.filter(p => {
        const diff = now - p.createdAt;
        if (dateFilter === 'today') return diff <= oneDay;
        if (dateFilter === 'week') return diff <= 7 * oneDay;
        if (dateFilter === 'month') return diff <= 30 * oneDay;
        return true;
      });
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        (p.clientName && p.clientName.toLowerCase().includes(term)) ||
        (p.contactPhone && p.contactPhone.toLowerCase().includes(term)) ||
        (p.siteName && p.siteName.toLowerCase().includes(term)) ||
        (p.address && p.address.toLowerCase().includes(term)) ||
        (p.code && p.code.toLowerCase().includes(term))
      );
    }

    return result;
  }, [visibleProjects, searchTerm, dateFilter]);
  
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
        {role === 'admin' && (
          <div className="hero-actions">
            <button className="primary" onClick={create} disabled={creating}>
              <PlusIcon className="icon" /> {creating ? 'Creando...' : 'Nuevo proyecto'}
            </button>
            <button className="secondary" onClick={() => navigate('/papelera')}>
              <TrashIcon className="icon" /> Papelera
            </button>
          </div>
        )}
      </header>

      <section className="stats-row">
        <Stat label="Proyectos" value={visibleProjects.length} />
        <Stat label="Pendientes" value={visibleProjects.filter(p => p.status !== 'ready_for_fabrication').length} />
        <Stat label="Listos" value={visibleProjects.filter(p => p.status === 'ready_for_fabrication').length} />
      </section>

      <div className="section-title list-title" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2>Proyectos activos</h2>
          <p className="muted">Mostrando {filteredProjects.length} de {visibleProjects.length} proyectos</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%', maxWidth: '500px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <DocumentMagnifyingGlassIcon className="icon" style={{ position: 'absolute', left: '10px', top: '10px', color: '#888' }} />
            <input 
              type="search" 
              placeholder="Buscar cliente, teléfono..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '36px' }}
            />
          </div>
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)} style={{ minWidth: '130px' }}>
            <option value="all">Todas las fechas</option>
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
          </select>
        </div>
      </div>

      <section className="list">
        {filteredProjects.map(project => {
          return (
            <article key={project.projectId} className={`project-card ${project.isClone ? 'is-clone' : ''}`}>
              <button 
                className="project-open" 
                onClick={() => {
                  if (role === 'admin') navigate(`/project/${project.projectId}/spaces`);
                }}
                style={{ cursor: role === 'proveedor' ? 'default' : 'pointer' }}
              >
                <div>
                  <strong>{role === 'proveedor' ? 'Censurado' : (project.clientName || 'Proyecto sin cliente')}</strong>
                  <span>{project.siteName || project.address || project.code}</span>
                </div>
                <div className="card-meta">
                  <span>{project.spacesCount} espacios</span>
                  <span>{project.windowsCount} ventanas</span>
                  <span>{project.solutionsCount} soluciones</span>
                  {project.totalAreaM2 ? <span style={{ color: 'var(--blue)', fontWeight: 'bold' }}>{project.totalAreaM2.toFixed(2)} m²</span> : null}
                  {role === 'admin' && project.totalEstimate !== undefined && (
                    <span className="price">$ {project.totalEstimate.toLocaleString('es-CO')}</span>
                  )}
                </div>
                {project.systemTotals && Object.keys(project.systemTotals).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {Object.entries(project.systemTotals as Record<string, { area: number; price: number }>).map(([sys, totals]) => totals.area > 0 && (
                      <span key={sys} style={{ fontSize: '11px', padding: '2px 6px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px' }}>
                        {sys}: <strong>{totals.area.toFixed(2)} m²</strong>
                      </span>
                    ))}
                  </div>
                )}
              </button>
              <div className="project-card-actions" style={{ display: role === 'admin' ? 'flex' : 'none' }}>
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
              <div className="project-report-actions" style={{ display: role === 'admin' ? 'flex' : 'none' }}>
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
