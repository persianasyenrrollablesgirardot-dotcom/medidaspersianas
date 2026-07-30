import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { auth, dbFirestore } from './firebase';
import { db } from '../db';
import type { TechnicalProject } from '../types';

/**
 * RESPALDO EN LA NUBE DE **TODOS** LOS PROYECTOS
 *
 * Hasta ahora la nube solo tenía los proyectos ENVIADOS AL PROVEEDOR
 * (`cloud_projects`, ver `cloudSync.ts`) y encima sin fotos. Eso nunca fue un
 * respaldo: si se perdía el celular, se perdía todo lo demás.
 *
 * Esta colección es aparte y guarda todo. NO se toca `cloud_projects`, que
 * sigue sirviendo al proveedor exactamente igual que antes.
 *
 * IDENTIDAD = `code` (TCJ-…), no el `id`.
 * El id del admin es `-Date.now()`, o sea distinto en cada dispositivo:
 * deduplicar por id mezcla proyectos que no tienen nada que ver. Este fue uno
 * de los dos bugs que aparecieron durante el rescate de julio.
 */

const COLECCION = 'admin_projects';

function idDocumento(project: TechnicalProject): string {
  const base = project.code || `sin-codigo-${project.id}`;
  // Firestore no admite '/' en el id del documento.
  return base.replace(/[/\\]/g, '_').slice(0, 400);
}

export function haySesion(): boolean {
  return Boolean(auth.currentUser);
}

/**
 * Sube un proyecto. Las fotos NO van acá (están en Supabase Storage): se
 * conserva la referencia `photoId`/`remoteUrl` para poder rearmarlas.
 */
export async function subirProyecto(project: TechnicalProject): Promise<void> {
  if (!haySesion()) throw new Error('Sin sesión iniciada');

  const aligerado = {
    ...project,
    spaces: (project.spaces || []).map(space => ({
      ...space,
      windows: (space.windows || []).map(win => ({
        ...win,
        evidence: (win.evidence || []).map(ev => ({
          ...ev,
          // El base64 nunca sube a Firestore: revienta el tope de 1 MB por
          // documento. La foto vive en Supabase; acá va solo el puntero.
          dataUrl: '',
        })),
      })),
    })),
    ownerUid: auth.currentUser!.uid,
    lastBackupAt: Date.now(),
  };

  await setDoc(doc(dbFirestore, COLECCION, idDocumento(project)), aligerado, { merge: true });
}

/**
 * SUBE TODO LO QUE HAY EN EL DISPOSITIVO, AHORA.
 *
 * Faltaba, y por eso la nube podía estar vacía sin que nada avisara: un
 * proyecto solo se encolaba para subir cuando se GUARDABA (`persist()` en
 * localFallbackStore). La migración de localStorage a IndexedDB escribe con
 * `db.projects.put` directo, sin encolar, así que **todos los proyectos que ya
 * existían nunca se subieron** — solo los que se editaran después. Sumado a que
 * la escritura moría por el `undefined` (ver `firebase.ts`), la nube quedó sin
 * nada mientras el panel decía "Al día".
 *
 * Lo que falla no se pierde: se encola con reintentos.
 */
export async function subirTodosLosProyectos(
  avance?: (hechos: number, total: number) => void,
): Promise<{ total: number; subidos: number; encolados: number }> {
  if (!haySesion()) throw new Error('Sin sesión iniciada');

  const proyectos = (await db.projects.toArray()).filter(p => !p.deletedAt);
  let subidos = 0;
  let encolados = 0;

  for (let i = 0; i < proyectos.length; i++) {
    const proyecto = proyectos[i];
    try {
      await subirProyecto(proyecto);
      subidos++;
    } catch (error) {
      console.error(`No se pudo subir ${proyecto.code}`, error);
      // Import dinámico: syncQueue importa de acá, y estáticamente sería un ciclo.
      const { enqueue } = await import('./syncQueue');
      await enqueue('upsert_project', proyecto.code, { code: proyecto.code, id: proyecto.id });
      encolados++;
    }
    avance?.(i + 1, proyectos.length);
  }

  if (subidos > 0 && encolados === 0) marcarSubidaCompleta(subidos);
  return { total: proyectos.length, subidos, encolados };
}

