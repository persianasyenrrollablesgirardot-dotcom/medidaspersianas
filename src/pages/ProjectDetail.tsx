import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentArrowDownIcon, IdentificationIcon, SparklesIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_CATALOG, db } from '../db';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { generateReportHtml, technicalSummary, type PdfReportProfile } from '../lib/exporters';
import { isFallbackId, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';
import { saveProject } from '../lib/projectStore';
import { PdfPreviewModal } from '../components/PdfPreviewModal';
import { quoteArea, quoteTotal, solutionArea } from '../lib/metrics';
import type { TechnicalCatalog, TechnicalProject, TechnicalSolution } from '../types';

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const numericProjectId = Number(id);
  const fallbackMode = isFallbackId(numericProjectId);
  const fallbackProject = useFallbackProject(id);
  const fallbackCatalog = useFallbackCatalog();
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => fallbackMode ? Promise.resolve(undefined) : db.projects.get(numericProjectId), [fallbackMode, numericProjectId]);
  const project = fallbackProject || dbProject;
  const dbCatalog = useLiveQuery<TechnicalCatalog | undefined>(() => fallbackMode ? Promise.resolve(undefined) : db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), [fallbackMode]);
  const catalog = fallbackMode ? fallbackCatalog : (dbCatalog || DEFAULT_CATALOG);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const generateReport = async (profile: PdfReportProfile) => {
    if (!project) return;
    try {
      const html = generateReportHtml([project], catalog || DEFAULT_CATALOG, profile);
      setPreviewHtml(html);
    } catch (e) {
      console.error(e);
      toast.error('Error al generar la vista preliminar', { id: 'pdf' });
    }
  };

  const toggleSpaceExclusion = async (spaceIndex: number, current: boolean) => {
    if (!project) return;
    const p = { ...project, spaces: project.spaces.map((s, i) => i === spaceIndex ? { ...s, isExcluded: !current } : s) };
    await saveProject(p as TechnicalProject);
  };

  const toggleWindowExclusion = async (spaceIndex: number, windowIndex: number, current: boolean) => {
    if (!project) return;
    const p = {
      ...project,
      spaces: project.spaces.map((s, sIdx) => sIdx === spaceIndex ? {
        ...s,
        windows: s.windows.map((w, wIdx) => wIdx === windowIndex ? { ...w, isExcluded: !current } : w)
      } : s)
    };
    await saveProject(p as TechnicalProject);
  };

  if (!project) {
    return <div className="page"><div className="empty">Cargando detalle del proyecto...</div></div>;
  }

  const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
    ...s,
    windows: s.windows.filter(w => !w.isExcluded)
  }));
  const windows = activeSpaces.reduce((sum, space) => sum + space.windows.length, 0);
  const solutions = activeSpaces.reduce((sum, space) => sum + space.windows.reduce((wSum, win) => wSum + win.solutions.length, 0), 0);
  
  const totalEstimate = activeSpaces.reduce((sum, space) => 
    sum + space.windows.reduce((wSum, win) => 
      wSum + win.solutions.reduce((sSum, sol) => 
        sSum + (sol.quickQuote ? quoteTotal(sol.quickQuote) : 0)
      , 0)
    , 0)
  , 0);

  const reportProfiles: Array<{ profile: PdfReportProfile; label: string }> = [
    { profile: 'client', label: 'PDF cliente' },
    { profile: 'supplier', label: 'PDF proveedor' },
    { profile: 'installer', label: 'PDF instalador' },
    { profile: 'internal', label: 'PDF interno' },
  ];

  return (
    <div className="page detail-page">
      <PageHeader title={project.clientName || 'Proyecto sin cliente'} subtitle={project.code} backTo="/" />
      <section className="panel report-profile-panel">
        <div>
          <h2>Reportes PDF</h2>
          <p className="muted">Cliente no incluye medidas internas; proveedor recibe variables tecnicas y campos personalizados.</p>
        </div>
        <div className="report-profile-actions">
          {reportProfiles.map(item => (
            <button key={item.profile} className="secondary" type="button" onClick={() => generateReport(item.profile)}>
              <DocumentArrowDownIcon className="icon" /> {item.label}
            </button>
          ))}
          <button 
            className="secondary" 
            style={{ borderColor: '#10b981', color: '#10b981' }}
            type="button" 
            onClick={() => {
              const summary = technicalSummary(project);
              navigate('/facturacion', { state: { autoGenerateText: summary } });
            }}
          >
            <SparklesIcon className="icon" /> Generar Factura / Cot. con IA
          </button>
        </div>
      </section>

      <section className="panel detail-cover">
        <button className="secondary detail-edit-button" type="button" onClick={() => navigate(`/project/${project.id}`)}>
          <IdentificationIcon className="icon" /> Editar datos basicos
        </button>
        <div className="detail-cover-grid">
          <DetailValue label="Cliente" value={project.clientName || 'Sin definir'} />
          <DetailValue label="Cedula / NIT" value={project.clientDocument || 'Sin definir'} />
          <DetailValue label="Telefono" value={
            project.contactPhone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{project.contactPhone}</span>
                <button 
                  className="secondary" 
                  onClick={(e) => {
                    e.stopPropagation();
                    const cleaned = project.contactPhone!.replace(/\D/g, '');
                    if (cleaned) {
                      const phoneStr = cleaned.length === 10 ? `57${cleaned}` : cleaned;
                      window.open(`https://wa.me/${phoneStr}`, '_blank');
                    }
                  }}
                  title="Enviar mensaje por WhatsApp"
                  style={{ padding: '4px 8px', minHeight: 'auto', borderColor: '#25D366', color: '#25D366' }}
                >
                  <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.06-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.571-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                </button>
              </div>
            ) : 'Sin definir'
          } />
          <DetailValue label="Lugar" value={project.siteName || 'Sin definir'} />
          <DetailValue label="Ciudad" value={project.city || 'Sin definir'} />
          <DetailValue label="Direccion" value={project.address || 'Sin definir'} />
        </div>
        <div className="detail-kpis">
          <DetailValue label="Espacios" value={activeSpaces.length} />
          <DetailValue label="Ventanas" value={windows} />
          <DetailValue label="Persianas" value={solutions} />
          <DetailValue label="Total Proyecto" value={`$ ${totalEstimate.toLocaleString('es-CO')}`} />
        </div>
      </section>

      <section className="detail-space-list">
        {project.spaces.map((space, spaceIndex) => (
          <article key={space.id} className="detail-space" style={{ opacity: space.isExcluded ? 0.4 : 1, transition: 'opacity 0.2s' }}>
            <div className="detail-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span>Espacio {spaceIndex + 1}</span>
                <h2>{space.name}</h2>
                {space.notes && <p>{space.notes}</p>}
              </div>
              <button 
                type="button" 
                className="ghost" 
                onClick={() => toggleSpaceExclusion(spaceIndex, !!space.isExcluded)}
                title={space.isExcluded ? 'Incluir espacio' : 'Excluir espacio temporalmente'}
              >
                {space.isExcluded ? <EyeSlashIcon className="icon" style={{ width: '24px' }} /> : <EyeIcon className="icon" style={{ width: '24px' }} />}
              </button>
            </div>

            {space.windows.map((win, windowIndex) => (
              <div key={win.id} className="detail-window" style={{ opacity: win.isExcluded ? 0.4 : 1, transition: 'opacity 0.2s' }}>
                <div className="detail-window-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <span>Ventana {windowIndex + 1}</span>
                      <h3>{win.label}</h3>
                    </div>
                    <button 
                      type="button" 
                      className="ghost" 
                      onClick={() => toggleWindowExclusion(spaceIndex, windowIndex, !!win.isExcluded)}
                      title={win.isExcluded ? 'Incluir ventana' : 'Excluir ventana temporalmente'}
                    >
                      {win.isExcluded ? <EyeSlashIcon className="icon" style={{ width: '20px' }} /> : <EyeIcon className="icon" style={{ width: '20px' }} />}
                    </button>
                  </div>
                  <div className="detail-tags">
                    <em>{win.openingType || 'Tipo pendiente'}</em>
                    <em>{win.shape || 'Forma pendiente'}</em>
                    <em>{win.quickMode === 'angle45' ? 'Corte 45 grados' : 'Sencilla'}</em>
                  </div>
                </div>

                {win.planTemplate && (
                  <div className="detail-plan">
                    <img src={win.planTemplate.imageUrl} alt={win.planTemplate.label} />
                    <div>
                      <strong>{win.planTemplate.label}</strong>
                      <span>{win.planTemplate.layout} | {win.planTemplate.solutionCount} persianas | {win.planTemplate.rollDirection === 'front' ? 'Enrolla por frente' : 'Enrolla por detras'}</span>
                    </div>
                  </div>
                )}

                <div className="detail-grid">
                  <DetailValue label="Ancho vano sup/med/inf" value={`${formatMeasure(win.geometry.widthTop)} / ${formatMeasure(win.geometry.widthMiddle)} / ${formatMeasure(win.geometry.widthBottom)}`} />
                  <DetailValue label="Alto vano izq/cent/der" value={`${formatMeasure(win.geometry.heightLeft)} / ${formatMeasure(win.geometry.heightCenter)} / ${formatMeasure(win.geometry.heightRight)}`} />
                  <DetailValue label="Profundidad" value={formatMeasure(win.geometry.depth)} />
                  <DetailValue label="Angulo" value={win.geometry.angleDegrees ? `${win.geometry.angleDegrees} grados` : 'Sin definir'} />
                  <DetailValue label="Nivel" value={win.geometry.levelStatus || 'Sin definir'} />
                </div>

                {catalog?.customWindowFields?.length ? (
                  <div className="detail-custom">
                    <strong>Campos personalizados</strong>
                    <div className="detail-grid">
                      {catalog.customWindowFields.map(field => (
                        <DetailValue key={field.id} label={field.label} value={win.customFields?.[field.id] || 'Sin definir'} />
                      ))}
                    </div>
                  </div>
                ) : null}

                {win.siteConditions.length > 0 && (
                  <div className="detail-custom">
                    <strong>Condiciones del sitio</strong>
                    <div className="detail-tags">
                      {win.siteConditions.map(condition => <em key={condition.id}>{condition.label} | {condition.severity}</em>)}
                    </div>
                  </div>
                )}

                <div className="detail-solution-list">
                  {win.solutions.map((solution, solutionIndex) => (
                    <SolutionDetail key={solution.id} solution={solution} index={solutionIndex} />
                  ))}
                </div>
              </div>
            ))}

            {space.windows.length === 0 && <div className="empty">Este espacio todavia no tiene ventanas.</div>}
          </article>
        ))}
      </section>

      <PdfPreviewModal htmlContent={previewHtml} onClose={() => setPreviewHtml(null)} />
    </div>
  );
}

