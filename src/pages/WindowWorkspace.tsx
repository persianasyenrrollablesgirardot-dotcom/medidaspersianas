import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { DEFAULT_CATALOG, db } from '../db';
import { Field, SelectInput, TextArea, TextInput } from '../components/Field';
import { EditableSelect } from '../components/EditableSelect';
import { MeasureInput } from '../components/MeasureInput';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { addEvidence, updateSolution, updateWindow } from '../lib/projectStore';
import { newSolution } from '../lib/projectFactory';
import { evidenceLabel } from '../lib/labels';
import { quoteArea, quoteTotal, solutionArea } from '../lib/metrics';
import { uid } from '../lib/ids';
import type { DivisionPart, EvidenceKind, MountPlanTemplate, QuickWindowMode, TechnicalProject, TechnicalSolution } from '../types';
import type { TechnicalCatalog } from '../types';
import { isFallbackId, saveFallbackCatalog, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';

type Tab = 'quick' | 'evidence';

const PLAN_TEMPLATES: MountPlanTemplate[] = [
  { id: 'A', label: 'Plano A', imageUrl: '/planos/plano-a.jpeg', layout: 'L', rollDirection: 'front', solutionCount: 2, notes: 'Esquina en L, todas enrollando por el frente.' },
  { id: 'B', label: 'Plano B', imageUrl: '/planos/plano-b.jpeg', layout: 'L', rollDirection: 'back', solutionCount: 2, notes: 'Esquina en L, todas enrollando por detras.' },
  { id: 'C', label: 'Plano C', imageUrl: '/planos/plano-c.jpeg', layout: 'L', rollDirection: 'front', solutionCount: 2, notes: 'Esquina en L invertida, todas enrollando por el frente.' },
  { id: 'D', label: 'Plano D', imageUrl: '/planos/plano-d.jpeg', layout: 'U', rollDirection: 'front', solutionCount: 3, notes: 'Tres persianas en U, central completa, enrollando por el frente.' },
  { id: 'E', label: 'Plano E', imageUrl: '/planos/plano-e.jpeg', layout: 'U', rollDirection: 'back', solutionCount: 3, notes: 'Tres persianas en U, central completa, enrollando por detras.' },
  { id: 'F', label: 'Plano F', imageUrl: '/planos/plano-f.jpeg', layout: 'U', rollDirection: 'front', solutionCount: 3, centralDivisions: 2, notes: 'Tres persianas en U, persiana central dividida en dos, enrollando por el frente.' },
  { id: 'G', label: 'Plano G', imageUrl: '/planos/plano-g.jpeg', layout: 'U', rollDirection: 'back', solutionCount: 3, centralDivisions: 2, notes: 'Tres persianas en U, persiana central dividida en dos, enrollando por detras.' },
  { id: 'H', label: 'Plano H', imageUrl: '/planos/plano-h.jpeg', layout: 'U', rollDirection: 'front', solutionCount: 3, centralDivisions: 3, notes: 'Tres persianas en U, persiana central dividida en tres, enrollando por el frente.' },
];

export function WindowWorkspace() {
  const { id, spaceId, windowId } = useParams();
  const [tab, setTab] = useState<Tab>('quick');
  const numericProjectId = Number(id);
  const fallbackMode = isFallbackId(numericProjectId);
  const fallbackProject = useFallbackProject(id);
  const fallbackCatalog = useFallbackCatalog();
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => fallbackMode ? Promise.resolve(undefined) : db.projects.get(numericProjectId), [fallbackMode, numericProjectId]);
  const project = fallbackProject || dbProject;
  const dbCatalog = useLiveQuery<TechnicalCatalog | undefined>(() => fallbackMode ? Promise.resolve(undefined) : db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), [fallbackMode]);
  const catalog = fallbackMode ? fallbackCatalog : (dbCatalog || DEFAULT_CATALOG);
  const space = project?.spaces.find(s => s.id === spaceId);
  const win = space?.windows.find(w => w.id === windowId);
  const firstSolutionId = win?.solutions[0]?.id;
  const [activeSolutionId, setActiveSolutionId] = useState<string | undefined>(firstSolutionId);

  const activeSolution = useMemo(() => {
    if (!win) return undefined;
    return win.solutions.find(s => s.id === activeSolutionId) || win.solutions[0];
  }, [activeSolutionId, win]);

  if (!project || !catalog || !space || !win || !activeSolution) {
    return <div className="page"><div className="empty">Cargando ventana...</div></div>;
  }

  const patchWindow = (patch: Partial<typeof win>) => updateWindow(project, space.id, win.id, current => ({ ...current, ...patch }));
  const patchSolution = (solutionId: string, patch: Partial<TechnicalSolution>) => updateSolution(project, space.id, win.id, solutionId, patch);

  const updateCatalog = async (patch: Partial<TechnicalCatalog>) => {
    if (fallbackMode) {
      saveFallbackCatalog(patch);
      return;
    }
    const current = catalog.id ? catalog : await db.catalog.toCollection().first();
    if (current?.id) {
      await db.catalog.update(current.id, { ...patch, lastUpdatedAt: Date.now() });
      return;
    }
    await db.catalog.add({ ...DEFAULT_CATALOG, ...patch, lastUpdatedAt: Date.now() });
  };
  const addCatalogOption = (field: 'openingTypes' | 'shapes', value: string) => {
    const current = catalog[field] || [];
    if (!current.includes(value)) updateCatalog({ [field]: [...current, value] } as Partial<TechnicalCatalog>);
  };
  const deleteCatalogOption = (field: 'openingTypes' | 'shapes', value: string) => {
    updateCatalog({ [field]: (catalog[field] || []).filter(option => option !== value) } as Partial<TechnicalCatalog>);
  };

  const addSol = (layer: TechnicalSolution['layer']) => {
    const sol = newSolution(layer === 'outside' ? 'Persiana externa' : 'Persiana interna', layer);
    updateWindow(project, space.id, win.id, current => ({ ...current, solutions: [...current.solutions, sol] }));
    setActiveSolutionId(sol.id);
  };

  const setQuickMode = (quickMode: QuickWindowMode) => {
    updateWindow(project, space.id, win.id, current => ({
      ...current,
      quickMode,
      planTemplate: quickMode === 'simple' ? undefined : current.planTemplate,
      solutions: quickMode === 'simple'
        ? current.solutions.map(solution => ({ ...solution, planTemplate: undefined }))
        : current.solutions,
    }));
  };

  const applyPlanTemplate = (plan: MountPlanTemplate) => {
    const nextSolutions = Array.from({ length: plan.solutionCount }, (_, index) => {
      const currentLayer = win.solutions[index]?.layer || 'inside';
      const fallback = newSolution(`Persiana ${index + 1}`, currentLayer);
      return {
        ...fallback,
        name: `Persiana ${index + 1}`,
        planTemplate: plan,
      };
    });
    updateWindow(project, space.id, win.id, current => ({
      ...current,
      quickMode: 'angle45',
      planTemplate: plan,
      solutions: nextSolutions,
    }));
    setActiveSolutionId(nextSolutions[0]?.id);
  };

  const repairAngleSolutions = () => {
    const plan = win.planTemplate;
    if (!plan) return;
    const nextSolutions = Array.from({ length: plan.solutionCount }, (_, index) => {
      const current = win.solutions[index];
      return current
        ? { ...current, name: current.name || `Persiana ${index + 1}`, planTemplate: plan }
        : { ...newSolution(`Persiana ${index + 1}`, 'inside'), planTemplate: plan };
    });
    updateWindow(project, space.id, win.id, current => ({
      ...current,
      quickMode: 'angle45',
      planTemplate: plan,
      solutions: nextSolutions,
    }));
    setActiveSolutionId(nextSolutions[0]?.id);
  };

  const clearPlanTemplate = () => {
    updateWindow(project, space.id, win.id, current => ({
      ...current,
      planTemplate: undefined,
      solutions: current.solutions.map(solution => ({ ...solution, planTemplate: undefined })),
    }));
  };

  const deleteActiveSolution = () => {
    if (!activeSolution) return;
    if (win.solutions.length <= 1) {
      if (!confirm('Esta es la ultima persiana de la ventana. Si la borras, se creara una persiana interna vacia para que la ventana no quede sin solucion.')) return;
      const replacement = newSolution('Persiana interna', 'inside');
      updateWindow(project, space.id, win.id, current => ({ ...current, solutions: [replacement] }));
      setActiveSolutionId(replacement.id);
      return;
    }
    if (!confirm(`Borrar ${activeSolution.name}?`)) return;
    const remaining = win.solutions.filter(solution => solution.id !== activeSolution.id);
    updateWindow(project, space.id, win.id, current => ({ ...current, solutions: remaining }));
    setActiveSolutionId(remaining[0]?.id);
  };

  return (
    <div className="page narrow workspace">
      <PageHeader title={win.label} subtitle={space.name} backTo={`/project/${project.id}/space/${space.id}`} />

      <section className="panel focus-panel">
        <Field label="Nombre de ventana">
          <TextInput value={win.label} onChange={e => patchWindow({ label: e.target.value })} />
        </Field>
        <div className="grid-2">
          <EditableSelect
            label="Tipo"
            value={win.openingType}
            options={catalog.openingTypes}
            onChange={openingType => patchWindow({ openingType })}
            onAddOption={value => addCatalogOption('openingTypes', value)}
            onDeleteOption={value => deleteCatalogOption('openingTypes', value)}
          />
          <EditableSelect
            label="Forma"
            value={win.shape}
            options={catalog.shapes}
            onChange={shape => patchWindow({ shape })}
            onAddOption={value => addCatalogOption('shapes', value)}
            onDeleteOption={value => deleteCatalogOption('shapes', value)}
          />
        </div>
        <CustomWindowFields
          catalog={catalog}
          values={win.customFields || {}}
          onCatalogChange={updateCatalog}
          onChange={(fieldId, value) => patchWindow({ customFields: { ...(win.customFields || {}), [fieldId]: value } })}
        />
      </section>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'quick', label: 'Rapida' },
          { value: 'evidence', label: 'Fotos' },
        ]}
      />

      {tab === 'quick' && (
        <section className="panel focus-panel">
          <QuickModeSelector mode={win.quickMode || 'simple'} onChange={setQuickMode} />
          {(win.quickMode || 'simple') === 'angle45' && (
            <PlanTemplatePicker selected={win.planTemplate} onSelect={applyPlanTemplate} onClear={clearPlanTemplate} />
          )}
          {(win.quickMode || 'simple') === 'angle45' && win.planTemplate && win.solutions.length !== win.planTemplate.solutionCount && (
            <button className="secondary wide" type="button" onClick={repairAngleSolutions}>
              Reparar persianas del plano {win.planTemplate.label}
            </button>
          )}
          {(win.quickMode || 'simple') === 'simple' || win.planTemplate ? (
            <>
              <SolutionPicker win={win} activeId={activeSolution.id} onPick={setActiveSolutionId} onAddInside={() => addSol('inside')} onAddOutside={() => addSol('outside')} onDeleteActive={deleteActiveSolution} />
              <QuickSolutionBasics
                solution={activeSolution}
                systems={catalog.systems}
                fabrics={catalog.fabrics}
                onChange={(patch: Partial<TechnicalSolution>) => patchSolution(activeSolution.id, patch)}
              />
              <QuickForm solution={activeSolution} onChange={(patch: Partial<TechnicalSolution>) => patchSolution(activeSolution.id, patch)} />
              <DivisionsForm solution={activeSolution} onChange={(patch: Partial<TechnicalSolution>) => patchSolution(activeSolution.id, patch)} />
            </>
          ) : (
            <div className="empty">Selecciona primero un plano de 45 grados para crear sus persianas independientes.</div>
          )}
        </section>
      )}

      {tab === 'evidence' && (
        <section className="panel focus-panel">
          <EvidenceForm win={win} onAdd={(file: File, kind: EvidenceKind) => addEvidence(project, space.id, win.id, file, kind)} onDelete={(evidenceId: string) => patchWindow({ evidence: win.evidence.filter(e => e.id !== evidenceId) })} />
        </section>
      )}

    </div>
  );
}

