import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { DocumentArrowDownIcon, IdentificationIcon } from '@heroicons/react/24/outline';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_CATALOG, db } from '../db';
import { openPrintableReport, type PdfReportProfile } from '../lib/exporters';
import { quoteArea, quoteTotal, solutionArea } from '../lib/metrics';
import type { TechnicalCatalog, TechnicalProject, TechnicalSolution } from '../types';
import { isFallbackId, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';

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

  if (!project) {
    return <div className="page"><div className="empty">Cargando detalle del proyecto...</div></div>;
  }

  const windows = project.spaces.reduce((sum, space) => sum + space.windows.length, 0);
  const solutions = project.spaces.reduce((sum, space) => sum + space.windows.reduce((wSum, win) => wSum + win.solutions.length, 0), 0);
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
            <button key={item.profile} className="secondary" type="button" onClick={() => openPrintableReport([project], catalog, item.profile)}>
              <DocumentArrowDownIcon className="icon" /> {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel detail-cover">
        <button className="secondary detail-edit-button" type="button" onClick={() => navigate(`/project/${project.id}`)}>
          <IdentificationIcon className="icon" /> Editar datos basicos
        </button>
        <div className="detail-cover-grid">
          <DetailValue label="Cliente" value={project.clientName || 'Sin definir'} />
          <DetailValue label="Cedula / NIT" value={project.clientDocument || 'Sin definir'} />
          <DetailValue label="Telefono" value={project.contactPhone || 'Sin definir'} />
          <DetailValue label="Lugar" value={project.siteName || 'Sin definir'} />
          <DetailValue label="Ciudad" value={project.city || 'Sin definir'} />
          <DetailValue label="Direccion" value={project.address || 'Sin definir'} />
        </div>
        <div className="detail-kpis">
          <DetailValue label="Espacios" value={project.spaces.length} />
          <DetailValue label="Ventanas" value={windows} />
          <DetailValue label="Persianas" value={solutions} />
        </div>
      </section>

      <section className="detail-space-list">
        {project.spaces.map((space, spaceIndex) => (
          <article key={space.id} className="detail-space">
            <div className="detail-section-title">
              <span>Espacio {spaceIndex + 1}</span>
              <h2>{space.name}</h2>
              {space.notes && <p>{space.notes}</p>}
            </div>

            {space.windows.map((win, windowIndex) => (
              <div key={win.id} className="detail-window">
                <div className="detail-window-head">
                  <div>
                    <span>Ventana {windowIndex + 1}</span>
                    <h3>{win.label}</h3>
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

function DetailValue({ label, value }: { label: string; value: string | number }) {
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
