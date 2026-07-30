import { useEffect, useState } from 'react';
import { db } from '../db';
import type { SyncQueueItem, TechnicalProject } from '../types';
import { borrarProyectoDeLaNube, haySesion, subirProyecto } from './cloudBackup';
import { subirFoto, supabaseConfigurado } from './supabasePhotos';

/**
 * COLA DE SINCRONIZACIÓN
 *
 * La app es offline-first: en el terreno muchas veces no hay señal, y medir no
 * puede depender de la red. Cada cambio se guarda LOCAL y se encola. Cuando
 * vuelve la conexión, la cola se drena sola con reintentos y espera creciente.
 *
 * La tabla `syncQueue` ya existía en el esquema de Dexie desde el principio,
 * pero nunca se había usado.
 */

const EVENTO = 'juno-sync-change';
const INTERVALO_MS = 20_000;
const MAX_INTENTOS = 8;

let corriendo = false;
let temporizador: number | undefined;
let reconciliador: number | undefined;
let drenando = false;

function avisar() {
  window.dispatchEvent(new CustomEvent(EVENTO));
}

function esperaTrasFallar(intentos: number): number {
  // 30s, 1m, 2m, 4m… con techo de 30 minutos.
  return Math.min(30_000 * 2 ** intentos, 30 * 60_000);
}

/**
 * Encola una operación. Si ya había una pendiente para el mismo elemento, la
 * reemplaza en vez de acumular: solo importa el estado final.
 */
export async function enqueue(
  type: SyncQueueItem['type'],
  refId: string,
  payload: unknown,
): Promise<void> {
  try {
    const existente = await db.syncQueue.where('refId').equals(refId).first();
    if (existente?.id && existente.type === type && existente.status !== 'processing') {
      await db.syncQueue.update(existente.id, {
        payload,
        status: 'pending',
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });
    } else {
      await db.syncQueue.add({
        type,
        refId,
        payload,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        createdAt: Date.now(),
      });
    }
    avisar();
    // Si hay red, intentamos de inmediato en vez de esperar al próximo ciclo.
    if (navigator.onLine) void drain();
  } catch (error) {
    console.error('No se pudo encolar la sincronización', error);
  }
}

async function procesar(item: SyncQueueItem): Promise<void> {
  if (item.type === 'delete_project') {
    const { id } = item.payload as { id: number };
    await borrarProyectoDeLaNube({ id, code: item.refId } as TechnicalProject);
    return;
  }

  if (item.type === 'upload_photo') {
    await subirFoto(item.refId);
    return;
  }

  // upsert_project
  const { id } = item.payload as { id: number };
  const project = await db.projects.get(id);
  if (!project) return; // se borró mientras tanto: nada que subir

  // Primero las fotos (Supabase), después el proyecto (Firestore) con los
  // punteros ya resueltos. Si una foto falla, el proyecto igual sube: los
  // datos técnicos son lo crítico y la foto reintenta sola.
  if (supabaseConfigurado()) {
    const ids = new Set<string>();
    project.spaces?.forEach(space =>
      space.windows?.forEach(win =>
        (win.evidence || []).forEach(ev => {
          if (ev.photoId) ids.add(ev.photoId);
        }),
      ),
    );
    for (const photoId of ids) {
      try {
        await subirFoto(photoId);
      } catch (error) {
        console.warn('Foto pendiente de subir', photoId, error);
        await enqueue('upload_photo', photoId, { photoId });
      }
    }
  }

  // Releemos por si la subida de fotos actualizó las URLs.
  const fresco = (await db.projects.get(id)) || project;
  await subirProyecto(fresco);

  // Queda anotado QUÉ versión está en la nube. Es lo que le permite al
  // reconciliador saber, sin preguntarle a la nube, qué falta subir.
  subidosEnEstaSesion.add(fresco.cloudDocId || fresco.code);
  const anotados = await db.projects.update(id, { cloudSyncedUpdatedAt: fresco.updatedAt });
  if (!anotados) {
    // Se subió bien pero no se pudo dejar la marca. No se pierde nada (el
    // candado de sesión evita resubirlo), pero conviene verlo si se repite.
    console.warn(`Subido a la nube pero sin anotar la marca: ${fresco.code}`);
  }
}

