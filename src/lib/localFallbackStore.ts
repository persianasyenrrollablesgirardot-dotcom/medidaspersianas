import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CATALOG } from '../db';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject } from '../types';
import { solutionTotal, solutionArea } from './metrics';

const PROJECTS_KEY = 'juno_fallback_projects_v1';
const CATALOG_KEY = 'juno_fallback_catalog_v1';
const CHANGE_EVENT = 'juno-fallback-storage-change';
const CATALOG_CHANGE_EVENT = 'juno-fallback-catalog-change';

export function isFallbackId(id?: number) {
  return typeof id === 'number' && id < 0;
}

export function addFallbackProject(project: TechnicalProject): number {
  const id = -Date.now() - Math.floor(Math.random() * 1000);
  writeFallbackProjects([{ ...project, id, updatedAt: Date.now(), synced: false }, ...getFallbackProjects()]);
  return id;
}

export function duplicateFallbackProject(projectId: number): number | undefined {
  const p = getFallbackProject(projectId);
  if (!p) return undefined;
  
  const id = -Date.now() - Math.floor(Math.random() * 1000);
  const code = p.code + '-COPIA'; // Modificamos el código o lo dejamos, pero añadirle algo ayuda a la visibilidad temporal.
  
  const clone: TechnicalProject = {
    ...p,
    id,
    code,
    clientName: `${p.clientName || 'Proyecto'} (Copia)`,
    isClone: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    synced: false,
  };
  
  writeFallbackProjects([clone, ...getFallbackProjects()]);
  return id;
}

export function getFallbackProjects(): TechnicalProject[] {
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY) || window.sessionStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) as TechnicalProject[] : [];
  } catch {
    return [];
  }
}

export function getFallbackProject(id: number): TechnicalProject | undefined {
  return getFallbackProjects().find(project => project.id === id);
}

export function getCloudProjectCache(id: number): TechnicalProject | undefined {
  try {
    const raw = window.localStorage.getItem('cloud_projects_cache');
    if (raw) {
      const projs = JSON.parse(raw) as TechnicalProject[];
      return projs.find(p => p.id === id || (p as any).projectId === id);
    }
  } catch {}
  return undefined;
}

export function saveFallbackProject(project: TechnicalProject) {
  if (!isFallbackId(project.id)) return;
  const updated = { ...project, updatedAt: Date.now(), synced: false };
  writeFallbackProjects(getFallbackProjects().map(item => item.id === updated.id ? updated : item));
}

export function deleteFallbackProject(id: number) {
  writeFallbackProjects(getFallbackProjects().filter(project => project.id !== id));
}

export function trashFallbackProject(id: number) {
  const deletedAt = Date.now();
  writeFallbackProjects(getFallbackProjects().map(project => project.id === id ? { ...project, deletedAt, updatedAt: deletedAt, synced: false } : project));
}

export function restoreFallbackProject(id: number) {
  writeFallbackProjects(getFallbackProjects().map(project => project.id === id ? { ...project, deletedAt: 0, updatedAt: Date.now(), synced: false } : project));
}

export function useFallbackTrashSummaries() {
  const [projects, setProjects] = useState(() => getFallbackProjects());

  useEffect(() => {
    const refresh = () => setProjects(getFallbackProjects());
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, []);

  return useMemo(() => projects
    .filter(project => (project.deletedAt || 0) > 0)
    .map(projectToSummary)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)), [projects]);
}

