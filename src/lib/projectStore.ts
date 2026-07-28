import { db } from '../db';
import type { EvidenceKind, ProjectSummary, SpaceRecord, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';
import { quoteTotal, solutionTotal, solutionArea } from './metrics';
import { uid } from './ids';
import { isFallbackId, mutateFallbackProject, saveFallbackProject } from './localFallbackStore';
import { compressToBlob, savePhoto } from './photoStore';
import { enqueue } from './syncQueue';

const saveQueues = new Map<number, Promise<void>>();

export async function saveProject(project: TechnicalProject) {
  if (!project.id) return;
  
  try {
    if (isFallbackId(project.id)) {
      saveFallbackProject(project);
      return;
    }
    const hydrated: TechnicalProject = {
      ...project,
      updatedAt: Date.now(),
      synced: false,
      spaces: project.spaces.map(space => ({
        ...space,
        windows: space.windows.map(window => ({
          ...window,
          solutions: window.solutions.map(solution => ({
            ...solution,
            alerts: solution.alerts || [],
            quickQuote: solution.quickQuote ? { ...solution.quickQuote, estimatedTotal: quoteTotal(solution.quickQuote) } : undefined,
          })),
        })),
      })),
    };

    const previous = saveQueues.get(project.id) || Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await db.projects.put(hydrated);
        await upsertProjectSummary(hydrated);
      })
      .then(() => undefined);
    saveQueues.set(project.id, next);
    await next;
  } catch (e) {
    import('react-hot-toast').then(({ default: toast }) => {
      toast.error('Memoria local llena. No se guardaron los cambios.', { id: 'save-error', duration: 4000 });
    });
    console.error('Error guardando el proyecto:', e);
  }
}

export function buildProjectSummary(project: TechnicalProject): ProjectSummary | undefined {
  if (!project.id) return undefined;
  
  const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
    ...s,
    windows: s.windows.filter(w => !w.isExcluded)
  }));
  
  const windowsCount = activeSpaces.reduce((sum, space) => sum + space.windows.length, 0);
  const solutionsCount = activeSpaces.reduce((sum, space) => sum + space.windows.reduce((winSum, window) => winSum + window.solutions.length, 0), 0);
  const subtotalEstimate = activeSpaces.reduce((sum, space) => 
    sum + space.windows.reduce((wSum, win) => 
      wSum + win.solutions.reduce((sSum, sol) => 
        sSum + solutionTotal(sol)
      , 0)
    , 0)
  , 0);

  const discountAmount = subtotalEstimate * ((project.discountPercent || 0) / 100);
  const totalEstimate = subtotalEstimate - discountAmount;

  const totalAreaM2 = activeSpaces.reduce((sum, space) => 
    sum + space.windows.reduce((wSum, win) => 
      wSum + win.solutions.reduce((sSum, sol) => 
        sSum + (sol.itemType !== 'maintenance' ? solutionArea(sol) : 0)
      , 0)
    , 0)
  , 0);

  const systemTotals = activeSpaces.reduce((acc, space) => {
    space.windows.forEach(win => {
      win.solutions.forEach(sol => {
        const sys = sol.system || 'Sin sistema';
        if (!acc[sys]) acc[sys] = { area: 0, price: 0 };
        if (sol.itemType !== 'maintenance') {
          acc[sys].area += solutionArea(sol);
        }
        acc[sys].price += solutionTotal(sol);
      });
    });
    return acc;
  }, {} as Record<string, { area: number; price: number }>);

  return {
    projectId: project.id,
    code: project.code,
    clientName: project.clientName,
    siteName: project.siteName,
    address: project.address,
    contactPhone: project.contactPhone,
    status: project.status,
    isClone: project.isClone,
    spacesCount: activeSpaces.length,
    windowsCount,
    solutionsCount,
    totalEstimate,
    totalAreaM2,
    systemTotals,
    createdAt: project.createdAt || project.updatedAt,
    deletedAt: project.deletedAt || 0,
    updatedAt: project.updatedAt,
    synced: project.synced,
    sentToSupplier: project.sentToSupplier,
    discountPercent: project.discountPercent,
  };
}