/**
 * Documentos ya subidos en ESTA sesión.
 *
 * La marca `cloudSyncedUpdatedAt` es lo que evita resubir entre sesiones, pero
 * si por cualquier motivo no llega a escribirse (una recarga en el momento
 * exacto, por ejemplo), el reconciliador volvería a encolar el proyecto cada 5
 * minutos y a resubirlo — gastando datos móviles en el terreno para nada.
 * Este candado en memoria corta eso: como máximo una subida por proyecto por
 * sesión, aunque la marca falle.
 */
const subidosEnEstaSesion = new Set<string>();

/**
 * RECONCILIADOR — la sincronización pasa SOLA, sin botones.
 *
 * Antes un proyecto solo se encolaba al GUARDARLO (`persist()`). Todo lo que
 * entraba por otro camino quedaba fuera de la nube para siempre y en silencio:
 * la migración de localStorage a IndexedDB (que escribe con `db.projects.put`
 * directo), las restauraciones, las importaciones. Así se perdió información.
 *
 * Esto recorre lo que hay en el dispositivo y encola lo que la nube no tiene o
 * tiene viejo. Corre al arrancar, cada pocos minutos, al volver la señal y al
 * traer la app al frente. Es idempotente: `enqueue` reemplaza lo pendiente del
 * mismo proyecto en vez de acumular, y si no hay sesión o señal simplemente se
 * queda esperando.
 */
export async function reconciliar(): Promise<number> {
  let encolados = 0;
  try {
    const proyectos = await db.projects.toArray();

    // CÓDIGOS REPETIDOS. El rescate de julio dejó 28 códigos con 2 a 4 copias.
    // Como el nombre del documento en la nube ES el código, todas las copias
    // escribían sobre el mismo documento: solo una quedaba respaldada y las
    // otras volvían a encolarse para siempre sin llegar nunca. Acá cada copia
    // extra recibe un nombre propio y estable (por fecha de creación) para que
    // ninguna quede afuera.
    const porCodigo = new Map<string, typeof proyectos>();
    proyectos.forEach(p => {
      if (p.deletedAt || !p.code) return;
      const grupo = porCodigo.get(p.code) || [];
      grupo.push(p);
      porCodigo.set(p.code, grupo);
    });
    for (const [code, grupo] of porCodigo) {
      if (grupo.length < 2) continue;
      const ordenado = [...grupo].sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.id || 0) - (b.id || 0),
      );
      for (let i = 0; i < ordenado.length; i++) {
        const esperado = i === 0 ? undefined : `${code}__${i + 1}`;
        if (ordenado[i].cloudDocId !== esperado) {
          ordenado[i].cloudDocId = esperado;
          await db.projects.update(ordenado[i].id!, { cloudDocId: esperado });
        }
      }
    }

    for (const proyecto of proyectos) {
      if (proyecto.deletedAt) continue;
      if (!proyecto.code || typeof proyecto.id !== 'number') continue;
      if (proyecto.cloudSyncedUpdatedAt === proyecto.updatedAt) continue;
      // El refId es el documento, NO el código: si fuera el código, dos copias
      // se pisarían tambien en la cola y una nunca se subiría.
      const documento = proyecto.cloudDocId || proyecto.code;
      if (subidosEnEstaSesion.has(documento)) continue;
      await enqueue('upsert_project', documento, {
        code: proyecto.code,
        id: proyecto.id,
      });
      encolados++;
    }
  } catch (error) {
    console.error('No se pudo reconciliar con la nube', error);
  }
  if (encolados > 0) {
    console.info(`Reconciliación: ${encolados} proyectos pendientes de subir a la nube.`);
    avisar();
  }
  return encolados;
}

/** Cuántos proyectos del dispositivo todavía no tienen copia en la nube. */
export async function sinCopiaEnLaNube(): Promise<number> {
  try {
    const proyectos = await db.projects.toArray();
    return proyectos.filter(
      p => !p.deletedAt && p.cloudSyncedUpdatedAt !== p.updatedAt,
    ).length;
  } catch {
    return 0;
  }
}

