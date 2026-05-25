import { db } from '../db';
import type { EvidenceKind, SpaceRecord, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';
import { evaluateSolution } from './rules';
import { quoteTotal } from './metrics';
import { uid } from './ids';

const saveQueues = new Map<number, Promise<void>>();

export async function saveProject(project: TechnicalProject) {
  if (!project.id) return;
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
          alerts: evaluateSolution(window, solution),
          quickQuote: solution.quickQuote ? { ...solution.quickQuote, estimatedTotal: quoteTotal(solution.quickQuote) } : undefined,
        })),
      })),
    })),
  };

  const previous = saveQueues.get(project.id) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => db.projects.put(hydrated))
    .then(() => undefined);
  saveQueues.set(project.id, next);
  await next;
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
  reader.onloadend = () => updateWindow(project, spaceId, windowId, window => ({
    ...window,
    evidence: [...window.evidence, {
      id: uid('evidence'),
      kind,
      label: file.name,
      dataUrl: String(reader.result),
      createdAt: Date.now(),
    }],
  }));
  reader.readAsDataURL(file);
}
