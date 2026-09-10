import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { useLiveQuery } from 'dexie-react-hooks';
import { useParams } from 'react-router-dom';
import { DocumentDuplicateIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Field, SelectInput, TextInput } from '../components/Field';
import { MeasureInput } from '../components/MeasureInput';
import { PageHeader } from '../components/PageHeader';
import { DEFAULT_CATALOG, db } from '../db';
import { newSolution, newWindow } from '../lib/projectFactory';
import { saveProject } from '../lib/projectStore';
import { quoteArea, solutionTotal } from '../lib/metrics';
import type { SpaceRecord, TechnicalCatalog, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';
import { isFallbackId, useFallbackCatalog, useFallbackProject } from '../lib/localFallbackStore';
import { trashSolution, trashWindow } from '../lib/trashStore';
import { avisoDeCopias, copiarVentana, nombresDeCopia, pedirCantidadDeCopias } from '../lib/duplicar';

interface QuoteLine {
  space: SpaceRecord;
  window: WindowRecord;
  solution: TechnicalSolution;
}

export function QuickQuoteModule() {
  const { id } = useParams();
  const numericProjectId = Number(id);
  const fallbackMode = isFallbackId(numericProjectId);
  const fallbackProject = useFallbackProject(id);
  const fallbackCatalog = useFallbackCatalog();
  const dbProject = useLiveQuery<TechnicalProject | undefined>(() => fallbackMode ? Promise.resolve(undefined) : db.projects.get(numericProjectId), [fallbackMode, numericProjectId]);
  const project = fallbackProject || dbProject;
  const dbCatalog = useLiveQuery<TechnicalCatalog | undefined>(() => db.catalog.toCollection().first().then(value => value || DEFAULT_CATALOG), []);
  const catalog = dbCatalog || fallbackCatalog || DEFAULT_CATALOG;

  const lines = useMemo<QuoteLine[]>(() => {
    if (!project) return [];
    return project.spaces.flatMap(space => space.windows.flatMap(window => window.solutions.map(solution => ({ space, window, solution }))));
  }, [project]);

  const summary = useMemo(() => {
    const groups = new Map<string, { system: string; count: number; area: number; total: number }>();
    for (const line of lines) {
      const q = line.solution.quickQuote;
      if (q) {
        const current = groups.get(line.solution.system) || { system: line.solution.system, count: 0, area: 0, total: 0 };
        current.count += 1;
        current.area += quoteArea(q);
        current.total += solutionTotal(line.solution);
        groups.set(line.solution.system, current);
      }
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

  /**
   * Duplicar una linea. Acá una linea NO es un espacio ni una ventana: es UNA
   * persiana, y `addLine` le arma a cada una su propia ventana. La copia sigue
   * esa misma forma — ventana nueva con una sola persiana adentro — asi que si
   * la ventana original tenia varias (viene del levantamiento tecnico, no de
   * esta pantalla), la copia se lleva SOLO la persiana que se duplico. Copiar
   * las hermanas seria cotizar de mas.
   *
   * La ventana copiada queda justo despues de la original, no al final: la
   * lista es plana y una copia al final del listado no se encuentra.
   */
  const duplicateLine = async (spaceId: string, windowId: string, solutionId: string) => {
    const space = project.spaces.find(s => s.id === spaceId);
    const window = space?.windows.find(w => w.id === windowId);
    const solution = window?.solutions.find(sol => sol.id === solutionId);
    if (!space || !window || !solution) return;

    const cantidad = pedirCantidadDeCopias('esta persiana');
    if (!cantidad) return;

    // Los nombres se comparan contra TODO el proyecto, no contra este espacio:
    // la lista de cotizacion es plana y mezcla los espacios, asi que dos lineas
    // con el mismo nombre visible se ven una al lado de la otra.
    const todasLasVentanas = project.spaces.flatMap(sp => sp.windows);
    const labels = nombresDeCopia(window.label, todasLasVentanas.map(w => w.label), cantidad);
    const nombres = nombresDeCopia(solution.name, todasLasVentanas.flatMap(w => w.solutions.map(sol => sol.name)), cantidad);

    const copias = labels.map((label, i) => {
      // Se le pasa la ventana con UNA sola persiana: `copiarVentana` copia lo
      // que le den, con ids nuevos y sin fotos.
      const copia = copiarVentana({ ...window, solutions: [solution] }, label);
      copia.solutions[0].name = nombres[i];
      return copia;
    });

    const index = space.windows.findIndex(w => w.id === windowId);
    const windows = [...space.windows];
    windows.splice(index < 0 ? windows.length : index + 1, 0, ...copias);

    await persist({
      ...project,
      spaces: project.spaces.map(sp => sp.id === spaceId ? { ...sp, windows } : sp),
    });
    toast.success(avisoDeCopias(labels, 'Persiana duplicada', 'persianas creadas'));
  };

  /**
   * Ojo con el caso borde: si la persiana era la ÚLTIMA de su ventana, esta
   * pantalla se lleva también la ventana entera (con sus medidas y sus fotos).
   * Eso pasaba en silencio. Ahora se avisa y, en ese caso, lo que se guarda en
   * la papelera es la VENTANA completa, para que restaurar devuelva todo.
   */
  const deleteLine = async (spaceId: string, windowId: string, solutionId: string) => {
    const space = project.spaces.find(s => s.id === spaceId);
    const window = space?.windows.find(w => w.id === windowId);
    const solution = window?.solutions.find(sol => sol.id === solutionId);
    if (!space || !window || !solution) return;

    const eraLaUltima = window.solutions.length === 1;
    const aviso = eraLaUltima
      ? `¿Mover "${solution.name}" a la papelera?\n\nEra la única persiana de la ventana "${window.label}", así que la ventana también se va (con sus medidas y ${window.evidence.length} foto${window.evidence.length === 1 ? '' : 's'}).\n\nPodés recuperarla desde Papelera › Elementos.`
      : `¿Mover "${solution.name}" a la papelera?\n\nPodés recuperarla desde Papelera › Elementos.`;
    if (!confirm(aviso)) return;

    const copiado = eraLaUltima
      ? await trashWindow(project, space, window)
      : await trashSolution(project, space, window, solution);
    if (!copiado) {
      toast.error('No se pudo guardar la copia de seguridad. No se borró nada.');
      return;
    }

    await persist({
      ...project,
      spaces: project.spaces.map(current => {
        if (current.id !== spaceId) return current;
        return {
          ...current,
          windows: current.windows.flatMap(win => {
            if (win.id !== windowId) return [win];
            const nextSolutions = win.solutions.filter(sol => sol.id !== solutionId);
            return nextSolutions.length ? [{ ...win, solutions: nextSolutions }] : [];
          }),
        };
      }),
    });
    toast.success(eraLaUltima ? 'Ventana movida a la papelera' : 'Persiana movida a la papelera');
  };

  const grandArea = lines.reduce((sum, line) => sum + quoteArea(line.solution.quickQuote), 0);
  const grandTotal = lines.reduce((sum, line) => sum + solutionTotal(line.solution), 0);

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
        {lines.map(line => (
          <QuoteLineEditor
            key={line.solution.id}
            line={line}
            systems={catalog.systems}
            fabrics={catalog.fabrics}
            onWindowLabel={label => updateWindowLabel(line.space.id, line.window.id, label)}
            onChange={patch => updateSolution(line.space.id, line.window.id, line.solution.id, patch)}
            onDuplicate={() => duplicateLine(line.space.id, line.window.id, line.solution.id)}
            onDelete={() => deleteLine(line.space.id, line.window.id, line.solution.id)}
          />
        ))}
      </section>
    </div>
  );
}

function QuoteLineEditor({
  line,
  systems,
  fabrics,
  onWindowLabel,
  onChange,
  onDuplicate,
  onDelete,
}: {
  line: QuoteLine;
  systems: string[];
  fabrics: string[];
  onWindowLabel: (label: string) => void;
  onChange: (patch: Partial<TechnicalSolution>) => void;
  onDuplicate: () => void;
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
        <div className="quick-line-title">
          <span>{line.space.name}</span>
          <strong>{line.window.label}</strong>
          <em>{line.solution.name}</em>
        </div>
        <div className="quick-line-tags">
          <span>{line.solution.system}</span>
          <span>{line.solution.layer === 'inside' ? 'Interna' : line.solution.layer === 'outside' ? 'Externa' : line.solution.layer}</span>
        </div>
        <div className="tile-actions">
          <button className="mini-action" type="button" onClick={onDuplicate} aria-label="Duplicar persiana" title="Duplicar persiana">
            <DocumentDuplicateIcon className="icon" />
          </button>
          <button className="mini-danger" type="button" onClick={onDelete} aria-label="Eliminar persiana">
            <TrashIcon className="icon" />
          </button>
        </div>
      </div>

      <div className="quote-context-strip">
        <div>
          <span>Espacio</span>
          <strong>{line.space.name}</strong>
        </div>
        <div>
          <span>Ventana</span>
          <strong>{line.window.label}</strong>
        </div>
        <div>
          <span>Persiana</span>
          <strong>{line.solution.name}</strong>
        </div>
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
        <strong>{solutionTotal(line.solution).toLocaleString('es-CO')} COP</strong>
      </div>
    </article>
  );
}
