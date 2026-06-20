import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_CATALOG, db } from '../db';
import { isFallbackId, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';
import { solutionArea } from '../lib/metrics';
import type { TechnicalCatalog, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';

function formatMeasure(val?: number) {
  return val ? `${val} m` : '-';
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px'
};
const valueStyle: React.CSSProperties = { fontSize: '14px', color: '#fff' };

function Field({ label, value }: { label: string; value: string }) {
  if (!value || value === 'Sin definir') return null;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

function ProductCard({
  solution, windowLabel, spaceName, win, catalog
}: {
  solution: TechnicalSolution;
  windowLabel: string;
  spaceName: string;
  win: WindowRecord;
  catalog: TechnicalCatalog;
}) {
  const width = solution.quickQuote?.width || solution.assembly.fabricationWidth || 0;
  const height = solution.quickQuote?.height || solution.assembly.fabricationHeight || 0;
  const color = solution.color || solution.assembly.profileColor;

  // Custom window-level fields from the catalog
  const customFields = catalog.customWindowFields || [];
  const winCustomValues = win.customFields || {};

  return (
    <article className="supplier-product-card" style={{ background: '#242e3e', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid #374151' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #374151', paddingBottom: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#fff' }}>{solution.system || 'Persiana'}</h3>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{spaceName} &rsaquo; {windowLabel}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{solutionArea(solution).toFixed(2)} m²</div>
          <span style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Área</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Always show measures */}
        <div>
          <label style={labelStyle}>Medidas (Ancho x Alto)</label>
          <div style={{ fontSize: '16px', color: '#fff', fontWeight: '500' }}>
            {formatMeasure(width)} <span style={{ color: '#6b7280' }}>x</span> {formatMeasure(height)}
          </div>
        </div>

        <Field label="Tela / Material" value={solution.fabric || 'Sin definir'} />
        <Field label="Instalación" value={solution.layer || 'Sin definir'} />
        <Field label="Operación / Mando" value={solution.drive || 'Sin definir'} />
        <Field label="Lado del mando" value={solution.controlSide || 'Sin definir'} />
        <Field label="Color Perfilería" value={color || 'Sin definir'} />

        {/* Custom fields from mobile catalog */}
        {customFields.map(field => {
          const val = winCustomValues[field.id];
          return val ? <Field key={field.id} label={field.label} value={val} /> : null;
        })}
      </div>

      {/* Divisions / Tramos */}
      {solution.divisions.length > 0 && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: '8px' }}>Tramos / Divisiones</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
            {solution.divisions.map(part => (
              <div key={part.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>{part.label}</div>
                <div style={{ fontSize: '15px', color: '#fff', fontWeight: '600' }}>{part.width} m × {part.height} m</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {solution.notes && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: '4px' }}>Observaciones</label>
          <p style={{ margin: 0, fontSize: '14px', color: '#e5e7eb', lineHeight: '1.5' }}>{solution.notes}</p>
        </div>
      )}
    </article>
  );
}

export function SupplierWindowView() {
  const { id, spaceId, windowId } = useParams();
  const numericId = Number(id);
  const fallbackProject = useFallbackProject(id);
  const fallbackCatalog = useFallbackCatalog();
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => isFallbackId(numericId) ? Promise.resolve(undefined) : db.projects.get(numericId), [numericId]);
  const dbCatalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(v => v || DEFAULT_CATALOG), []);
  const project = fallbackProject || dbProject;
  const catalog = dbCatalog || fallbackCatalog || DEFAULT_CATALOG;
  const space = project?.spaces.find(s => s.id === spaceId);
  const win = space?.windows.find(w => w.id === windowId);

  if (!project || !space || !win) return <div className="page"><div className="empty">Cargando persianas...</div></div>;

  const totalAreaM2 = win.solutions.reduce((sum, sol) => sum + (sol.itemType !== 'maintenance' ? solutionArea(sol) : 0), 0);
  const totalSolutions = win.solutions.filter(s => s.itemType !== 'maintenance').length;

  return (
    <div className="page" style={{ paddingBottom: '100px' }}>
      <PageHeader title={win.label} subtitle={`${project.clientName || project.code} - ${space.name}`} backTo={`/project/${project.id}/space/${space.id}`} />

      <section className="panel" style={{ background: 'var(--blue)', color: 'white', borderColor: 'var(--blue)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: '0 0 4px 0' }}>Resumen de la Ventana</h2>
            <p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>Persianas a fabricar para esta ubicación.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalAreaM2.toFixed(2)} m²</div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{totalSolutions} persianas</div>
          </div>
        </div>
      </section>

      {win.solutions.length === 0 ? (
        <div className="empty">Esta ventana no tiene persianas para fabricar.</div>
      ) : (
        <div className="supplier-spaces-container">
          {win.solutions.filter(s => s.itemType !== 'maintenance').map(sol => (
            <ProductCard
              key={sol.id}
              solution={sol}
              windowLabel={win.label}
              spaceName={space.name}
              win={win}
              catalog={catalog}
            />
          ))}
        </div>
      )}
    </div>
  );
}