function SolutionDetail({ solution, index }: { solution: TechnicalSolution; index: number }) {
  const q = solution.quickQuote;
  return (
    <article className="detail-solution">
      <div className="detail-window-head">
        <div>
          <span>Persiana {index + 1}</span>
          <h3>{solution.name}</h3>
        </div>
        <div className="detail-tags">
          <em>{solution.layer}</em>
          <em>{solution.system}</em>
          <em>{solution.status}</em>
        </div>
      </div>

      <div className="detail-grid">
        <DetailValue label="Tela" value={solution.fabric || 'Sin definir'} />
        <DetailValue label="Color" value={solution.color || solution.assembly.profileColor || 'Sin definir'} />
        <DetailValue label="Operacion" value={solution.drive} />
        <DetailValue label="Control" value={solution.controlSide || 'Sin definir'} />
        <DetailValue label="Rapida ancho x alto" value={q ? `${formatMeasure(q.width)} x ${formatMeasure(q.height)}` : 'Sin definir'} />
        <DetailValue label="m2 rapida" value={q ? `${quoteArea(q).toFixed(2)} m2` : 'Sin definir'} />
        <DetailValue label="Precio m2" value={q?.pricePerM2 ? q.pricePerM2.toLocaleString('es-CO') : 'Sin definir'} />
        <DetailValue label="Total estimado" value={q ? `${quoteTotal(q).toLocaleString('es-CO')} COP` : 'Sin definir'} />
        <DetailValue label="Fabricacion" value={`${formatMeasure(solution.assembly.fabricationWidth)} x ${formatMeasure(solution.assembly.fabricationHeight)}`} />
        <DetailValue label="Area tecnica" value={`${solutionArea(solution).toFixed(2)} m2`} />
      </div>

      {solution.divisions.length > 0 && (
        <div className="detail-custom">
          <strong>Divisiones</strong>
          <div className="detail-division-table">
            {solution.divisions.map(part => (
              <div key={part.id}>
                <span>{part.label}</span>
                <strong>{formatMeasure(part.width)} ancho</strong>
                <em>{formatMeasure(part.height)} alto</em>
              </div>
            ))}
          </div>
        </div>
      )}

      {solution.alerts.length > 0 && (
        <div className="detail-custom">
          <strong>Alertas</strong>
          {solution.alerts.map(alert => <p key={alert.id} className={`detail-alert ${alert.level}`}>{alert.message}</p>)}
        </div>
      )}

      {solution.notes && <p className="detail-note">{solution.notes}</p>}
    </article>
  );
}

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="detail-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMeasure(value?: number) {
  return value ? `${value.toFixed(2)} m` : 'Sin definir';
}
