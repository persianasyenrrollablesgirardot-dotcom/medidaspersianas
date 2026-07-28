import { db } from '../db';
import type { PhotoRecord } from '../types';

/**
 * SUBIDA DE FOTOS A SUPABASE STORAGE
 *
 * Se usa la API REST directa en vez del SDK `@supabase/supabase-js` para no
 * sumar ~100 KB al bundle: la app corre en el celular, muchas veces con datos
 * móviles. Subir un archivo es un solo POST.
 *
 * Requiere (una vez, en el panel de Supabase):
 *   1. Un bucket PÚBLICO llamado `evidencias`.
 *   2. Una política que permita a la clave anónima escribir en ese bucket.
 * Ver `SUPABASE_SETUP.md` en la raíz del repo.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const BUCKET = (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || 'evidencias';

export function supabaseConfigurado(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function rutaDeFoto(photo: PhotoRecord): string {
  // Agrupada por código de proyecto: legible y fácil de auditar desde el panel.
  const codigo = (photo.projectCode || 'sin-codigo').replace(/[^A-Za-z0-9_-]/g, '_');
  const ext = photo.mime === 'image/png' ? 'png' : 'jpg';
  return `${codigo}/${photo.id}.${ext}`;
}

export function urlPublica(ruta: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;
}

/**
 * Sube una foto y guarda su URL. Idempotente: si ya estaba subida, no repite.
 * Devuelve la URL pública, o undefined si Supabase no está configurado.
 */
export async function subirFoto(photoId: string): Promise<string | undefined> {
  if (!supabaseConfigurado()) return undefined;

  const photo = await db.photos.get(photoId);
  if (!photo) return undefined;
  if (photo.remoteUrl && photo.uploadedAt) return photo.remoteUrl;

  const ruta = rutaDeFoto(photo);
  const respuesta = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${ruta}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': photo.mime || 'image/jpeg',
      // Si ya existe, que lo reemplace en vez de fallar con 409.
      'x-upsert': 'true',
    },
    body: photo.blob,
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Supabase ${respuesta.status}: ${detalle.slice(0, 200)}`);
  }

  const url = urlPublica(ruta);
  await db.photos.update(photoId, { remoteUrl: url, uploadedAt: Date.now() });
  return url;
}

/**
 * Sube un archivo diminuto de prueba y lo vuelve a leer, para saber si el
 * bucket existe y si los permisos están bien SIN tener que adivinar.
 */
export async function probarSupabase(): Promise<{ ok: boolean; detalle: string }> {
  if (!supabaseConfigurado()) {
    return { ok: false, detalle: 'Faltan las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.' };
  }

  const ruta = `_prueba/conexion.txt`;
  try {
    const respuesta = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${ruta}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'text/plain',
        'x-upsert': 'true',
      },
      body: `prueba ${Date.now()}`,
    });

    if (respuesta.status === 404) {
      return { ok: false, detalle: `El bucket "${BUCKET}" no existe todavía. Crealo en el panel de Supabase (ver SUPABASE_SETUP.md).` };
    }
    if (respuesta.status === 403 || respuesta.status === 401) {
      return { ok: false, detalle: `El bucket existe pero no deja escribir. Falta la política de permisos (ver SUPABASE_SETUP.md).` };
    }
    if (!respuesta.ok) {
      const texto = await respuesta.text().catch(() => '');
      return { ok: false, detalle: `Error ${respuesta.status}: ${texto.slice(0, 120)}` };
    }

    const lectura = await fetch(urlPublica(ruta));
    if (!lectura.ok) {
      return { ok: false, detalle: 'Se pudo subir pero no leer. El bucket no es público.' };
    }
    return { ok: true, detalle: 'Las fotos se pueden subir y leer correctamente.' };
  } catch (error: any) {
    return { ok: false, detalle: `Sin conexión con Supabase: ${error?.message || error}` };
  }
}

/** Fotos que todavía no llegaron a la nube. */
export async function fotosPendientes(): Promise<PhotoRecord[]> {
  const all = await db.photos.toArray();
  return all.filter(p => !p.uploadedAt);
}

/**
 * Descarga una foto desde la nube y la reinstala como Blob local.
 * Es el camino de vuelta: recuperar en un celular nuevo.
 */
export async function bajarFoto(photo: PhotoRecord): Promise<Blob | undefined> {
  if (!photo.remoteUrl) return undefined;
  const respuesta = await fetch(photo.remoteUrl);
  if (!respuesta.ok) return undefined;
  return respuesta.blob();
}
