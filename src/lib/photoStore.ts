import { useEffect, useState } from 'react';
import { db } from '../db';
import type { EvidenceItem, PhotoRecord, TechnicalProject } from '../types';

/**
 * ALMACÉN DE FOTOS
 *
 * Antes cada foto vivía en base64 dentro del proyecto, y el proyecto entero
 * dentro de UNA clave de localStorage con tope duro de ~5 MB. Con 15-20 fotos
 * el store reventaba y una escritura parcial se llevaba TODO por delante.
 *
 * Acá las fotos viven en su propia tabla de IndexedDB como Blob nativo:
 *  - pesan ~33% menos que el mismo contenido en base64,
 *  - no pasan por JSON.stringify (que era el cuello de botella real),
 *  - y la cuota deja de ser 5 MB para pasar a ser la del navegador.
 *
 * El proyecto solo guarda el `photoId`. Guardar un proyecto ya no mueve un
 * solo byte de imagen.
 */

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.75;

/** Cache de object URLs por foto. Se revocan al descargar la página. */
const urlCache = new Map<string, string>();

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  if (!/;base64/.test(head)) return new Blob([decodeURIComponent(body)], { type: mime });
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Reduce y recomprime a JPEG. Devuelve Blob, no base64. */
export async function compressToBlob(source: Blob): Promise<Blob> {
  if (!source.type.startsWith('image/')) return source;
  const dataUrl = await blobToDataUrl(source);
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    return source;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(image, 0, 0, width, height);
  const out = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  // Si comprimir no ayudó, nos quedamos con el original.
  return out && out.size > 0 && out.size < source.size ? out : source;
}

export async function savePhoto(input: {
  id: string;
  projectId: number;
  projectCode: string;
  blob: Blob;
}): Promise<PhotoRecord> {
  const record: PhotoRecord = {
    id: input.id,
    projectId: input.projectId,
    projectCode: input.projectCode,
    blob: input.blob,
    mime: input.blob.type || 'image/jpeg',
    bytes: input.blob.size,
    createdAt: Date.now(),
  };
  await db.photos.put(record);
  return record;
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  return db.photos.get(id);
}

/**
 * URL mostrable para una evidencia, venga de donde venga:
 * foto nueva (Blob local) → foto ya subida (Supabase) → legado (base64).
 */
export async function evidenceUrl(ev: EvidenceItem): Promise<string | undefined> {
  if (ev.photoId) {
    const cached = urlCache.get(ev.photoId);
    if (cached) return cached;
    const photo = await getPhoto(ev.photoId);
    if (photo) {
      const url = URL.createObjectURL(photo.blob);
      urlCache.set(ev.photoId, url);
      return url;
    }
  }
  if (ev.dataUrl) return ev.dataUrl;
  return ev.remoteUrl || undefined;
}

/** Hook para renderizar una evidencia sin que el componente sepa dónde vive. */
export function useEvidenceUrl(ev?: EvidenceItem): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    ev && !ev.photoId ? ev.dataUrl || ev.remoteUrl || undefined : undefined,
  );
  useEffect(() => {
    let alive = true;
    if (!ev) {
      setUrl(undefined);
      return;
    }
    evidenceUrl(ev).then(resolved => {
      if (alive) setUrl(resolved);
    });
    return () => {
      alive = false;
    };
  }, [ev?.id, ev?.photoId, ev?.dataUrl, ev?.remoteUrl]);
  return url;
}

/**
 * Devuelve una COPIA del proyecto con las fotos incrustadas en base64.
 * Necesario solo para generar PDFs y respaldos portables, donde el HTML
 * necesita el `<img src>` real. Nunca se guarda así.
 */
export async function hydrateProjectPhotos(project: TechnicalProject): Promise<TechnicalProject> {
  const ids = new Set<string>();
  project.spaces.forEach(space =>
    space.windows.forEach(win =>
      (win.evidence || []).forEach(ev => {
        if (ev.photoId && !ev.dataUrl) ids.add(ev.photoId);
      }),
    ),
  );
  if (ids.size === 0) return project;

  const photos = await db.photos.bulkGet([...ids]);
  const byId = new Map<string, PhotoRecord>();
  photos.forEach(p => {
    if (p) byId.set(p.id, p);
  });
  const dataUrls = new Map<string, string>();
  await Promise.all(
    [...byId.values()].map(async photo => {
      dataUrls.set(photo.id, await blobToDataUrl(photo.blob));
    }),
  );

  return {
    ...project,
    spaces: project.spaces.map(space => ({
      ...space,
      windows: space.windows.map(win => ({
        ...win,
        evidence: (win.evidence || []).map(ev =>
          ev.photoId && !ev.dataUrl
            ? { ...ev, dataUrl: dataUrls.get(ev.photoId) || '' }
            : ev,
        ),
      })),
    })),
  };
}

export async function hydrateProjectsPhotos(projects: TechnicalProject[]): Promise<TechnicalProject[]> {
  return Promise.all(projects.map(hydrateProjectPhotos));
}

/**
 * Saca las fotos base64 de un proyecto y las deja en la tabla `photos`.
 * Devuelve el proyecto aligerado. Es el corazón de la migración.
 */
export async function extractPhotos(project: TechnicalProject): Promise<{
  project: TechnicalProject;
  extracted: number;
}> {
  let extracted = 0;
  const pending: PhotoRecord[] = [];

  const spaces = project.spaces.map(space => ({
    ...space,
    windows: space.windows.map(win => ({
      ...win,
      evidence: (win.evidence || []).map(ev => {
        // Solo migramos base64 real; la copia de la nube trae dataUrl:'' y ya
        // tiene photoId o simplemente no tiene foto.
        if (!ev.dataUrl || ev.dataUrl.length < 100 || ev.photoId) return ev;
        try {
          const blob = dataUrlToBlob(ev.dataUrl);
          pending.push({
            id: ev.id,
            projectId: project.id!,
            projectCode: project.code,
            blob,
            mime: blob.type || 'image/jpeg',
            bytes: blob.size,
            createdAt: ev.createdAt || Date.now(),
          });
          extracted++;
          return { ...ev, dataUrl: '', photoId: ev.id };
        } catch {
          // Si no se puede decodificar, la dejamos como está: no perdemos nada.
          return ev;
        }
      }),
    })),
  }));

  if (pending.length > 0) await db.photos.bulkPut(pending);
  return { project: { ...project, spaces }, extracted };
}

export async function deletePhotosOfProject(projectId: number) {
  const ids = await db.photos.where('projectId').equals(projectId).primaryKeys();
  if (ids.length > 0) await db.photos.bulkDelete(ids as string[]);
}

export async function photoStats() {
  const all = await db.photos.toArray();
  return {
    count: all.length,
    bytes: all.reduce((sum, p) => sum + (p.bytes || 0), 0),
    pendingUpload: all.filter(p => !p.uploadedAt).length,
  };
}
