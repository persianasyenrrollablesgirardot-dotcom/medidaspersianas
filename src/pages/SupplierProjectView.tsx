import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { db } from '../db';
import { isFallbackId, useFallbackProject } from '../lib/localFallbackStore';
import { solutionArea } from '../lib/metrics';
import { setSupplierStatus, supplierStatusDocId, useSupplierStatuses } from '../lib/supplierStatus';
import type { TechnicalProject, TechnicalSolution } from '../types';

function formatMeasure(val?: number) {
  return val ? `${val} m` : '-';
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px',
};

/**
 * Tarjeta REDUCIDA para el proveedor: solo lo que necesita el taller para
 * fabricar (medidas, tela, mando, color, observaciones). NO muestra campos
 * personalizados, tramos/divisiones ni mantenimientos — esos son datos internos.
 */
function ProductCard({
  solution, windowLabel, spaceName, isGestionado, onToggle,
}: {
  solution: TechnicalSolution;
  windowLabel: string;
  spaceName: string;
  isGestionado: boolean;
  onToggle: () => void;
}) {
  const width = solution.quickQuote?.width || solution.assembly.fabricationWidth || 0;
  const height = solution.quickQuote?.height || solution.assembly.fabricationHeight || 0;
  const color = solution.color || solution.assembly.profileColor;

  return (
    <article style={{
      background: isGestionado ? '#1a2e1a' : '#242e3e',
      borderRadius: '12px', padding: '16px', marginBottom: '16px',
      border: `2px solid ${isGestionado ? '#16a34a' : '#374151'}`,
      transition: 'all 0.3s ease',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${isGestionado ? '#166534' : '#374151'}`, paddingBottom: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#fff' }}>{solution.system || 'Persiana'}</h3>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{spaceName} &rsaquo; {windowLabel}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{solutionArea(solution).toFixed(2)} m²</div>
          <span style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Área</span>
        </div>
      </div>

      {/* Campos reducidos (solo lo de taller) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Medidas (Ancho x Alto)</label>
          <div style={{ fontSize: '16px', color: '#fff', fontWeight: '500' }}>
            {formatMeasure(width)} <span style={{ color: '#6b7280' }}>x</span> {formatMeasure(height)}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Tela / Material</label>
          <div style={{ fontSize: '14px', color: '#fff' }}>{solution.fabric || 'Sin definir'}</div>
        </div>
        <div>
          <label style={labelStyle}>Mando / Operación</label>
          <div style={{ fontSize: '14px', color: '#fff' }}>{solution.controlSide || 'Sin definir'}</div>
        </div>
        <div>
          <label style={labelStyle}>Color Perfilería</label>
          <div style={{ fontSize: '14px', color: '#fff' }}>{color || 'Sin definir'}</div>
        </div>
      </div>

      {/* Observaciones */}
      {solution.notes && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          <label style={labelStyle}>Observaciones</label>
          <p style={{ margin: 0, fontSize: '14px', color: '#e5e7eb', lineHeight: '1.5' }}>{solution.notes}</p>
        </div>
      )}

      {/* Botón marcar (tiempo real) */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', marginTop: '16px', padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: isGestionado ? '#16a34a' : '#2563eb',
          color: 'white', fontWeight: 'bold', fontSize: '15px', transition: 'background 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        {isGestionado ? '✓ Pedido Gestionado' : '📤 Marcar como Gestionado'}
      </button>
    </article>
  );
}

/**
 * Vista del proveedor a nivel PROYECTO: una sola "Orden de Producción" con
 * todas las persianas a fabricar en una lista (plana, agrupada por espacio).
 * Restaurada a como funcionaba antes de junio 2026, sumando el botón de marcar.
 */
export function SupplierProjectView() {
  const { id } = useParams();
  const numericId = Number(id);
  const fallbackProject = useFallbackProject(id);
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => isFallbackId(numericId) ? Promise.resolve(undefined) : db.projects.get(numericId), [numericId]);
  const project = fallbackProject || dbProject;

  const docId = supplierStatusDocId(project?.id, project?.code);
  const statuses = useSupplierStatuses(project ? docId : undefined);

  if (!project) return <div className="page"><div className="empty">Cargando proyecto para producción...</div></div>;

  // Solo espacios/ventanas activos, y solo persianas (sin mantenimientos ni ítems internos)
  const activeSpaces = project.spaces
    .filter(s => !s.isExcluded)
    .map(s => ({
      ...s,
      windows: s.windows
        .filter(w => !w.isExcluded)
        .map(w => ({ ...w, solutions: w.solutions.filter(sol => sol.itemType !== 'maintenance') })),
    }));

  const allBlinds = activeSpaces.flatMap(s => s.windows.flatMap(w => w.solutions));
  const totalAreaM2 = allBlinds.reduce((sum, sol) => sum + solutionArea(sol), 0);
  const totalSolutions = allBlinds.length;
  const gestionadas = allBlinds.filter(sol => statuses[sol.id]).length;
  const allDone = totalSolutions > 0 && gestionadas === totalSolutions;

  const toggle = async (solutionId: string) => {
    await setSupplierStatus(docId, solutionId, !statuses[solutionId]);
  };

  return (
    <div className="page" style={{ paddingBottom: '100px' }}>
      <PageHeader title="Orden de Producción" subtitle={project.clientName || project.code} backTo="/" />

      <section className="panel" style={{
        background: allDone ? '#16a34a' : 'var(--blue)', color: 'white',
        borderColor: allDone ? '#16a34a' : 'var(--blue)', marginBottom: '24px', transition: 'background 0.4s',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '20px', margin: '0 0 4px 0' }}>{allDone ? '✓ Producción Completa' : 'Resumen de Fabricación'}</h2>
            <p style={{ margin: 0, opacity: 0.85, fontSize: '14px' }}>{gestionadas} de {totalSolutions} gestionadas</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalAreaM2.toFixed(2)} m²</div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{totalSolutions} persianas</div>
          </div>
        </div>
      </section>

      {totalSolutions === 0 ? (
        <div className="empty">No hay persianas a fabricar en este proyecto.</div>
      ) : (
        <div className="supplier-spaces-container">
          {activeSpaces.map((space, i) => {
            const spaceSolutionsCount = space.windows.reduce((acc, win) => acc + win.solutions.length, 0);
            if (spaceSolutionsCount === 0) return null;

            return (
              <div key={space.id} style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', color: '#fff', borderBottom: '2px solid #374151', paddingBottom: '8px', marginBottom: '16px' }}>
                  {i + 1}. {space.name}
                </h2>
                <div>
                  {space.windows.map(win => (
                    win.solutions.map(sol => (
                      <ProductCard
                        key={sol.id}
                        solution={sol}
                        windowLabel={win.label}
                        spaceName={space.name}
                        isGestionado={!!statuses[sol.id]}
                        onToggle={() => toggle(sol.id)}
                      />
                    ))
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