export async function upsertProjectSummary(project: TechnicalProject) {
  const summary = buildProjectSummary(project);
  if (!summary) return;
  const existing = await db.projectSummaries.where('projectId').equals(project.id!).first();
  await db.projectSummaries.put(existing?.id ? { ...summary, id: existing.id } : summary);
}

export async function rebuildMissingProjectSummaries() {
  const summaries = await db.projectSummaries.toArray();
  const validIndexed = new Set(
    summaries.filter(s => s.totalEstimate !== undefined).map(summary => summary.projectId)
  );
  
  const keys = await db.projects.orderBy('updatedAt').reverse().primaryKeys();
  for (const key of keys) {
    const projectId = Number(key);
    if (validIndexed.has(projectId)) continue;
    const project = await db.projects.get(projectId);
    if (project) await upsertProjectSummary(project);
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }
}

export function updateSpace(project: TechnicalProject, spaceId: string, updater: (space: SpaceRecord) => SpaceRecord) {
  return saveProject({
    ...project,
    spaces: project.spaces.map(space => space.id === spaceId ? updater(space) : space),
  });
}

export function updateWindow(project: TechnicalProject, spaceId: string, windowId: string, updater: (window: WindowRecord) => WindowRecord) {
  return updateSpace(project, spaceId, space => ({
    ...space,
    windows: space.windows.map(window => window.id === windowId ? updater(window) : window),
  }));
}

export function updateSolution(
  project: TechnicalProject,
  spaceId: string,
  windowId: string,
  solutionId: string,
  patch: Partial<TechnicalSolution>,
) {
  return updateWindow(project, spaceId, windowId, window => ({
    ...window,
    solutions: window.solutions.map(solution => solution.id === solutionId ? { ...solution, ...patch } : solution),
  }));
}

/**
 * Guarda una foto de evidencia.
 *
 * La foto NO entra al proyecto: se comprime a Blob y va a la tabla `photos`.
 * El proyecto solo guarda el `photoId`. Antes cada foto viajaba en base64
 * dentro del proyecto, y el proyecto dentro de una clave de localStorage con
 * tope de 5 MB: con 15-20 fotos reventaba y se llevaba todo.
 */
export async function addEvidence(
  project: TechnicalProject,
  spaceId: string,
  windowId: string,
  file: File,
  kind: EvidenceKind,
) {
  try {
    const evidenceId = uid('evidence');
    const blob = await compressToBlob(file);
    await savePhoto({
      id: evidenceId,
      projectId: project.id!,
      projectCode: project.code,
      blob,
    });

    const evidence = {
      id: evidenceId,
      kind,
      label: file.name,
      dataUrl: '',
      photoId: evidenceId,
      createdAt: Date.now(),
    };
    const appendEvidence = (window: WindowRecord): WindowRecord => ({
      ...window,
      evidence: [...window.evidence, evidence],
    });

    // Mutar sobre la copia MÁS FRESCA del store, no sobre el snapshot que
    // capturó React al abrir la ventana. Sin esto, al tomar varias fotos
    // seguidas la compresión asíncrona de cada una parte del mismo proyecto
    // viejo y la última escritura pisa a las anteriores => "algunos espacios
    // no guardan la foto".
    if (isFallbackId(project.id!)) {
      const ok = mutateFallbackProject(project.id!, current => ({
        ...current,
        spaces: current.spaces.map(space => space.id === spaceId ? ({
          ...space,
          windows: space.windows.map(window => window.id === windowId ? appendEvidence(window) : window),
        }) : space),
      }));
      if (!ok) throw new Error('Proyecto no encontrado al guardar la foto');
    } else {
      await updateWindow(project, spaceId, windowId, appendEvidence);
    }

    // Que suba sola apenas haya señal.
    void enqueue('upload_photo', evidenceId, { photoId: evidenceId });
  } catch (e) {
    console.error('Error guardando la foto:', e);
    import('react-hot-toast').then(({ default: toast }) => {
      toast.error('No se pudo guardar la foto. Revisá el espacio libre del dispositivo.', { id: 'evidence-error', duration: 5000 });
    });
  }
}
