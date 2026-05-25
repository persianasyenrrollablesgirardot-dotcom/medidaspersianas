import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Field, SelectInput, TextInput } from '../components/Field';
import { MeasureInput } from '../components/MeasureInput';
import { PageHeader } from '../components/PageHeader';
import { db } from '../db';
import { newSolution, newWindow } from '../lib/projectFactory';
import { saveProject } from '../lib/projectStore';
import { quoteArea, quoteTotal } from '../lib/metrics';
import type { SpaceRecord, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';

interface QuoteLine {
  space: SpaceRecord;
  window: WindowRecord;
  solution: TechnicalSolution;
}

export function QuickQuoteModule() {
  const { id } = useParams();
  const project = useLiveQuery(() => db.projects.get(Number(id)), [id]);
  const catalog = useLiveQuery(() => db.catalog.toCollection().first());

  const lines = useMemo<QuoteLine[]>(() => {
    if (!project) return [];
    return project.spaces.flatMap(space => space.windows.flatMap(window => window.solutions.map(solution => ({ space, window, solution }))));
  }, [project]);

  const summary = useMemo(() => {
    const groups = new Map<string, { system: string; count: number; area: number; total: number }>();
    for (const line of lines) {
      const q = line.solution.quickQuote;
      const current = groups.get(line.solution.system) || { system: line.solution.system, count: 0, area: 0, total: 0 };
      current.count += 1;
      current.area += quoteArea(q);
      current.total += quoteTotal(q);
      groups.set(line.solution.system, current);
    }
    return Array.from(groups.values()).sort((a, b) => a.system.localeCompare(b.system));
  }, [lines]);

  if (!project || !catalog) {
    return <div className="page"><div className="empty">Cargando cotizacion rapida...</div></div>;
  }

  const persist = (next: TechnicalProject) => saveProject({ ...next, status: 'quick_quote' });

  const updateSolution = (spaceId: string, windowId: string, solutionId: string, patch: Partial<TechnicalSolution>) => persist({
    ...project,
    spaces: project.spaces.map(space => space.id !== spaceId ? space : ({
      ...space,
      windows: space.windows.map(window => window.id !== windowId ? window : ({
        ...window,
        solutions: window.solutions.map(solution => solution.id === solutionId ? { ...solution, ...patch } : solution),
      })),
    })),
  });

  const updateWindowLabel = (spaceId: string, windowId: string, label: string) => persist({
    ...project,
    spaces: project.spaces.map(space => space.id !== spaceId ? space : ({
      ...space,
      windows: space.windows.map(window => window.id === windowId ? { ...window, label } : window),
    })),
  });

  const addLine = () => {
    const targetSpace = project.spaces[0];
    if (!targetSpace) return;
    const lineNumber = lines.length + 1;
    const window = newWindow(`Persiana rapida ${lineNumber}`);
    const solution = {
      ...newSolution(`Persiana ${lineNumber}`, 'inside'),
      system: catalog.systems[0] || 'Enrollables',
      quickQuote: { width: 0, height: 0, quantity: 1 },
      status: 'quick' as const,
    };
    window.openingType = 'Cotizacion rapida';
    window.solutions = [solution];

    persist({
      ...project,
      spaces: project.spaces.map(space => space.id === targetSpace.id ? { ...space, windows: [...space.windows, window] } : space),
    });
  };

  const deleteLine = (spaceId: string, windowId: string, solutionId: string) => persist({
    ...project,
    spaces: project.spaces.map(space => {
      if (space.id !== spaceId) return space;
      return {
        ...space,
        windows: space.windows.flatMap(window => {
          if (window.id !== windowId) return [window];
          const nextSolutions = window.solutions.filter(solution => solution.id !== solutionId);
          return nextSolutions.length ? [{ ...window, solutions: nextSolutions }] : [];
        }),
      };
    }),
  });

  const grandArea = lines.reduce((sum, line) => sum + quoteArea(line.solution.quickQuote), 0);
  const grandTotal = lines.reduce((sum, line) => sum + quoteTotal(line.solution.quickQuote), 0);

  return (
    <div className="page quick-quote-page">
      <PageHeader title="Cotizacion rapida" subtitle={project.clientName || project.code} backTo="/" />

      <section className="panel quick-quote-hero">
        <div className="quick-quote-total">
          <span>Total estimado</span>
          <strong>{grandTotal.toLocaleString('es-CO')} COP</strong>
          <em>{lines.length} persianas | {grandArea.toFixed(2)} m2</em>
        </div>
        <button className="primary" type="button" onClick={addLine}>
          <PlusIcon className="icon" /> Agregar persiana
        </button>
      </section>

      <section className="quick-summary-grid">
        {summary.map(item => (
          <article key={item.system} className="quick-summary-card">
            <span>{item.system}</span>
            <strong>{item.count} persianas</strong>
            <em>{item.area.toFixed(2)} m2</em>
            <b>{item.total.toLocaleString('es-CO')} COP</b>
          </article>
        ))}
        {summary.length === 0 && <div className="empty">Agrega la primera persiana para empezar la cotizacion.</div>}
      </section>

      <section className="quick-line-list">
        {lines.map((line, index) => (
          <QuoteLineEditor
            key={line.solution.id}
            index={index}
            line={line}
            systems={catalog.systems}
            fabrics={catalog.fabrics}
            onWindowLabel={label => updateWindowLabel(line.space.id, line.window.id, label)}
            onChange={patch => updateSolution(line.space.id, line.window.id, line.solution.id, patch)}
            onDelete={() => deleteLine(line.space.id, line.window.id, line.solution.id)}
          />
        ))}
      </section>
    </div>
  );
}

function QuoteLineEditor({
  index,
  line,
  systems,
  fabrics,
  onWindowLabel,
  onChange,
  onDelete,
}: {
  index: number;
  line: QuoteLine;
  systems: string[];
  fabrics: string[];
  onWindowLabel: (label: string) => void;
  onChange: (patch: Partial<TechnicalSolution>) => void;
  onDelete: () => void;
}) {
  const q = line.solution.quickQuote || { width: 0, height: 0, quantity: 1 };
  const autoArea = (Number(q.width) || 0) * (Number(q.height) || 0);
  const updateQuote = (patch: Partial<typeof q>) => {
    const nextQuote = { ...q, ...patch };
    if ('width' in patch || 'height' in patch) nextQuote.manualArea = undefined;
    onChange({ quickQuote: nextQuote });
  };

  return (
    <article className="quick-line-card">
      <div className="quick-line-head">
        <span>Persiana {index + 1}</span>
        <button className="mini-danger" type="button" onClick={onDelete} aria-label="Eliminar persiana">
          <TrashIcon className="icon" />
        </button>
      </div>

      <div className="grid-2">
        <Field label="Ventana / referencia">
          <TextInput value={line.window.label} onChange={event => onWindowLabel(event.target.value)} />
        </Field>
        <Field label="Tipo de persiana">
          <SelectInput value={line.solution.system} onChange={event => onChange({ system: event.target.value })}>
            {systems.map(system => <option key={system}>{system}</option>)}
          </SelectInput>
        </Field>
        <Field label="Tipo de tela">
          <SelectInput value={line.solution.fabric || ''} onChange={event => onChange({ fabric: event.target.value })}>
            <option value="">Sin definir</option>
            {fabrics.map(fabric => <option key={fabric}>{fabric}</option>)}
          </SelectInput>
        </Field>
        <Field label="Instalacion">
          <SelectInput value={line.solution.layer} onChange={event => onChange({ layer: event.target.value as TechnicalSolution['layer'] })}>
            <option value="inside">Interna</option>
            <option value="outside">Externa</option>
            <option value="wall">Pared</option>
            <option value="ceiling">Techo</option>
            <option value="frame">Marco</option>
            <option value="mixed">Mixta</option>
          </SelectInput>
        </Field>
      </div>

      <div className="quick-measure-grid">
        <Field label="Ancho"><MeasureInput value={q.width || 0} onChange={value => updateQuote({ width: value })} /></Field>
        <Field label="Alto"><MeasureInput value={q.height || 0} onChange={value => updateQuote({ height: value })} /></Field>
        <Field label="m2 automatico"><div className="readonly-measure strong">{autoArea.toFixed(2)} m2</div></Field>
        <Field label="m2 manual"><MeasureInput unit="m2" value={q.manualArea || 0} onChange={value => updateQuote({ manualArea: value || undefined })} /></Field>
        <Field label="Valor m2"><MeasureInput unit="COP" value={q.pricePerM2 || 0} onChange={value => updateQuote({ pricePerM2: value })} /></Field>
      </div>

      <div className="quick-line-total">
        <span>{quoteArea(q).toFixed(2)} m2</span>
        <strong>{quoteTotal(q).toLocaleString('es-CO')} COP</strong>
      </div>
    </article>
  );
}