export function useFallbackProject(id?: string) {
  const numericId = Number(id);
  const [project, setProject] = useState<TechnicalProject | undefined>(() => {
    const local = getFallbackProject(numericId);
    if (local) return local;
    return getCloudProjectCache(numericId);
  });

  useEffect(() => {
    const refresh = () => {
      const local = getFallbackProject(numericId);
      if (local) setProject(local);
      else setProject(getCloudProjectCache(numericId));
    };
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, [numericId]);

  return project;
}

export function useFallbackSummaries() {
  const [projects, setProjects] = useState(() => getFallbackProjects());

  useEffect(() => {
    const refresh = () => setProjects(getFallbackProjects());
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, []);

  return useMemo(() => projects
    .filter(project => (project.deletedAt || 0) === 0)
    .map(projectToSummary)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [projects]);
}

export function useFallbackActiveProjects() {
  const [projects, setProjects] = useState(() => getFallbackProjects());

  useEffect(() => {
    const refresh = () => setProjects(getFallbackProjects());
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, []);

  return useMemo(() => projects
    .filter(project => (project.deletedAt || 0) === 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [projects]);
}

export function getFallbackCatalog(): TechnicalCatalog {
  try {
    const raw = window.localStorage.getItem(CATALOG_KEY) || window.sessionStorage.getItem(CATALOG_KEY);
    return normalizeFallbackCatalog(raw ? JSON.parse(raw) as TechnicalCatalog : DEFAULT_CATALOG);
  } catch {
    return normalizeFallbackCatalog(DEFAULT_CATALOG);
  }
}

export function saveFallbackCatalog(patch: Partial<TechnicalCatalog>) {
  const next = normalizeFallbackCatalog({ ...getFallbackCatalog(), ...patch, lastUpdatedAt: Date.now() });
  const payload = JSON.stringify(next);
  try {
    window.localStorage.setItem(CATALOG_KEY, payload);
  } catch {
    window.sessionStorage.setItem(CATALOG_KEY, payload);
  }
  window.dispatchEvent(new CustomEvent(CATALOG_CHANGE_EVENT));
}

export function useFallbackCatalog() {
  const [catalog, setCatalog] = useState<TechnicalCatalog>(() => getFallbackCatalog());

  useEffect(() => {
    const refresh = () => setCatalog(getFallbackCatalog());
    window.addEventListener(CATALOG_CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CATALOG_CHANGE_EVENT, refresh);
  }, []);

  return catalog;
}

function projectToSummary(project: TechnicalProject): ProjectSummary {
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
    projectId: project.id!,
    code: project.code,
    clientName: project.clientName,
    siteName: project.siteName,
    address: project.address,
    status: project.status,
    isClone: project.isClone,
    spacesCount: activeSpaces.length,
    windowsCount,
    solutionsCount,
    totalEstimate,
    totalAreaM2,
    systemTotals,
    createdAt: project.createdAt || project.updatedAt,
    contactPhone: project.contactPhone,
    deletedAt: project.deletedAt || 0,
    updatedAt: project.updatedAt,
    synced: false,
    sentToSupplier: project.sentToSupplier,
    discountPercent: project.discountPercent,
  };
}

function writeFallbackProjects(projects: TechnicalProject[]) {
  try {
    const payload = JSON.stringify(projects);
    window.localStorage.setItem(PROJECTS_KEY, payload);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch (error) {
    // If quota exceeded, try to purge trash to free up space
    const activeProjects = projects.filter(p => !p.deletedAt);
    if (activeProjects.length < projects.length) {
      try {
        const purgedPayload = JSON.stringify(activeProjects);
        window.localStorage.setItem(PROJECTS_KEY, purgedPayload);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
        return; // Success after purge
      } catch (purgeError) {
        throw purgeError; // Still out of space
      }
    }
    throw error; // No trash to purge, throw original error
  }
}

export function normalizeFallbackCatalog(catalog: TechnicalCatalog): TechnicalCatalog {
  return {
    ...DEFAULT_CATALOG,
    ...catalog,
    systems: catalog.systems !== undefined ? catalog.systems : DEFAULT_CATALOG.systems,
    fabrics: catalog.fabrics !== undefined ? catalog.fabrics : DEFAULT_CATALOG.fabrics,
    colors: catalog.colors !== undefined ? catalog.colors : DEFAULT_CATALOG.colors,
    mounts: catalog.mounts !== undefined ? catalog.mounts : DEFAULT_CATALOG.mounts,
    surfaces: catalog.surfaces !== undefined ? catalog.surfaces : DEFAULT_CATALOG.surfaces,
    openingTypes: catalog.openingTypes !== undefined ? catalog.openingTypes : DEFAULT_CATALOG.openingTypes,
    shapes: catalog.shapes !== undefined ? catalog.shapes : DEFAULT_CATALOG.shapes,
    customWindowFields: catalog.customWindowFields !== undefined ? catalog.customWindowFields : DEFAULT_CATALOG.customWindowFields,
    siteConditions: catalog.siteConditions !== undefined ? catalog.siteConditions : DEFAULT_CATALOG.siteConditions,
    lastUpdatedAt: catalog.lastUpdatedAt || Date.now(),
  };
}

export async function autoCompressOldEvidence() {
  const projects = getFallbackProjects();
  let modified = false;

  for (const project of projects) {
    for (const space of project.spaces) {
      for (const win of space.windows) {
        for (let i = 0; i < win.evidence.length; i++) {
          const ev = win.evidence[i];
          if (ev.dataUrl && ev.dataUrl.length > 500000) { // > 500KB string
            try {
              const img = new Image();
              img.src = ev.dataUrl;
              await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
              
              const maxSide = 1280;
              const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
              const width = Math.max(1, Math.round(img.width * scale));
              const height = Math.max(1, Math.round(img.height * scale));
              
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                ev.dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                modified = true;
              }
            } catch (e) {
              console.error("Error compressing old image", e);
            }
          }
        }
      }
    }
  }

  if (modified) {
    try {
      const payload = JSON.stringify(projects);
      window.localStorage.setItem(PROJECTS_KEY, payload);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      console.log("Successfully compressed old bloated images in localStorage.");
    } catch (e) {
      console.error("Failed to save compressed projects", e);
    }
  }
}