function QuickModeSelector({ mode, onChange }: { mode: QuickWindowMode; onChange: (mode: QuickWindowMode) => void }) {
  return (
    <div className="quick-mode-panel">
      <button type="button" className={`quick-mode-card ${mode === 'simple' ? 'selected' : ''}`} onClick={() => onChange('simple')}>
        <strong>Ventana sencilla</strong>
        <span>Medidas normales, sin planos de 45 grados.</span>
      </button>
      <button type="button" className={`quick-mode-card ${mode === 'angle45' ? 'selected' : ''}`} onClick={() => onChange('angle45')}>
        <strong>Corte 45 grados</strong>
        <span>Activa plantillas A-H y persianas por tramo.</span>
      </button>
    </div>
  );
}

function PlanTemplatePicker({ selected, onSelect, onClear }: { selected?: MountPlanTemplate; onSelect: (plan: MountPlanTemplate) => void; onClear: () => void }) {

  return (
    <div className="sub-panel plan-picker-panel">
      <div className="section-title">
        <div>
          <h2>Plano de montaje</h2>
          <p className="muted">Selecciona el plano y se activan las persianas que debes medir.</p>
        </div>
        {selected && <button className="secondary small" type="button" onClick={onClear}>Limpiar</button>}
      </div>
      <div className="plan-template-grid">
        {PLAN_TEMPLATES.map(plan => (
          <button
            key={plan.id}
            type="button"
            className={`plan-template-card ${selected?.id === plan.id ? 'selected' : ''}`}
            onClick={() => onSelect(plan)}
          >
            <img src={plan.imageUrl} alt={plan.label} />
            <span>{plan.label}</span>
            <em>{plan.layout} · {plan.solutionCount} persianas · {plan.rollDirection === 'front' ? 'frente' : 'detras'}</em>
          </button>
        ))}
      </div>
      {selected && (
        <div className="selected-plan">
          <img src={selected.imageUrl} alt={selected.label} />
          <div>
            <strong>{selected.label}</strong>
            <span>{selected.notes}</span>
            {selected.centralDivisions && <small>Sugiere dividir el tramo central en {selected.centralDivisions} partes.</small>}
          </div>
        </div>
      )}
    </div>
  );
}

