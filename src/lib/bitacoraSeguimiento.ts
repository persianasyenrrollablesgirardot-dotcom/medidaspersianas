/**
 * Seguimiento del pedido: la escritura. La logica y los vocabularios estan en
 * `seguimiento.ts`, que es puro y se prueba sin navegador.
 *
 * Append-only, igual que la bitacora de puertas: no hay update ni delete. El estado
 * vigente es el ultimo evento, y todos los anteriores quedan. Eso es justamente lo que
 * hacia falta — no alcanza con saber que un pedido esta `instalado`; hace falta poder
 * decir cuando entro a produccion, cuando estuvo retenido y por que.
 *
 * Un campo mutable habria dado el estado de hoy y habria borrado la historia cada vez.
 */
import { db } from '../db';
import {
  construirSeguimiento,
  estadoActual,
  type TrackingEvent,
  type TrackingKind,
} from './seguimiento';

export {
  ESTADOS_PRODUCCION,
  ESTADOS_VISITA,
  estadosDe,
  estadoDef,
  esRetroceso,
  estadoActual,
  historialDe,
  avanceProduccion,
  construirSeguimiento,
  SeguimientoInvalido,
} from './seguimiento';
export type {
  ProductionStatus,
  VisitStatus,
  TrackingKind,
  TrackingEvent,
  EstadoDef,
} from './seguimiento';

/** Registra un cambio de estado. Devuelve el evento guardado, con su id. */
export async function registrarSeguimiento(entrada: {
  projectId: number;
  projectCode: string;
  tipo: TrackingKind;
  estado: string;
  actor: string;
  nota?: string;
  fechaVisita?: number;
}): Promise<TrackingEvent> {
  const evento = construirSeguimiento(entrada);
  const id = await db.trackingEvents.add(evento);
  return { ...evento, id };
}

/** Todos los eventos de seguimiento de un proyecto. */
export async function seguimientoDeProyecto(projectId: number): Promise<TrackingEvent[]> {
  return db.trackingEvents.where('projectId').equals(projectId).toArray();
}

/**
 * Estado de produccion vigente de VARIOS proyectos, en una sola lectura.
 *
 * El Dashboard pinta muchas tarjetas: una consulta por proyecto serian N lecturas a
 * IndexedDB en cada render. La tabla es chica (unas pocas filas por proyecto), asi que
 * sale mas barato traerla entera una vez y agrupar en memoria.
 */
export async function produccionPorProyecto(): Promise<Map<number, TrackingEvent>> {
  const todos = await db.trackingEvents.where('tipo').equals('produccion').toArray();
  const porProyecto = new Map<number, TrackingEvent[]>();
  for (const e of todos) {
    const lista = porProyecto.get(e.projectId);
    if (lista) lista.push(e);
    else porProyecto.set(e.projectId, [e]);
  }
  const vigentes = new Map<number, TrackingEvent>();
  for (const [projectId, eventos] of porProyecto) {
    const actual = estadoActual(eventos, 'produccion');
    if (actual) vigentes.set(projectId, actual);
  }
  return vigentes;
}
