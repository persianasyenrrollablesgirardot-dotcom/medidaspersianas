/**
 * Bitácora de puertas: la escritura. La lógica y el catálogo están en `puertas.ts`,
 * que es puro y se prueba sin navegador.
 *
 * Append-only de verdad: acá no hay `update` ni `delete`. No es un descuido — una
 * constancia que se puede editar después no prueba nada. Para enmendar se agrega un
 * evento nuevo con `corrigeA`, y el anterior queda a la vista en el historial.
 *
 * Vive en Dexie junto a los proyectos, con el mismo criterio que ellos: **los datos del
 * admin son locales por dispositivo**. Eso significa que la bitácora de un proyecto está
 * donde se registró. Subirla a la nube es posible (el evento ya está armado sin claves
 * `undefined`, así que Firestore lo acepta) pero queda para cuando haga falta: hoy ni los
 * proyectos se respaldan completos.
 */
import { db } from '../db';
import {
  construirEvento,
  estadoDePuertas,
  avanceDeConstancia,
  type GateEvent,
  type GateOutcome,
  type EstadoPuerta,
} from './puertas';

export { PUERTAS, puertaPorId, puertasPendientesDeConstancia, PuertaInvalida } from './puertas';
export type { GateEvent, GateOutcome, PuertaDef, EstadoPuerta } from './puertas';

/**
 * Registra que alguien verificó una puerta. Devuelve el evento guardado, con su id.
 *
 * Lanza `PuertaInvalida` si la etapa no existe o falta el actor: es mejor que falle acá
 * que guardar una constancia que después no se puede auditar.
 */
export async function registrarPuerta(entrada: {
  projectId: number;
  projectCode: string;
  etapa: string;
  resultado: GateOutcome;
  actor: string;
  nota?: string;
  evidenceId?: string;
  corrigeA?: number;
}): Promise<GateEvent> {
  const evento = construirEvento(entrada);
  const id = await db.projectEvents.add(evento);
  return { ...evento, id };
}

/** Los eventos de un proyecto, del más nuevo al más viejo. */
export async function eventosDeProyecto(projectId: number): Promise<GateEvent[]> {
  const eventos = await db.projectEvents.where('projectId').equals(projectId).toArray();
  return eventos.sort((a, b) => b.at - a.at);
}

/** Estado de las diez puertas para un proyecto, ya resueltas las correcciones. */
export async function puertasDeProyecto(projectId: number): Promise<EstadoPuerta[]> {
  return estadoDePuertas(await eventosDeProyecto(projectId));
}

/** Cuántas de las puertas que esta app debe cubrir tienen constancia cumplida. */
export async function avanceDeProyecto(projectId: number): Promise<{ cumplidas: number; total: number }> {
  return avanceDeConstancia(await eventosDeProyecto(projectId));
}

export { estadoDePuertas, avanceDeConstancia, construirEvento } from './puertas';
