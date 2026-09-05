import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_CATALOG, db } from '../db';
import { isFallbackId, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';
import { solutionArea } from '../lib/metrics';
import { setSupplierStatus, supplierStatusDocId, useSupplierStatuses } from '../lib/supplierStatus';
import type { TechnicalCatalog, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';

/**
 * Vista del proveedor (Orden de Producción). Muestra TODOS los datos técnicos
 * que necesita el taller, organizados por secciones. NO muestra datos personales
 * del cliente (excepto el nombre, como referencia) ni precios / valores en pesos.
 */

const fmtM = (v?: number) => (v ? `${v} m` : '');

const LAYER: Record<string, string> = { inside: 'Interior', outside: 'Exterior', wall: 'Muro', ceiling: 'Techo', frame: 'Marco', mixed: 'Mixto' };
const DRIVE: Record<string, string> = { manual: 'Manual', motor: 'Motorizado', none: '' };
const SIDE: Record<string, string> = { left: 'Izquierda', right: 'Derecha', center: 'Centro', none: '' };
const SURFACE: Record<string, string> = { concrete: 'Concreto', drywall: 'Drywall', wood: 'Madera', aluminum: 'Aluminio', tile: 'Baldosa', unknown: '' };
const POWER: Record<string, string> = { available: 'Disponible', missing: 'Falta', unknown: 'Sin confirmar' };
const lbl = (map: Record<string, string>, k?: string) => (k ? map[k] ?? k : '');

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' };

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '' || value === 'Sin definir') return null;
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ fontSize: '14px', color: '#fff' }}>{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
      <label style={{ ...labelStyle, marginBottom: '8px' }}>{title}</label>
      {children}
    </div>
  );
}

