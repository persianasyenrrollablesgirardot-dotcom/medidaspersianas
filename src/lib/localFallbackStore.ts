import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CATALOG } from '../db';
import type { ProjectSummary, TechnicalCatalog, TechnicalProject } from '../types';

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
  const [project, setProject] = useState<TechnicalProject | undefined>(() => isFallbackId(numericId) ? getFallbackProject(numericId) : undefined);

  useEffect(() => {
    if (!isFallbackId(numericId)) return;
    const refresh = () => setProject(getFallbackProject(numericId));
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
  const windowsCount = project.spaces.reduce((sum, space) => sum + space.windows.length, 0);
  const solutionsCount = project.spaces.reduce((sum, space) => sum + space.windows.reduce((winSum, window) => winSum + window.solutions.length, 0), 0);
  return {
    projectId: project.id!,
    code: project.code,
    clientName: project.clientName,
    siteName: project.siteName,
    address: project.address,
    status: project.status,
    spacesCount: project.spaces.length,
    windowsCount,
    solutionsCount,
    deletedAt: project.deletedAt || 0,
    updatedAt: project.updatedAt,
    synced: false,
  };
}

function writeFallbackProjects(projects: TechnicalProject[]) {
  const payload = JSON.stringify(projects);
  try {
    window.localStorage.setItem(PROJECTS_KEY, payload);
  } catch {
    window.sessionStorage.setItem(PROJECTS_KEY, payload);
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

function normalizeFallbackCatalog(catalog: TechnicalCatalog): TechnicalCatalog {
  return {
    ...DEFAULT_CATALOG,
    ...catalog,
    systems: catalog.systems?.length ? catalog.systems : DEFAULT_CATALOG.systems,
    fabrics: catalog.fabrics?.length ? catalog.fabrics : DEFAULT_CATALOG.fabrics,
    colors: catalog.colors?.length ? catalog.colors : DEFAULT_CATALOG.colors,
    mounts: catalog.mounts?.length ? catalog.mounts : DEFAULT_CATALOG.mounts,
    surfaces: catalog.surfaces?.length ? catalog.surfaces : DEFAULT_CATALOG.surfaces,
    openingTypes: catalog.openingTypes?.length ? catalog.openingTypes : DEFAULT_CATALOG.openingTypes,
    shapes: catalog.shapes?.length ? catalog.shapes : DEFAULT_CATALOG.shapes,
    customWindowFields: catalog.customWindowFields?.length ? catalog.customWindowFields : DEFAULT_CATALOG.customWindowFields,
    siteConditions: catalog.siteConditions?.length ? catalog.siteConditions : DEFAULT_CATALOG.siteConditions,
    lastUpdatedAt: catalog.lastUpdatedAt || Date.now(),
  };
}