export async function drain(): Promise<void> {
  if (drenando || !navigator.onLine || !haySesion()) return;
  drenando = true;
  try {
    const ahora = Date.now();
    const pendientes = (await db.syncQueue.where('status').anyOf('pending', 'failed').toArray())
      .filter(item => (item.nextAttemptAt || 0) <= ahora)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, 25);

    for (const item of pendientes) {
      if (!navigator.onLine) break;
      try {
        await db.syncQueue.update(item.id!, { status: 'processing' });
        await procesar(item);
        await db.syncQueue.delete(item.id!);
      } catch (error) {
        const intentos = (item.attempts || 0) + 1;
        const mensaje = error instanceof Error ? error.message : String(error);
        if (intentos >= MAX_INTENTOS) {
          // No se descarta nunca: queda visible como fallida para poder
          // reintentarla a mano. Perder en silencio es lo que hay que evitar.
          await db.syncQueue.update(item.id!, {
            status: 'failed',
            attempts: intentos,
            lastError: mensaje,
            nextAttemptAt: ahora + 60 * 60_000,
          });
        } else {
          await db.syncQueue.update(item.id!, {
            status: 'pending',
            attempts: intentos,
            lastError: mensaje,
            nextAttemptAt: ahora + esperaTrasFallar(intentos),
          });
        }
      }
      avisar();
    }
  } finally {
    drenando = false;
    avisar();
  }
}

export function startSync() {
  if (corriendo) return;
  corriendo = true;

  // Reconciliar y drenar van juntos: primero se detecta qué falta, después se
  // sube. Sin la reconciliación, la cola drena una lista que nadie llenó.
  const ciclo = async () => {
    await reconciliar();
    await drain();
  };

  window.addEventListener('online', () => void ciclo());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void ciclo();
  });
  temporizador = window.setInterval(() => void drain(), INTERVALO_MS);
  // Barrido completo cada 5 minutos, por si algo entró por un camino que no
  // encola (importación, restauración, migración).
  reconciliador = window.setInterval(() => void reconciliar(), 5 * 60_000);
  void ciclo();
}

export function stopSync() {
  corriendo = false;
  if (temporizador) window.clearInterval(temporizador);
  if (reconciliador) window.clearInterval(reconciliador);
}

/** Reintenta ya mismo todo lo que quedó marcado como fallido. */
export async function reintentarFallidos(): Promise<void> {
  const fallidos = await db.syncQueue.where('status').equals('failed').toArray();
  await Promise.all(
    fallidos.map(item => db.syncQueue.update(item.id!, { status: 'pending', attempts: 0, nextAttemptAt: 0 })),
  );
  avisar();
  await drain();
}

export interface EstadoSync {
  pendientes: number;
  fallidos: number;
  enLinea: boolean;
  conSesion: boolean;
  nubeLista: boolean;
}

export function useSyncStatus(): EstadoSync {
  const [estado, setEstado] = useState<EstadoSync>({
    pendientes: 0,
    fallidos: 0,
    enLinea: navigator.onLine,
    conSesion: false,
    nubeLista: supabaseConfigurado(),
  });

  useEffect(() => {
    let vivo = true;
    const refrescar = async () => {
      try {
        const [pendientes, fallidos] = await Promise.all([
          db.syncQueue.where('status').anyOf('pending', 'processing').count(),
          db.syncQueue.where('status').equals('failed').count(),
        ]);
        if (vivo) {
          setEstado({
            pendientes,
            fallidos,
            enLinea: navigator.onLine,
            conSesion: haySesion(),
            nubeLista: supabaseConfigurado(),
          });
        }
      } catch {
        /* la base todavía no abrió */
      }
    };
    void refrescar();
    const intervalo = window.setInterval(refrescar, 5000);
    window.addEventListener(EVENTO, refrescar);
    window.addEventListener('online', refrescar);
    window.addEventListener('offline', refrescar);
    return () => {
      vivo = false;
      window.clearInterval(intervalo);
      window.removeEventListener(EVENTO, refrescar);
      window.removeEventListener('online', refrescar);
      window.removeEventListener('offline', refrescar);
    };
  }, []);

  return estado;
}
