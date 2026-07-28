import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { newProject } from '../lib/projectFactory';
import { CalculatorIcon, DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, IdentificationIcon, PlusIcon, TrashIcon, SparklesIcon, DocumentDuplicateIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { generateReportHtml, technicalSummary, type PdfReportProfile } from '../lib/exporters';
import { addFallbackProject, duplicateFallbackProject, getFallbackProject, saveFallbackProject, trashFallbackProject, useFallbackSummaries, useFallbackCatalog } from '../lib/localFallbackStore';
import { hydrateProjectPhotos } from '../lib/photoStore';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { PaymentReceiptModal } from '../components/PaymentReceiptModal';
import type { TechnicalProject, ProjectSummary, TechnicalCatalog } from '../types';
import { solutionTotal } from '../lib/metrics';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_CATALOG, db } from '../db';
import { useAuth } from '../components/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { dbFirestore } from '../lib/firebase';
import { useEffect } from 'react';
import { supplierStatusDocId, useSupplierStatuses } from '../lib/supplierStatus';

// Quita tildes/diacríticos y pasa a minúsculas para que la búsqueda sea "congruente":
// "José" == "jose", "Girardot" == "girardot". Base de la búsqueda por palabras.
function normalizeText(value?: string) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function ProjectSupplierBadge({ project }: { project: any }) {
  const docId = supplierStatusDocId(project.projectId, project.code);
  const statuses = useSupplierStatuses(docId);
  
  if (!project.spaces) return null; // We need the full project data to count solutions
  
  const allBlinds = project.spaces.flatMap((s: any) => s.windows.flatMap((w: any) => w.solutions));
  const total = allBlinds.length;
  const done = allBlinds.filter((s: any) => statuses[s.id]).length;
  const allDone = total > 0 && done === total;
  
  if (total === 0) return null;
  
  return (
    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center' }}>
      <span style={{ 
        fontWeight: 'bold', 
        color: allDone ? '#16a34a' : '#ef4444', 
        background: allDone ? 'rgba(22,163,74,0.15)' : 'rgba(239,68,68,0.15)', 
        padding: '4px 10px', 
        borderRadius: '12px', 
        fontSize: '13px' 
      }}>
        {allDone ? '✓ PROYECTO COMPLETADO' : `⚠ ${done}/${total} persianas gestionadas`}
      </span>
    </div>
  );
}

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
        window.localStorage.setItem('cloud_projects_cache', JSON.stringify(projs));
      }).catch(e => {
        console.error(e);
        // Mostramos el motivo REAL de Firebase (ej: 'permission-denied' = reglas
        // de Firestore vencidas/bloqueadas) para poder diagnosticar sin la consola.
        toast.error('Error nube: ' + (e?.code || e?.message || String(e)), { duration: 8000 });
      });
    }
  }, [role]);

  const visibleProjects = role === 'proveedor' ? cloudProjects : visibleLocalProjects;
  const fallbackCatalog = useFallbackCatalog();
  const dbCatalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(value => value || undefined), []);
  // El editor/detalle leen el catalogo de Dexie; el PDF leia solo el de localStorage.
  // Si divergen, los campos personalizados salian como "Sin definir" en el PDF.
  // Unimos las definiciones de AMBOS stores (por id) para que la etiqueta siempre resuelva.
  const catalog = useMemo<TechnicalCatalog>(() => {
    const base = dbCatalog || fallbackCatalog || DEFAULT_CATALOG;
    const byId = new Map<string, TechnicalCatalog['customWindowFields'][number]>();
    for (const field of [...(dbCatalog?.customWindowFields || []), ...(fallbackCatalog?.customWindowFields || [])]) {
      if (!byId.has(field.id)) byId.set(field.id, field);
    }
    return { ...base, customWindowFields: Array.from(byId.values()) };
  }, [dbCatalog, fallbackCatalog]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<TechnicalProject | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // Set de projectId que YA tienen al menos un recibo guardado (Dexie db.receipts).
  // Sirve para alertar los pedidos enviados a proveedor que aún no tienen recibo.
  const receiptProjectIds = useLiveQuery(() => db.receipts.toArray().then(rs => new Set(rs.map(r => r.projectId))), []);

  const openReceiptFor = (projectId: number) => {
    const full = getFallbackProject(projectId);
    if (full) {
      setActiveProject(full);
      setShowReceiptModal(true);
    } else {
      toast.error('No se pudo abrir el proyecto para generar el recibo.');
    }
  };

  // Marca el pedido como enviado a proveedor SOLO localmente (no sube a la nube de
  // la app). Úsalo cuando el proveedor se gestiona por fuera y no hace falta enviarlo
  // por la app. Para el envío real a la nube está "Enviar a Proveedor" en el detalle.
  const markAsSentLocally = (projectId: number) => {
    const full = getFallbackProject(projectId);
    if (!full) {
      toast.error('No se pudo abrir el proyecto.');
      return;
    }
    if (!confirm('¿Marcar este pedido como ENVIADO a proveedor?\n\nSe marca como gestionado sin subirlo a la nube de la app (útil si el proveedor se maneja por otro medio).')) return;
    saveFallbackProject({ ...full, sentToSupplier: true });
    toast.success('Marcado como enviado a proveedor (gestión externa, sin subir a la nube).');
  };
  
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [expandedActions, setExpandedActions] = useState<number | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<'all' | 'sent' | 'unsent' | 'sent_no_receipt' | 'receipt_not_sent'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'ready'>('all');

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

    if (supplierFilter !== 'all') {
      result = result.filter(p => {
        if (supplierFilter === 'sent') return !!p.sentToSupplier;
        if (supplierFilter === 'unsent') return !p.sentToSupplier;
        // receipt_not_sent: tienen recibo generado pero NO se enviaron a proveedor.
        if (supplierFilter === 'receipt_not_sent') return !p.sentToSupplier && !!receiptProjectIds && receiptProjectIds.has(p.projectId);
        // sent_no_receipt: enviados a proveedor que aún no tienen recibo guardado.
        return !!p.sentToSupplier && !!receiptProjectIds && !receiptProjectIds.has(p.projectId);
      });
    }

    if (statusFilter !== 'all') {
      // "Listos" = listos para fabricación; "Pendientes" = todo lo demás
      // (mismo criterio que las estadísticas de arriba).
      result = result.filter(p => statusFilter === 'ready' ? p.status === 'ready_for_fabrication' : p.status !== 'ready_for_fabrication');
    }

    // Búsqueda insensible a tildes/mayúsculas y por PALABRAS (tokens): "juan perez"
    // encuentra "Juan Pérez Gómez" aunque las palabras no estén pegadas ni acentuadas.
    const tokens = normalizeText(searchTerm).split(/\s+/).filter(Boolean);
    if (tokens.length) {
      result = result.filter(p => {
        const haystack = normalizeText([p.clientName, p.contactPhone, p.siteName, p.address, p.code].filter(Boolean).join(' '));
        return tokens.every(token => haystack.includes(token));
      });
    }

    return result;
  }, [visibleProjects, searchTerm, dateFilter, supplierFilter, statusFilter, receiptProjectIds]);

  // Cuántos pedidos enviados a proveedor NO tienen recibo (la alarma).
  const sentWithoutReceiptCount = useMemo(() => {
    if (!receiptProjectIds) return 0;
    return visibleProjects.filter(p => p.sentToSupplier && !receiptProjectIds.has(p.projectId)).length;
  }, [visibleProjects, receiptProjectIds]);

  // Cuántos pedidos tienen recibo generado pero NO se enviaron a proveedor.
  const receiptNotSentCount = useMemo(() => {
    if (!receiptProjectIds) return 0;
    return visibleProjects.filter(p => !p.sentToSupplier && receiptProjectIds.has(p.projectId)).length;
  }, [visibleProjects, receiptProjectIds]);
  
  const reportProfiles: Array<{ profile: PdfReportProfile; label: string }> = [
    { profile: 'client', label: 'Cliente' },
    { profile: 'supplier', label: 'Proveedor' },
    { profile: 'installer', label: 'Instalador' },
    { profile: 'internal', label: 'Interno' },
  ];

  const duplicateProject = (projectId: number) => {
    if (!confirm('¿Deseas duplicar este proyecto? Se creará una copia exacta para que puedas editarla sin afectar la original.')) return;
    try {
      const newId = duplicateFallbackProject(projectId);
      if (newId) {
        toast.success('Proyecto duplicado con éxito');
      } else {
        // El proyecto ya no estaba en el store (no lanzó, sólo no encontró la copia).
        toast.error('No se encontró el proyecto para duplicar. Recarga la lista e intenta de nuevo.');
      }
    } catch (e) {
      // Antes esto fallaba en silencio (sin toast) cuando la memoria del
      // dispositivo estaba llena => "a veces no me duplica alguna tarjeta".
      console.error('Error al duplicar el proyecto:', e);
      toast.error('No se pudo duplicar: memoria del dispositivo llena. Libera espacio (elimina fotos o proyectos viejos) e intenta de nuevo.', { duration: 6000 });
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
      // Las fotos viven fuera del proyecto: hay que traerlas para el <img> del PDF.
      const conFotos = await hydrateProjectPhotos(project);
      const html = generateReportHtml([conFotos], catalog || DEFAULT_CATALOG, profile);
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
        <Stat label="Proyectos" value={visibleProjects.length} tone="blue" />
        <Stat label="Pendientes" value={visibleProjects.filter(p => p.status !== 'ready_for_fabrication').length} tone="amber" />
        <Stat label="Listos" value={visibleProjects.filter(p => p.status === 'ready_for_fabrication').length} tone="green" />
      </section>

      <div className="section-title list-title">
        <div>
          <h2>Proyectos activos</h2>
          <p className="muted">Mostrando {filteredProjects.length} de {visibleProjects.length} proyectos</p>
        </div>
      </div>

      <section className="filters-panel">
        <div className="filters-search-row">
          <div className="search-wrap">
            <DocumentMagnifyingGlassIcon className="icon search-ic" />
            <input
              className="search-input"
              type="search"
              placeholder="Buscar cliente, teléfono, dirección..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" className="search-clear" onClick={() => setSearchTerm('')} aria-label="Limpiar búsqueda">✕</button>
            )}
          </div>
          <select className="filter-select" value={dateFilter} onChange={e => setDateFilter(e.target.value as any)}>
            <option value="all">Todas las fechas</option>
            <option value="today">Hoy</option>
            <option value="week">Esta semana</option>
            <option value="month">Este mes</option>
          </select>
        </div>

        {role === 'admin' && (
          <div className="filters-select-row">
            <div className="filter-group">
              <span className="filter-label">Envío a proveedor</span>
              <select className="filter-select wide" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value as any)}>
                <option value="all">Todos</option>
                <option value="sent">✓ Enviados a proveedor</option>
                <option value="unsent">Sin enviar</option>
                {(sentWithoutReceiptCount > 0 || supplierFilter === 'sent_no_receipt') && (
                  <option value="sent_no_receipt">⚠ Enviados sin recibo ({sentWithoutReceiptCount})</option>
                )}
                {(receiptNotSentCount > 0 || supplierFilter === 'receipt_not_sent') && (
                  <option value="receipt_not_sent">🧾 Con recibo sin enviar ({receiptNotSentCount})</option>
                )}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Estado del proyecto</span>
              <select className="filter-select wide" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                <option value="all">Todos</option>
                <option value="pending">Pendientes</option>
                <option value="ready">✓ Listos para fabricación</option>
              </select>
            </div>
          </div>
        )}
      </section>

      <section className="list">
        {filteredProjects.map(project => {
          return (
            <article key={project.projectId} className={`project-card ${project.isClone ? 'is-clone' : ''}`}>
              <button 
                className="project-open" 
                onClick={() => {
                  if (role === 'proveedor') {
                    navigate(`/project/${project.projectId}/supplier-view`);
                  } else {
                    navigate(`/project/${project.projectId}/spaces`);
                  }
                }}
              >
                <div>
                  <strong>{project.clientName || 'Proyecto sin cliente'}</strong>
                  <span>{project.siteName || project.address || project.code}</span>
                  {role === 'admin' && !project.sentToSupplier && receiptProjectIds && receiptProjectIds.has(project.projectId) && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); markAsSentLocally(project.projectId); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); markAsSentLocally(project.projectId); } }}
                      title="Este pedido tiene recibo pero no se marcó como enviado. Toca para marcarlo como enviado (sin subir a la nube)."
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '11px', fontWeight: 800, color: '#b45309', background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.5)', borderRadius: '999px', padding: '3px 9px', cursor: 'pointer' }}
                    >
                      🧾 Con recibo · sin enviar — marcar enviado
                    </span>
                  )}
                  {role === 'admin' && project.sentToSupplier && (
                    receiptProjectIds && !receiptProjectIds.has(project.projectId) ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); openReceiptFor(project.projectId); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); openReceiptFor(project.projectId); } }}
                        title="Este pedido fue enviado a proveedor pero no tiene recibo. Toca para generarlo."
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '11px', fontWeight: 800, color: '#dc2626', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.5)', borderRadius: '999px', padding: '3px 9px', cursor: 'pointer' }}
                      >
                        ⚠ Enviado SIN recibo — generar
                      </span>
                    ) : (
                      <span style={{ display: 'inline-block', marginTop: '6px', fontSize: '11px', fontWeight: 800, color: '#16a34a', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.4)', borderRadius: '999px', padding: '3px 9px' }}>
                        ✓ Enviado a proveedor{receiptProjectIds ? ' · 🧾 con recibo' : ''}
                      </span>
                    )
                  )}
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
                {role === 'proveedor' && <ProjectSupplierBadge project={project} />}
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
              {role === 'proveedor' && (
                <div className="project-report-actions" style={{ justifyContent: 'center', marginTop: '10px', paddingBottom: '10px' }}>
                  <button
                    type="button"
                    className="report-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      generateReport(project, 'supplier');
                    }}
                    style={{ background: 'var(--blue)', color: 'white', borderColor: 'var(--blue)', width: '100%', padding: '10px' }}
                  >
                    <DocumentArrowDownIcon className="icon" /> Abrir PDF de Fabricación
                  </button>
                </div>
              )}
              {role === 'admin' && (() => {
                const open = expandedActions === project.projectId;
                return (
                  <div className="card-actions">
                    <div className="card-actions-bar">
                      <button type="button" className="card-act" onClick={() => navigate(`/project/${project.projectId}`)}>
                        <IdentificationIcon className="icon" /> Editar datos
                      </button>
                      <button type="button" className="card-act" onClick={() => openReceiptFor(project.projectId)}>
                        🧾 Recibo
                      </button>
                      <button type="button" className={`card-act toggle ${open ? 'open' : ''}`} onClick={() => setExpandedActions(open ? null : project.projectId)}>
                        {open ? 'Menos' : 'Más'} <ChevronDownIcon className="icon" />
                      </button>
                    </div>
                    {open && (
                      <div className="card-actions-menu">
                        <button type="button" className="card-menu-item" onClick={() => navigate(`/project/${project.projectId}/quote`)}>
                          <CalculatorIcon className="icon" /> Cotización rápida
                        </button>
                        <button type="button" className="card-menu-item" onClick={() => navigate(`/project/${project.projectId}/detail`)}>
                          <DocumentMagnifyingGlassIcon className="icon" /> Ver detalle completo
                        </button>
                        <button type="button" className="card-menu-item" onClick={() => duplicateProject(project.projectId)}>
                          <DocumentDuplicateIcon className="icon" /> Duplicar proyecto
                        </button>
                        <button
                          type="button"
                          className="card-menu-item danger"
                          onClick={() => {
                            if (confirm('¿Mover este proyecto a la papelera?')) {
                              trashFallbackProject(project.projectId);
                              toast.success('Proyecto movido a papelera');
                            }
                          }}
                        >
                          <TrashIcon className="icon" /> Mover a papelera
                        </button>
                        <div className="card-menu-pdfs">
                          <span className="card-menu-label"><DocumentArrowDownIcon className="icon" style={{ width: 13, height: 13, display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Generar PDF</span>
                          <div className="pdf-pills">
                            {reportProfiles.map(item => (
                              <button
                                key={item.profile}
                                type="button"
                                className={`report-pill ${item.profile}`}
                                onClick={() => {
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
                              onClick={() => {
                                const fullProject = getFallbackProject(project.projectId);
                                if (fullProject) {
                                  const summary = technicalSummary(fullProject, catalog || DEFAULT_CATALOG);
                                  navigate('/facturacion', { state: { autoGenerateText: summary } });
                                }
                              }}
                            >
                              <SparklesIcon className="icon" style={{width: 14, height: 14, display: 'inline', marginRight: 4}} /> IA
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </article>
          );
        })}
        {visibleProjects.length === 0 && <div className="empty">Todavia no hay proyectos tecnicos.</div>}
        {visibleProjects.length > 0 && filteredProjects.length === 0 && (
          <div className="empty">
            Ningún proyecto coincide con los filtros.
            <button
              type="button"
              className="secondary small"
              style={{ marginTop: '10px' }}
              onClick={() => { setSearchTerm(''); setDateFilter('all'); setSupplierFilter('all'); setStatusFilter('all'); }}
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </section>

      <PdfPreviewModal htmlContent={previewHtml} onClose={() => setPreviewHtml(null)} />
      {showReceiptModal && activeProject && (() => {
        const activeSpaces = activeProject.spaces.filter(s => !s.isExcluded).map(s => ({
          ...s,
          windows: s.windows.filter(w => !w.isExcluded)
        }));
        
        const subtotalEstimate = activeSpaces.reduce((sum, space) => 
          sum + space.windows.reduce((wSum, win) => 
            wSum + win.solutions.reduce((sSum, sol) => 
              sSum + solutionTotal(sol)
            , 0)
          , 0)
        , 0);

        return (
          <PaymentReceiptModal 
            project={activeProject} 
            total={visibleProjects.find(p => p.projectId === activeProject.id)?.totalEstimate || 0}
            subtotal={subtotalEstimate}
            discountPercent={activeProject.discountPercent}
            onClose={() => {
              setShowReceiptModal(false);
              setActiveProject(null);
            }} 
          />
        );
      })()}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'blue' | 'amber' | 'green' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
