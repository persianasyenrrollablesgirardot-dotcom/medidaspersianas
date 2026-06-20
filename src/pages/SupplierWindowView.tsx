import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_CATALOG, db } from '../db';
import { isFallbackId, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';
import { solutionArea } from '../lib/metrics';
import { setSupplierStatus, supplierStatusDocId, useSupplierStatuses } from '../lib/supplierStatus';
import type { TechnicalCatalog, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';

function formatMeasure(val?: number) {
  return val ? `${val} m` : '-';
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px'
};

function FieldItem({ label, value }: { label: string; value: string }) {
  if (!value || value === 'Sin definir') return null;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ fontSize: '14px', color: '#fff' }}>{value}</div>
    </div>
  );
}

function ProductCard({
  solution, windowLabel, spaceName, win, catalog, isGestionado, onToggle
}: {
  solution: TechnicalSolution;
  windowLabel: string;
  spaceName: string;
  win: WindowRecord;
  catalog: TechnicalCatalog;
  isGestionado: boolean;
  onToggle: () => void;
}) {
  const width = solution.quickQuote?.width || solution.assembly.fabricationWidth || 0;
  const height = solution.quickQuote?.height || solution.assembly.fabricationHeight || 0;
  const color = solution.color || solution.assembly.profileColor;
  const customFields = catalog.customWindowFields || [];
  const winCustomValues = win.customFields || {};

  return (
    <article style={{
      background: isGestionado ? '#1a2e1a' : '#242e3e',
      borderRadius: '12px', padding: '16px', marginBottom: '16px',
      border: `2px solid ${isGestionado ? '#16a34a' : '#374151'}`,
      transition: 'all 0.3s ease'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${isGestionado ? '#166534' : '#374151'}`, paddingBottom: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#fff' }}>{solution.system || 'Persiana'}</h3>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{spaceName} › {windowLabel}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{solutionArea(solution).toFixed(2)} m²</div>
          <span style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Área</span>
        </div>
      </div>

      {/* Fields grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>Medidas (Ancho x Alto)</label>
          <div style={{ fontSize: '16px', color: '#fff', fontWeight: '500' }}>
            {formatMeasure(width)} <span style={{ color: '#6b7280' }}>x</span> {formatMeasure(height)}
          </div>
        </div>
        <FieldItem label="Tela / Material" value={solution.fabric || 'Sin definir'} />
        <FieldItem label="Instalación" value={solution.layer || 'Sin definir'} />
        <FieldItem label="Operación / Mando" value={solution.drive || 'Sin definir'} />
        <FieldItem label="Lado del mando" value={solution.controlSide || 'Sin definir'} />
        <FieldItem label="Color Perfilería" value={color || 'Sin definir'} />
        {customFields.map(field => {
          const val = winCustomValues[field.id];
          return val ? <FieldItem key={field.id} label={field.label} value={val} /> : null;
        })}
      </div>

      {/* Divisions */}
      {solution.divisions.length > 0 && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
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

      {/* Notes */}
      {solution.notes && (
        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: '4px' }}>Observaciones</label>
          <p style={{ margin: 0, fontSize: '14px', color: '#e5e7eb', lineHeight: '1.5' }}>{solution.notes}</p>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: isGestionado ? '#16a34a' : '#2563eb',
          color: 'white', fontWeight: 'bold', fontSize: '15px',
          transition: 'background 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}
      >
        {isGestionado ? '✓ Pedido Gestionado' : '📤 Marcar como Gestionado'}
      </button>
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

  const docId = supplierStatusDocId(project?.id, project?.code);
  const statuses = useSupplierStatuses(project ? docId : undefined);

  if (!project || !space || !win) return <div className="page"><div className="empty">Cargando persianas...</div></div>;

  const blinds = win.solutions.filter(s => s.itemType !== 'maintenance');
  const totalAreaM2 = blinds.reduce((sum, sol) => sum + solutionArea(sol), 0);
  const gestionadas = blinds.filter(s => statuses[s.id]).length;
  const allDone = gestionadas === blinds.length && blinds.length > 0;

  const toggle = async (solutionId: string) => {
    await setSupplierStatus(docId, solutionId, !statuses[solutionId]);
  };

  return (
    <div className="page" style={{ paddingBottom: '100px' }}>
      <PageHeader title={win.label} subtitle={`${project.clientName || project.code} - ${space.name}`} backTo={`/project/${project.id}/space/${space.id}`} />

      {/* Summary banner */}
      <section className="panel" style={{
        background: allDone ? '#16a34a' : 'var(--blue)', color: 'white',
        borderColor: allDone ? '#16a34a' : 'var(--blue)', marginBottom: '24px',
        transition: 'background 0.4s'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: '0 0 4px 0' }}>
              {allDone ? '✓ Ventana Completa' : 'Persianas a Fabricar'}
            </h2>
            <p style={{ margin: 0, opacity: 0.85, fontSize: '14px' }}>
              {gestionadas} de {blinds.length} gestionadas
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalAreaM2.toFixed(2)} m²</div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{blinds.length} persianas</div>
          </div>
        </div>
      </section>

      {blinds.length === 0 ? (
        <div className="empty">Esta ventana no tiene persianas para fabricar.</div>
      ) : (
        <div>
          {blinds.map(sol => (
            <ProductCard
              key={sol.id}
              solution={sol}
              windowLabel={win.label}
              spaceName={space.name}
              win={win}
              catalog={catalog}
              isGestionado={!!statuses[sol.id]}
              onToggle={() => toggle(sol.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
