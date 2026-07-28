import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db';
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '../components/Field';
import { Segmented } from '../components/Segmented';
import { newSolution, newSpace, newWindow } from '../lib/projectFactory';
import { evaluateSolution } from '../lib/rules';
import { quoteArea, solutionArea, solutionTotal } from '../lib/metrics';
import { uid } from '../lib/ids';
import type { DivisionPart, EvidenceKind, TechnicalProject, TechnicalSolution } from '../types';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { EvidenceImage } from '../components/EvidenceImage';
import { compressToBlob, savePhoto } from '../lib/photoStore';

export function ProjectEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = useLiveQuery(() => db.projects.get(Number(id)), [id]);
  const catalog = useLiveQuery(() => db.catalog.toCollection().first());

  if (!project || !catalog) return <div className="page"><div className="empty">Cargando proyecto...</div></div>;

  const save = async (next: TechnicalProject) => {
    const hydrated = {
      ...next,
      updatedAt: Date.now(),
      synced: false,
      spaces: next.spaces.map(space => ({
        ...space,
        windows: space.windows.map(window => ({
          ...window,
          solutions: window.solutions.map(solution => ({
            ...solution,
            alerts: evaluateSolution(window, solution),
            quickQuote: solution.quickQuote ? { ...solution.quickQuote, estimatedTotal: solutionTotal(solution) } : undefined,
          })),
        })),
      })),
    };
    await db.projects.update(project.id!, hydrated);
  };

  const updateProject = (patch: Partial<TechnicalProject>) => save({ ...project, ...patch });

  const addSpace = () => save({ ...project, spaces: [...project.spaces, newSpace(`Espacio ${project.spaces.length + 1}`)] });
  const addWindow = (spaceId: string) => save({
    ...project,
    spaces: project.spaces.map(space => space.id === spaceId
      ? { ...space, windows: [...space.windows, newWindow(`Ventana ${space.windows.length + 1}`)] }
      : space),
  });

  const addSolution = (spaceId: string, windowId: string, layer: TechnicalSolution['layer']) => save({
    ...project,
    spaces: project.spaces.map(space => space.id !== spaceId ? space : ({
      ...space,
      windows: space.windows.map(window => window.id !== windowId ? window : ({
        ...window,
        solutions: [...window.solutions, newSolution(layer === 'outside' ? 'Persiana externa' : 'Persiana interna', layer)],
      })),
    })),
  });

  const mutateSolution = (spaceId: string, windowId: string, solutionId: string, patch: Partial<TechnicalSolution>) => save({
    ...project,
    spaces: project.spaces.map(space => space.id !== spaceId ? space : ({
      ...space,
      windows: space.windows.map(window => window.id !== windowId ? window : ({
        ...window,
        solutions: space.windows.find(w => w.id === windowId)?.solutions.map(solution => solution.id === solutionId ? { ...solution, ...patch } : solution) || [],
      })),
    })),
  });

  /**
   * Esta pantalla guardaba la foto SIN COMPRIMIR y en base64 dentro del
   * proyecto — una foto de celular son varios MB, así que una sola bastaba
   * para reventar el store. Ahora comprime a Blob y la manda a la tabla
   * `photos`, igual que el resto de la app.
   */
  const addEvidence = async (spaceId: string, windowId: string, file: File, kind: EvidenceKind) => {
    const evidenceId = uid('evidence');
    const blob = await compressToBlob(file);
    await savePhoto({ id: evidenceId, projectId: project.id!, projectCode: project.code, blob });
    await save({
      ...project,
      spaces: project.spaces.map(space => space.id !== spaceId ? space : ({
        ...space,
        windows: space.windows.map(window => window.id !== windowId ? window : ({
          ...window,
          evidence: [...window.evidence, {
            id: evidenceId,
            kind,
            label: file.name,
            dataUrl: '',
            photoId: evidenceId,
            createdAt: Date.now(),
          }],
        })),
      })),
    });
  };

  return (
    <div className="page editor">
      <header className="topbar">
        <button className="ghost" onClick={() => navigate('/')}><ArrowLeftIcon className="icon" /></button>
        <div>
          <p>{project.code}</p>
          <h1>{project.clientName || 'Proyecto tecnico'}</h1>
        </div>
      </header>

      <section className="panel">
        <h2>Identificacion tecnica</h2>
        <div className="grid-2">
          <Field label="Cliente / obra"><TextInput value={project.clientName} onChange={e => updateProject({ clientName: e.target.value })} placeholder="Nombre del cliente u obra" /></Field>
          <Field label="Lugar / conjunto"><TextInput value={project.siteName || ''} onChange={e => updateProject({ siteName: e.target.value })} placeholder="Casa, apto, local..." /></Field>
          <Field label="Ciudad"><TextInput value={project.city || ''} onChange={e => updateProject({ city: e.target.value })} /></Field>
          <Field label="Direccion"><TextInput value={project.address || ''} onChange={e => updateProject({ address: e.target.value })} /></Field>
        </div>
      </section>

      {project.spaces.map(space => (
        <section key={space.id} className="panel">
          <div className="section-title">
            <TextInput value={space.name} onChange={e => save({ ...project, spaces: project.spaces.map(s => s.id === space.id ? { ...s, name: e.target.value } : s) })} />
            <button className="secondary" onClick={() => addWindow(space.id)}><PlusIcon className="icon" /> Ventana</button>
          </div>

          {space.windows.map(window => (
            <article key={window.id} className="window-card">
              <div className="section-title">
                <TextInput value={window.label} onChange={e => save({
                  ...project,
                  spaces: project.spaces.map(s => s.id === space.id ? { ...s, windows: s.windows.map(w => w.id === window.id ? { ...w, label: e.target.value } : w) } : s),
                })} />
                <button className="ghost danger" onClick={() => save({
                  ...project,
                  spaces: project.spaces.map(s => s.id === space.id ? { ...s, windows: s.windows.filter(w => w.id !== window.id) } : s),
                })}><TrashIcon className="icon" /></button>
              </div>

              <div className="grid-1">
                  <Field label="Profundidad vano"><NumberInput value={window.geometry.depth || ''} onChange={e => save({
                    ...project,
                    spaces: project.spaces.map(s => s.id === space.id ? { ...s, windows: s.windows.map(w => w.id === window.id ? { ...w, geometry: { ...w.geometry, depth: Number(e.target.value) } } : w) } : s),
                  })} /></Field>
              </div>

              <div className="measure-grid">
                {[
                  ['Ancho sup', 'widthTop'], ['Ancho medio', 'widthMiddle'], ['Ancho inf', 'widthBottom'],
                  ['Alto izq', 'heightLeft'], ['Alto centro', 'heightCenter'], ['Alto der', 'heightRight'],
                ].map(([label, key]) => (
                  <Field key={key} label={label}>
                    <NumberInput value={(window.geometry as any)[key] || ''} onChange={e => save({
                      ...project,
                      spaces: project.spaces.map(s => s.id === space.id ? { ...s, windows: s.windows.map(w => w.id === window.id ? { ...w, geometry: { ...w.geometry, [key]: Number(e.target.value) } } : w) } : s),
                    })} />
                  </Field>
                ))}
              </div>

              <div className="condition-row">
                {catalog.siteConditions.map(condition => {
                  const active = window.siteConditions.some(c => c.label === condition.label);
                  return (
                    <button key={condition.label} className={`chip ${active ? 'selected' : ''}`} onClick={() => save({
                      ...project,
                      spaces: project.spaces.map(s => s.id === space.id ? {
                        ...s,
                        windows: s.windows.map(w => w.id === window.id ? {
                          ...w,
                          siteConditions: active
                            ? w.siteConditions.filter(c => c.label !== condition.label)
                            : [...w.siteConditions, { id: uid('condition'), ...condition }],
                        } : w),
                      } : s),
                    })}>{condition.label}</button>
                  );
                })}
              </div>

              <div className="evidence-box">
                <div className="section-title">
                  <h3>Evidencia tecnica</h3>
                  <span className="muted">{window.evidence.length} fotos</span>
                </div>
                <div className="evidence-actions">
                  {(['general', 'measurement', 'obstacle', 'electric', 'level', 'detail'] as EvidenceKind[]).map(kind => (
                    <label key={kind} className="chip evidence-chip">
                      + {evidenceLabel(kind)}
                      <input hidden type="file" accept="image/*" capture="environment" onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) addEvidence(space.id, window.id, file, kind);
                        e.currentTarget.value = '';
                      }} />
                    </label>
                  ))}
                </div>
                {window.evidence.length > 0 && (
                  <div className="thumb-row">
                    {window.evidence.map(ev => (
                      <div key={ev.id} className="thumb">
                        <EvidenceImage ev={ev} />
                        <button onClick={() => save({
                          ...project,
                          spaces: project.spaces.map(s => s.id === space.id ? {
                            ...s,
                            windows: s.windows.map(w => w.id === window.id ? { ...w, evidence: w.evidence.filter(item => item.id !== ev.id) } : w),
                          } : s),
                        })}>x</button>
                        <span>{evidenceLabel(ev.kind)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="solution-actions">
                <button className="secondary" onClick={() => addSolution(space.id, window.id, 'inside')}>+ Interna</button>
                <button className="secondary purple" onClick={() => addSolution(space.id, window.id, 'outside')}>+ Externa</button>
              </div>

              {window.solutions.map(solution => (
                <SolutionEditor
                  key={solution.id}
                  solution={solution}
                  catalog={catalog}
                  onChange={patch => mutateSolution(space.id, window.id, solution.id, patch)}
                  onDelete={() => save({
                    ...project,
                    spaces: project.spaces.map(s => s.id === space.id ? { ...s, windows: s.windows.map(w => w.id === window.id ? { ...w, solutions: w.solutions.filter(sol => sol.id !== solution.id) } : w) } : s),
                  })}
                />
              ))}
            </article>
          ))}
        </section>
      ))}

      <button className="secondary wide" onClick={addSpace}><PlusIcon className="icon" /> Agregar espacio</button>
    </div>
  );
}

function evidenceLabel(kind: EvidenceKind) {
  const labels: Record<EvidenceKind, string> = {
    general: 'General',
    measurement: 'Medida',
    obstacle: 'Obstaculo',
    electric: 'Electrico',
    level: 'Nivel',
    detail: 'Detalle',
  };
  return labels[kind];
}

function SolutionEditor({ solution, catalog, onChange, onDelete }: {
  solution: TechnicalSolution;
  catalog: any;
  onChange: (patch: Partial<TechnicalSolution>) => void;
  onDelete: () => void;
}) {
  const q = solution.quickQuote || { width: 0, height: 0, quantity: 1 };
  const divisions = solution.divisions;

  const updateDivision = (id: string, patch: Partial<DivisionPart>) => {
    onChange({ divisions: divisions.map(d => d.id === id ? { ...d, ...patch } : d) });
  };

  return (
    <div className={`solution-card ${solution.layer === 'outside' ? 'outer' : ''}`}>
      <div className="section-title">
        <TextInput value={solution.name} onChange={e => onChange({ name: e.target.value })} />
        <button className="ghost danger" onClick={onDelete}><TrashIcon className="icon" /></button>
      </div>

      <Segmented
        value={solution.status}
        onChange={status => onChange({ status })}
        options={[
          { value: 'quick', label: 'Rapida' },
          { value: 'technical_pending', label: 'Tecnica' },
          { value: 'ready_for_fabrication', label: 'Lista' },
        ]}
      />

      <div className="grid-3">
        <Field label="Capa"><SelectInput value={solution.layer} onChange={e => onChange({ layer: e.target.value as TechnicalSolution['layer'] })}>
          <option value="inside">Interna</option><option value="outside">Externa</option><option value="wall">Pared</option><option value="ceiling">Techo</option><option value="frame">Marco</option><option value="mixed">Mixta</option>
        </SelectInput></Field>
        <Field label="Sistema"><SelectInput value={solution.system} onChange={e => onChange({ system: e.target.value })}>{catalog.systems.map((o: string) => <option key={o}>{o}</option>)}</SelectInput></Field>
        <Field label="Tela"><SelectInput value={solution.fabric || ''} onChange={e => onChange({ fabric: e.target.value })}><option value="">Sin definir</option>{catalog.fabrics.map((o: string) => <option key={o}>{o}</option>)}</SelectInput></Field>
      </div>

      <div className="quick-box">
        <h3>Cotizacion rapida opcional</h3>
        <div className="grid-4">
          <Field label="Ancho"><NumberInput value={q.width || ''} onChange={e => onChange({ quickQuote: { ...q, width: Number(e.target.value) } })} /></Field>
          <Field label="Alto"><NumberInput value={q.height || ''} onChange={e => onChange({ quickQuote: { ...q, height: Number(e.target.value) } })} /></Field>
          <Field label="m2 manual"><NumberInput value={q.manualArea || ''} onChange={e => onChange({ quickQuote: { ...q, manualArea: Number(e.target.value) } })} /></Field>
          <Field label="Precio m2"><NumberInput value={q.pricePerM2 || ''} onChange={e => onChange({ quickQuote: { ...q, pricePerM2: Number(e.target.value) } })} /></Field>
        </div>
        <div className="totals">Area: {quoteArea(q).toFixed(2)} m2 — Estimado: {solutionTotal(solution).toLocaleString('es-CO')} COP</div>
      </div>

      <div className="grid-3">
        <Field label="Ancho fabricacion"><NumberInput value={solution.assembly.fabricationWidth || ''} onChange={e => onChange({ assembly: { ...solution.assembly, fabricationWidth: Number(e.target.value) } })} /></Field>
        <Field label="Alto fabricacion"><NumberInput value={solution.assembly.fabricationHeight || ''} onChange={e => onChange({ assembly: { ...solution.assembly, fabricationHeight: Number(e.target.value) } })} /></Field>
        <Field label="Operacion"><SelectInput value={solution.drive} onChange={e => onChange({ drive: e.target.value as TechnicalSolution['drive'] })}><option value="manual">Manual</option><option value="motor">Motor</option><option value="none">No aplica</option></SelectInput></Field>
        <Field label="Color perfil"><SelectInput value={solution.assembly.profileColor || ''} onChange={e => onChange({ assembly: { ...solution.assembly, profileColor: e.target.value } })}><option value="">Sin definir</option>{catalog.colors.map((o: string) => <option key={o}>{o}</option>)}</SelectInput></Field>
        <Field label="Tubo / perfil / riel"><TextInput value={solution.assembly.tubeProfileRail || ''} onChange={e => onChange({ assembly: { ...solution.assembly, tubeProfileRail: e.target.value } })} /></Field>
        <Field label="Soporte"><TextInput value={solution.assembly.bracketType || ''} onChange={e => onChange({ assembly: { ...solution.assembly, bracketType: e.target.value } })} /></Field>
      </div>

      {solution.drive === 'motor' && (
        <div className="quick-box warn">
          <h3>Motorizacion</h3>
          <div className="grid-3">
            <Field label="Punto electrico"><SelectInput value={solution.motor?.powerPoint || 'unknown'} onChange={e => onChange({ motor: { ...solution.motor, powerPoint: e.target.value as any } })}><option value="available">Disponible</option><option value="missing">No existe</option><option value="unknown">Pendiente</option></SelectInput></Field>
            <Field label="Lado motor"><SelectInput value={solution.motor?.motorSide || ''} onChange={e => onChange({ motor: { ...solution.motor, powerPoint: solution.motor?.powerPoint || 'unknown', motorSide: e.target.value as any } })}><option value="">Pendiente</option><option value="left">Izq</option><option value="right">Der</option></SelectInput></Field>
            <Field label="Distancia punto"><NumberInput value={solution.motor?.distanceToPowerM || ''} onChange={e => onChange({ motor: { ...solution.motor, powerPoint: solution.motor?.powerPoint || 'unknown', distanceToPowerM: Number(e.target.value) } })} /></Field>
          </div>
        </div>
      )}

      <div className="section-title">
        <h3>Divisiones independientes</h3>
        <button className="secondary" onClick={() => onChange({ divisions: [...divisions, { id: uid('part'), label: `Parte ${divisions.length + 1}`, width: 0, height: solution.assembly.fabricationHeight || q.height || 0 }] })}>+ Division</button>
      </div>
      {divisions.map(part => (
        <div key={part.id} className="division-row">
          <TextInput value={part.label} onChange={e => updateDivision(part.id, { label: e.target.value })} />
          <NumberInput value={part.width || ''} onChange={e => updateDivision(part.id, { width: Number(e.target.value) })} />
          <NumberInput value={part.height || ''} onChange={e => updateDivision(part.id, { height: Number(e.target.value) })} />
          <button className="ghost danger" onClick={() => onChange({ divisions: divisions.filter(d => d.id !== part.id) })}><TrashIcon className="icon" /></button>
        </div>
      ))}
      <div className="totals">Area tecnica: {solutionArea(solution).toFixed(2)} m2</div>

      <Field label="Notas de ensamble"><TextArea value={solution.notes || ''} onChange={e => onChange({ notes: e.target.value })} placeholder="Detalles de tubo, soportes, descuentos, obstaculos o criterios de taller..." /></Field>

      {solution.alerts.length > 0 && <div className="alerts">{solution.alerts.map(a => <div key={a.id} className={`alert ${a.level}`}>{a.message}</div>)}</div>}
    </div>
  );
}