const CLAVE_ULTIMA_SUBIDA = 'juno_ultima_subida_completa_v1';

function marcarSubidaCompleta(proyectos: number) {
  try {
    window.localStorage.setItem(CLAVE_ULTIMA_SUBIDA, JSON.stringify({ cuando: Date.now(), proyectos }));
  } catch {
    /* no es crítico */
  }
}

/**
 * Cuándo se subió TODO por última vez. `null` = nunca.
 * El panel mostraba "Al día" con la cola vacía, que no es lo mismo que
 * "está respaldado": una cola vacía también puede significar que nunca se
 * encoló nada. Esto es el dato honesto.
 */
export function ultimaSubidaCompleta(): { cuando: number; proyectos: number } | null {
  try {
    const raw = window.localStorage.getItem(CLAVE_ULTIMA_SUBIDA);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function borrarProyectoDeLaNube(project: TechnicalProject): Promise<void> {
  if (!haySesion()) throw new Error('Sin sesión iniciada');
  await deleteDoc(doc(dbFirestore, COLECCION, idDocumento(project)));
}

/** Trae todo lo que haya en la nube. Es el camino de vuelta tras perder el equipo. */
export async function bajarTodo(): Promise<TechnicalProject[]> {
  if (!haySesion()) throw new Error('Sin sesión iniciada');
  const snap = await getDocs(collection(dbFirestore, COLECCION));
  const proyectos: TechnicalProject[] = [];
  snap.forEach(documento => {
    const data = documento.data() as TechnicalProject;
    if (data && Array.isArray(data.spaces)) proyectos.push(data);
  });
  return proyectos;
}

/** Cuántos proyectos locales todavía no tienen copia en la nube. */
export async function pendientesDeSubir(): Promise<number> {
  return db.syncQueue.where('status').anyOf('pending', 'failed').count();
}

export interface ResultadoPrueba {
  ok: boolean;
  paso: string;
  detalle: string;
}

/**
 * PRUEBA REAL DE PUNTA A PUNTA.
 *
 * Escribe un documento de prueba en Firestore, lo vuelve a leer y lo borra.
 * No es un "creo que está bien": si esto pasa, el respaldo funciona de verdad
 * en ESTE teléfono, con ESTA cuenta y ESTA red.
 */
export async function probarNube(): Promise<ResultadoPrueba> {
  if (!auth.currentUser) {
    return { ok: false, paso: 'Sesión', detalle: 'No hay sesión iniciada. Cerrá y volvé a entrar.' };
  }

  const marca = `prueba-${auth.currentUser.uid}`;
  const referencia = doc(dbFirestore, COLECCION, marca);
  const valor = Date.now();

  try {
    await setDoc(referencia, {
      esPrueba: true,
      ownerUid: auth.currentUser.uid,
      valor,
      spaces: [],
    });
  } catch (error: any) {
    const codigo = error?.code || '';
    if (String(codigo).includes('permission-denied')) {
      return {
        ok: false,
        paso: 'Escritura',
        detalle: 'Firebase rechazó la escritura (permission-denied). Suele ser que las reglas de Firestore vencieron: revisalas en la consola de Firebase.',
      };
    }
    return { ok: false, paso: 'Escritura', detalle: `No se pudo escribir: ${error?.message || error}` };
  }

  try {
    const snap = await getDocs(collection(dbFirestore, COLECCION));
    let encontrado = false;
    snap.forEach(d => {
      if (d.id === marca && (d.data() as any)?.valor === valor) encontrado = true;
    });
    if (!encontrado) {
      return { ok: false, paso: 'Lectura', detalle: 'Se escribió pero no se pudo leer de vuelta.' };
    }
  } catch (error: any) {
    return { ok: false, paso: 'Lectura', detalle: `No se pudo leer: ${error?.message || error}` };
  }

  try {
    await deleteDoc(referencia);
  } catch {
    /* quedó un documento de prueba: inofensivo */
  }

  return { ok: true, paso: 'Completo', detalle: 'Escribir, leer y borrar en la nube: todo funcionó.' };
}