function ProductCard({ solution, windowLabel, spaceName, win, catalog, isGestionado, onToggle }: {
  solution: TechnicalSolution; windowLabel: string; spaceName: string; win: WindowRecord;
  catalog: TechnicalCatalog; isGestionado: boolean; onToggle: () => void;
}) {
  const s = solution;
  const esMant = s.itemType === 'maintenance';
  const width = s.quickQuote?.width || s.assembly.fabricationWidth || 0;
  const height = s.quickQuote?.height || s.assembly.fabricationHeight || 0;
  const color = s.color || s.assembly.profileColor;

  // Campos personalizados: etiquetas del snapshot del catálogo (subido a la nube), valores de la ventana.
  const customDefs: Array<{ id: string; label: string; options: string[] }> =
    (win as any).projectCatalogSnapshot?.customWindowFields || catalog.customWindowFields || [];
  const winCustom = win.customFields || {};
  const customConValor = customDefs.filter(f => winCustom[f.id]);

  // Mantenimientos / servicios seleccionados (sin precio).
  const tareasMant = (s.maintenance?.tasks || []).filter(t => t.selected);
  const motorizado = s.drive === 'motor' || !!s.motor;

  return (
    <article style={{
      background: isGestionado ? '#1a2e1a' : '#242e3e', borderRadius: '12px', padding: '16px', marginBottom: '16px',
      border: `2px solid ${isGestionado ? '#16a34a' : '#374151'}`, transition: 'all 0.3s ease',
    }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${isGestionado ? '#166534' : '#374151'}`, paddingBottom: '12px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#fff' }}>{esMant ? '🔧 ' : ''}{s.system || (esMant ? 'Mantenimiento' : 'Persiana')}</h3>
          <span style={{ fontSize: '14px', color: '#9ca3af' }}>{spaceName} &rsaquo; {windowLabel}</span>
        </div>
        {!esMant && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{solutionArea(s).toFixed(2)} m²</div>
            <span style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Área</span>
          </div>
        )}
      </div>

      {/* Datos principales */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {!esMant && (
          <div>
            <label style={labelStyle}>Medidas (Ancho x Alto)</label>
            <div style={{ fontSize: '16px', color: '#fff', fontWeight: '500' }}>
              {fmtM(width) || '-'} <span style={{ color: '#6b7280' }}>x</span> {fmtM(height) || '-'}
            </div>
          </div>
        )}
        <Field label="Tela / Material" value={s.fabric} />
        <Field label="Color" value={color} />
        <Field label="Instalación" value={lbl(LAYER, s.layer)} />
        <Field label="Operación" value={lbl(DRIVE, s.drive)} />
        <Field label="Lado del mando" value={lbl(SIDE, s.controlSide)} />
        <Field label="Sistema de montaje" value={s.mount} />
        <Field label="Superficie" value={lbl(SURFACE, s.surface)} />
        <Field label="Tipo de apertura" value={win.openingType} />
        <Field label="Forma" value={win.shape} />
      </div>

      {/* Campos personalizados */}
      {customConValor.length > 0 && (
        <Block title="Campos personalizados">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {customConValor.map(f => <Field key={f.id} label={f.label} value={winCustom[f.id]} />)}
          </div>
        </Block>
      )}

      {/* Detalles de fabricación */}
      {(s.assembly.tubeProfileRail || s.assembly.bracketType || s.assembly.valance || s.assembly.chainColor || s.assembly.bottomProfile || s.assembly.deductionNotes) && (
        <Block title="Detalles de fabricación">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Tubo / Riel" value={s.assembly.tubeProfileRail} />
            <Field label="Tipo de soporte" value={s.assembly.bracketType} />
            <Field label="Bandó / Cenefa" value={s.assembly.valance} />
            <Field label="Color de cadena" value={s.assembly.chainColor} />
            <Field label="Perfil inferior" value={s.assembly.bottomProfile} />
            <Field label="Notas de descuento" value={s.assembly.deductionNotes} />
          </div>
        </Block>
      )}

      {/* Divisiones / Tramos */}
      {s.divisions.length > 0 && (
        <Block title="Tramos / Divisiones">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
            {s.divisions.map(p => (
              <div key={p.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '8px' }}>
                <div style={{ fontSize: '12px', color: '#9ca3af' }}>{p.label}</div>
                <div style={{ fontSize: '15px', color: '#fff', fontWeight: '600' }}>{p.width} m × {p.height} m</div>
                {p.controlSide && p.controlSide !== 'none' && <div style={{ fontSize: '11px', color: '#9ca3af' }}>Mando: {lbl(SIDE, p.controlSide)}</div>}
                {p.notes && <div style={{ fontSize: '11px', color: '#e5e7eb', marginTop: '2px' }}>{p.notes}</div>}
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* Accesorios */}
      {s.accessories.length > 0 && (
        <Block title="Accesorios">
          {s.accessories.map(a => (
            <div key={a.id} style={{ fontSize: '13px', color: '#e5e7eb', padding: '2px 0' }}>
              • {a.name}{a.qty ? ` × ${a.qty}` : ''}{a.notes ? ` — ${a.notes}` : ''}
            </div>
          ))}
        </Block>
      )}

      {/* Motorización */}
      {motorizado && s.motor && (
        <Block title="Motorización">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Lado del motor" value={lbl(SIDE, s.motor.motorSide)} />
            <Field label="Punto eléctrico" value={lbl(POWER, s.motor.powerPoint)} />
            <Field label="Voltaje" value={s.motor.voltage} />
            <Field label="Canal / Control" value={s.motor.controlChannel} />
            <Field label="WiFi" value={s.motor.wifiNeeded ? 'Sí' : undefined} />
            <Field label="Notas motor" value={s.motor.notes} />
          </div>
        </Block>
      )}

      {/* Mantenimientos / Servicios */}
      {tareasMant.length > 0 && (
        <Block title="Mantenimientos / Servicios">
          {tareasMant.map(t => (
            <div key={t.id} style={{ fontSize: '13px', color: '#e5e7eb', padding: '2px 0' }}>• {t.label}</div>
          ))}
        </Block>
      )}

      {/* Nota rápida (quickQuote.note) */}
      {s.quickQuote?.note && (
        <Block title="Nota rápida">
          <p style={{ margin: 0, fontSize: '14px', color: '#e5e7eb', lineHeight: '1.5' }}>{s.quickQuote.note}</p>
        </Block>
      )}

      {/* Observaciones */}
      {s.notes && (
        <Block title="Observaciones">
          <p style={{ margin: 0, fontSize: '14px', color: '#e5e7eb', lineHeight: '1.5' }}>{s.notes}</p>
        </Block>
      )}

      {/* Alertas técnicas */}
      {s.alerts && s.alerts.length > 0 && (
        <Block title="Alertas técnicas">
          {s.alerts.map(a => (
            <div key={a.id} style={{ fontSize: '13px', color: a.level === 'blocker' ? '#f87171' : a.level === 'warning' ? '#fbbf24' : '#9ca3af', padding: '2px 0' }}>⚠ {a.message}</div>
          ))}
        </Block>
      )}

      {/* Botón marcar (tiempo real) */}
      <button onClick={onToggle} style={{
        width: '100%', marginTop: '16px', padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        background: isGestionado ? '#16a34a' : '#2563eb', color: 'white', fontWeight: 'bold', fontSize: '15px',
        transition: 'background 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}>
        {isGestionado ? '✓ Pedido Gestionado' : '📤 Marcar como Gestionado'}
      </button>
    </article>
  );
}

export function SupplierProjectView() {
  const { id } = useParams();
  const numericId = Number(id);
  const fallbackProject = useFallbackProject(id);
  const fallbackCatalog = useFallbackCatalog();
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => isFallbackId(numericId) ? Promise.resolve(undefined) : db.projects.get(numericId), [numericId]);
  const dbCatalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(v => v || DEFAULT_CATALOG), []);
  const project = fallbackProject || dbProject;
  const catalog = dbCatalog || fallbackCatalog || DEFAULT_CATALOG;

  const docId = supplierStatusDocId(project?.id, project?.code);
  const statuses = useSupplierStatuses(project ? docId : undefined);
  // En un pedido de 40 persianas, lo que el taller necesita ver es lo que le
  // FALTA. Es un filtro de vista del proveedor: no le esconde nada (arranca en
  // "Todos" y el conmutador esta siempre a la vista).
  const [soloPendientes, setSoloPendientes] = useState(false);

  if (!project) return <div className="page"><div className="empty">Cargando proyecto para producción...</div></div>;

  // El snapshot del catálogo del proyecto (subido a la nube) trae las etiquetas de los campos personalizados.
  const catSnap = (project as any).catalogSnapshot;

  const activeSpaces = project.spaces
    .filter(s => !s.isExcluded)
    .map(s => ({ ...s, windows: s.windows.filter(w => !w.isExcluded) }));

  const allSolutions = activeSpaces.flatMap(sp => sp.windows.flatMap(w => w.solutions));
  const totalAreaM2 = allSolutions.reduce((sum, sol) => sum + (sol.itemType !== 'maintenance' ? solutionArea(sol) : 0), 0);
  const totalSolutions = allSolutions.length;
  const gestionadas = allSolutions.filter(sol => statuses[sol.id]).length;
  const allDone = totalSolutions > 0 && gestionadas === totalSolutions;

  const toggle = async (solutionId: string) => { await setSupplierStatus(docId, solutionId, !statuses[solutionId]); };

  const visibles = (solutions: TechnicalSolution[]) =>
    soloPendientes ? solutions.filter(sol => !statuses[sol.id]) : solutions;
  const pendientes = totalSolutions - gestionadas;

  return (
    <div className="page" style={{ paddingBottom: '100px' }}>
      {/* Solo el NOMBRE del cliente como referencia (sin dirección, teléfono ni documento). */}
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
            <div style={{ fontSize: '14px', opacity: 0.8 }}>{totalSolutions} ítem(s)</div>
          </div>
        </div>
      </section>

      {totalSolutions > 0 && (
        <div className="segmented" style={{ marginBottom: '20px' }}>
          <button type="button" className={soloPendientes ? '' : 'selected'} onClick={() => setSoloPendientes(false)}>
            Todos ({totalSolutions})
          </button>
          <button type="button" className={soloPendientes ? 'selected' : ''} onClick={() => setSoloPendientes(true)}>
            Solo pendientes ({pendientes})
          </button>
        </div>
      )}

      {totalSolutions === 0 ? (
        <div className="empty">No hay ítems a fabricar en este proyecto.</div>
      ) : soloPendientes && pendientes === 0 ? (
        <div className="empty">No queda nada pendiente en este pedido.</div>
      ) : (
        <div className="supplier-spaces-container">
          {activeSpaces.map((space, i) => {
            const count = space.windows.reduce((acc, win) => acc + visibles(win.solutions).length, 0);
            if (count === 0) return null;
            return (
              <div key={space.id} style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '18px', color: '#fff', borderBottom: '2px solid #374151', paddingBottom: '8px', marginBottom: '16px' }}>
                  {i + 1}. {space.name}
                </h2>
                {space.windows.map(win => {
                  const solucionesVisibles = visibles(win.solutions);
                  if (solucionesVisibles.length === 0) return null;
                  const w = catSnap ? { ...win, projectCatalogSnapshot: catSnap } as WindowRecord : win;
                  return (
                    <div key={win.id}>
                      {win.notes && (
                        <div style={{ marginBottom: '8px', padding: '10px 12px', background: 'rgba(37,99,235,0.12)', border: '1px solid #2563eb', borderRadius: '8px' }}>
                          <label style={labelStyle}>Nota de la ventana — {win.label}</label>
                          <p style={{ margin: 0, fontSize: '14px', color: '#e5e7eb', lineHeight: '1.5' }}>{win.notes}</p>
                        </div>
                      )}
                      {solucionesVisibles.map(sol => (
                        <ProductCard
                          key={sol.id}
                          solution={sol}
                          windowLabel={win.label}
                          spaceName={space.name}
                          win={w}
                          catalog={catalog}
                          isGestionado={!!statuses[sol.id]}
                          onToggle={() => toggle(sol.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