function QuickSolutionBasics({
  solution,
  systems,
  fabrics,
  onChange,
}: {
  solution: TechnicalSolution;
  systems: string[];
  fabrics: string[];
  onChange: (patch: Partial<TechnicalSolution>) => void;
}) {
  return (
    <div className="quick-layer-row">
      <div className="grid-2">
        <Field label="Tipo de persiana">
          <SelectInput value={solution.system} onChange={e => onChange({ system: e.target.value })}>
            {systems.map(system => <option key={system}>{system}</option>)}
          </SelectInput>
        </Field>
        <Field label="Instalacion de esta persiana">
          <SelectInput value={solution.layer} onChange={e => onChange({ layer: e.target.value as TechnicalSolution['layer'] })}>
            <option value="inside">Interna</option>
            <option value="outside">Externa</option>
            <option value="wall">Pared</option>
            <option value="ceiling">Techo</option>
            <option value="frame">Marco</option>
            <option value="mixed">Mixta</option>
          </SelectInput>
        </Field>
        <Field label="Tipo de tela">
          <SelectInput value={solution.fabric || ''} onChange={e => onChange({ fabric: e.target.value })}>
            <option value="">Sin definir</option>
            {fabrics.map(fabric => <option key={fabric}>{fabric}</option>)}
          </SelectInput>
        </Field>
      </div>
    </div>
  );
}

