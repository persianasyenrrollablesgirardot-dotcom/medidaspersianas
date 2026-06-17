import { db } from '../db';
import type { EvidenceKind, ProjectSummary, SpaceRecord, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';
import { quoteTotal, solutionTotal, solutionArea } from './metrics';
import { uid } from './ids';
import { isFallbackId, saveFallbackProject } from './localFallbackStore';

const saveQueues = new Map<number, Promise<void>>();

export async function saveProject(project: TechnicalProject) {
  if (!project.id) return;
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
}

export function buildProjectSummary(project: TechnicalProject): ProjectSummary | undefined {
  if (!project.id) return undefined;
  
  const activeSpaces = project.spaces.filter(s => !s.isExcluded).map(s => ({
    ...s,
    windows: s.windows.filter(w => !w.isExcluded)
  }));
  
  const windowsCount = activeSpaces.reduce((sum, space) => sum + space.windows.length, 0);
  const solutionsCount = activeSpaces.reduce((sum, space) => sum + space.windows.reduce((winSum, window) => winSum + window.solutions.length, 0), 0);
  const totalEstimate = activeSpaces.reduce((sum, space) => 
    sum + space.windows.reduce((wSum, win) => 
      wSum + win.solutions.reduce((sSum, sol) => 
        sSum + solutionTotal(sol)
      , 0)
    , 0)
  , 0);

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

export function addEvidence(project: TechnicalProject, spaceId: string, windowId: string, file: File, kind: EvidenceKind) {
  const reader = new FileReader();
  reader.onloadend = async () => {
    const dataUrl = await compressImageDataUrl(String(reader.result));
    updateWindow(project, spaceId, windowId, window => ({
      ...window,
      evidence: [...window.evidence, {
        id: uid('evidence'),
        kind,
        label: file.name,
        dataUrl,
        createdAt: Date.now(),
      }],
    }));
  };
  reader.readAsDataURL(file);
}

async function compressImageDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) return dataUrl;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.72);
}