function CustomWindowFields({
  catalog,
  values,
  onCatalogChange,
  onChange,
}: {
  catalog: TechnicalCatalog;
  values: Record<string, string>;
  onCatalogChange: (patch: Partial<TechnicalCatalog>) => void;
  onChange: (fieldId: string, value: string) => void;
}) {
  const [addingField, setAddingField] = useState(false);
  const [fieldName, setFieldName] = useState('');

  const addField = () => {
    const label = fieldName.trim();
    if (!label) return;
    const id = `campo_${Date.now().toString(36)}`;
    onCatalogChange({
      customWindowFields: [...(catalog.customWindowFields || []), { id, label, options: [] }],
    });
    setFieldName('');
    setAddingField(false);
  };

  const updateFieldOptions = (fieldId: string, options: string[]) => {
    onCatalogChange({
      customWindowFields: (catalog.customWindowFields || []).map(field => field.id === fieldId ? { ...field, options } : field),
    });
  };

  const deleteField = (fieldId: string) => {
    if (!confirm('Eliminar este campo personalizado?')) return;
    onCatalogChange({
      customWindowFields: (catalog.customWindowFields || []).filter(field => field.id !== fieldId),
    });
  };

  return (
    <div className="custom-fields">
      <div className="section-title">
        <h2>Campos extra de ventana</h2>
        <button className="secondary small" type="button" onClick={() => setAddingField(v => !v)}>
          <PlusIcon className="icon" /> Campo
        </button>
      </div>
      {addingField && (
        <div className="inline-add">
          <TextInput value={fieldName} onChange={e => setFieldName(e.target.value)} placeholder="Ej: Tipo de marco, angulo, condicion..." autoFocus />
          <button className="primary" type="button" onClick={addField}>Crear</button>
        </div>
      )}
      <div className="grid-2">
        {(catalog.customWindowFields || []).map(field => (
          <div key={field.id} className="custom-field-item">
            <EditableSelect
              label={field.label}
              value={values[field.id]}
              options={field.options}
              onChange={value => onChange(field.id, value)}
              onAddOption={value => {
                if (!field.options.includes(value)) updateFieldOptions(field.id, [...field.options, value]);
              }}
              onDeleteOption={value => {
                updateFieldOptions(field.id, field.options.filter(option => option !== value));
                if (values[field.id] === value) {
                  onChange(field.id, '');
                }
              }}
            />
            <button className="mini-danger" type="button" onClick={() => deleteField(field.id)}>
              <TrashIcon className="icon" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SolutionPicker({ win, activeId, onPick, onAddInside, onAddOutside, onDeleteActive }: any) {
  return (
    <div className="solution-picker">
      <div className="h-scroll">
        {win.solutions.map((sol: TechnicalSolution) => (
          <button key={sol.id} className={`pill ${activeId === sol.id ? 'active' : ''}`} onClick={() => onPick(sol.id)}>
            {sol.name}
          </button>
        ))}
      </div>
      <div className="solution-actions compact">
        <button className="secondary" onClick={onAddInside}>+ Interna</button>
        <button className="secondary purple" onClick={onAddOutside}>+ Externa</button>
        <button className="secondary danger-outline" onClick={onDeleteActive}>
          <TrashIcon className="icon" /> Borrar
        </button>
      </div>
    </div>
  );
}

function QuickForm({ solution, onChange }: { solution: TechnicalSolution; onChange: (patch: Partial<TechnicalSolution>) => void }) {
  const q = solution.quickQuote || { width: 0, height: 0, quantity: 1 };
  const autoArea = (Number(q.width) || 0) * (Number(q.height) || 0);
  const updateQuick = (patch: Partial<typeof q>) => {
    const nextQuote = { ...q, ...patch };
    if ('width' in patch || 'height' in patch) {
      nextQuote.manualArea = undefined;
    }
    const nextPatch: Partial<TechnicalSolution> = { quickQuote: nextQuote };
    if (typeof patch.height === 'number') {
      nextPatch.divisions = solution.divisions.map(part => ({ ...part, height: patch.height || 0 }));
    }
    onChange(nextPatch);
  };

  return (
    <>
      <h2>Cotizacion rapida</h2>
      <p className="muted">Solo lo minimo para estimar. Despues se completa la ficha tecnica.</p>
      <div className="grid-2">
        <Field label="Ancho"><MeasureInput value={q.width || 0} onChange={value => updateQuick({ width: value })} /></Field>
        <Field label="Alto"><MeasureInput value={q.height || 0} onChange={value => updateQuick({ height: value })} /></Field>
        <Field label="m2 automatico"><div className="readonly-measure strong">{autoArea.toFixed(2)} m2</div></Field>
        <Field label="m2 ajuste manual"><MeasureInput unit="m2" value={q.manualArea || 0} onChange={value => updateQuick({ manualArea: value || undefined })} /></Field>
        <Field label="Precio por m2"><MeasureInput unit="COP" value={q.pricePerM2 || 0} onChange={value => updateQuick({ pricePerM2: value })} /></Field>
      </div>
      <div className="big-total">
        <span>{quoteArea(q).toFixed(2)} m2 {q.manualArea ? 'ajustado' : 'automatico'}</span>
        <strong>{quoteTotal(q).toLocaleString('es-CO')} COP</strong>
      </div>
      <Field label="Nota rapida"><TextArea value={q.note || ''} onChange={e => updateQuick({ note: e.target.value })} placeholder="Valor preliminar, pendiente ficha tecnica..." /></Field>
    </>
  );
}

function DivisionsForm({ solution, onChange }: { solution: TechnicalSolution; onChange: (patch: Partial<TechnicalSolution>) => void }) {
  const baseWidth = solution.quickQuote?.width || solution.assembly.fabricationWidth || 0;
  const commonHeight = solution.quickQuote?.height || solution.assembly.fabricationHeight || 0;
  const sumWidths = solution.divisions.reduce((sum, part) => sum + (Number(part.width) || 0), 0);
  const widthDiff = baseWidth - sumWidths;
  const hasMismatch = baseWidth > 0 && Math.abs(widthDiff) > 0.01;
  const statusText = !baseWidth
    ? 'Primero coloca el ancho principal.'
    : !solution.divisions.length
      ? 'Sin divisiones registradas.'
      : hasMismatch
        ? widthDiff > 0
          ? `Faltan ${widthDiff.toFixed(2)} m para completar el ancho.`
          : `Sobran ${Math.abs(widthDiff).toFixed(2)} m sobre el ancho.`
        : 'La suma de anchos cuadra con el ancho principal.';

  const normalizedDivisions = () => solution.divisions.map(part => ({ ...part, height: commonHeight }));
  const update = (id: string, patch: Partial<DivisionPart>) => {
    onChange({ divisions: normalizedDivisions().map(d => d.id === id ? { ...d, ...patch, height: commonHeight } : d) });
  };
  const splitEvenly = (count: number) => {
    if (!baseWidth || count < 1) return;
    const width = Number((baseWidth / count).toFixed(3));
    onChange({
      divisions: Array.from({ length: count }, (_, index) => ({
        id: uid('part'),
        label: `Parte ${index + 1}`,
        width: index === count - 1 ? Number((baseWidth - width * (count - 1)).toFixed(3)) : width,
        height: commonHeight,
      })),
    });
  };

  return (
    <div className="sub-panel">
      <div className="section-title">
        <div>
          <h2>Divisiones</h2>
          <p className="muted">Cada parte tiene su ancho. El alto es unico y sale del alto principal.</p>
        </div>
        <button className="secondary" onClick={() => onChange({ divisions: [...normalizedDivisions(), { id: uid('part'), label: `Parte ${solution.divisions.length + 1}`, width: 0, height: commonHeight }] })}><PlusIcon className="icon" /> Agregar</button>
      </div>
      <div className="division-summary">
        <div><strong>Ancho base</strong><span>{baseWidth ? `${baseWidth.toFixed(2)} m` : 'pendiente'}</span></div>
        <div><strong>Alto unico</strong><span>{commonHeight ? `${commonHeight.toFixed(2)} m` : 'pendiente'}</span></div>
        <div className={hasMismatch ? 'warn' : 'ok'}><strong>Suma partes</strong><span>{sumWidths.toFixed(2)} m</span></div>
      </div>
      <div className="division-tools">
        <button className="secondary small" type="button" onClick={() => onChange({ divisions: [...normalizedDivisions(), { id: uid('part'), label: `Parte ${solution.divisions.length + 1}`, width: 0, height: commonHeight }] })}>Agregar manual</button>
        <button className="secondary small" type="button" onClick={() => splitEvenly(2)}>2 iguales</button>
        <button className="secondary small" type="button" onClick={() => splitEvenly(3)}>3 iguales</button>
        <button className="secondary small" type="button" onClick={() => splitEvenly(4)}>4 iguales</button>
      </div>
      {solution.divisions.map(part => (
        <div key={part.id} className="division-row">
          <TextInput value={part.label} onChange={e => update(part.id, { label: e.target.value })} />
          <MeasureInput value={part.width || 0} onChange={value => update(part.id, { width: value })} />
          <div className="readonly-measure">{commonHeight ? `${commonHeight.toFixed(2)} m alto` : 'alto pendiente'}</div>
          <button className="ghost danger" onClick={() => onChange({ divisions: solution.divisions.filter(d => d.id !== part.id) })}><TrashIcon className="icon" /></button>
        </div>
      ))}
      <div className={`division-status ${hasMismatch ? 'warn' : 'ok'}`}>{statusText}</div>
      <div className="totals">Area tecnica: {solutionArea({ ...solution, divisions: normalizedDivisions() }).toFixed(2)} m2</div>
    </div>
  );
}

function EvidenceForm({ win, onAdd, onDelete }: any) {
  const [viewingImage, setViewingImage] = React.useState<any>(null);

  const handleShare = async (ev: any) => {
    try {
      const res = await fetch(ev.dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `evidencia_${ev.id}.jpg`, { type: 'image/jpeg' });
      if (navigator.share) {
        await navigator.share({
          title: `Evidencia: ${evidenceLabel(ev.kind)}`,
          files: [file]
        });
      } else {
        alert("Tu dispositivo no soporta compartir imágenes directamente.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const kinds: EvidenceKind[] = ['general', 'measurement', 'obstacle', 'electric', 'level', 'detail'];
  return (
    <>
      <h2>Evidencia</h2>
      <div className="evidence-actions">
        {kinds.map(kind => (
          <label key={kind} className="chip evidence-chip">
            + {evidenceLabel(kind)}
            <input hidden type="file" accept="image/*" capture="environment" onChange={e => {
              const file = e.target.files?.[0];
              if (file) onAdd(file, kind);
              e.currentTarget.value = '';
            }} />
          </label>
        ))}
      </div>
      <div className="thumb-row wrap">
        {win.evidence.map((ev: any) => (
          <div key={ev.id} className="thumb" onClick={() => setViewingImage(ev)} style={{ cursor: 'pointer' }}>
            <img src={ev.dataUrl} alt={ev.label} />
            <button onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}>x</button>
            <span>{evidenceLabel(ev.kind)}</span>
          </div>
        ))}
      </div>
      {win.evidence.length === 0 && <div className="empty">Agrega fotos de medida, obstaculos, punto electrico o detalles.</div>}

      {viewingImage && (
        <div className="modal-backdrop" onClick={() => setViewingImage(null)}>
          <div className="modal-content image-viewer" onClick={e => e.stopPropagation()} style={{ background: '#000', padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.8)' }}>
              <h3 style={{ margin: 0, color: 'white' }}>{evidenceLabel(viewingImage.kind)}</h3>
              <button className="ghost" onClick={() => setViewingImage(null)} style={{ color: 'white', fontSize: '1.5rem', width: 'auto', padding: '0 0.5rem' }}>✕</button>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto', padding: '1rem' }}>
              <img src={viewingImage.dataUrl} alt={viewingImage.label} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '1rem', display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.8)' }}>
              <a href={viewingImage.dataUrl} download={`evidencia_${viewingImage.id}.jpg`} className="primary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>⬇️ Descargar</a>
              <button className="primary" onClick={() => handleShare(viewingImage)} style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}>📲 Compartir</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
