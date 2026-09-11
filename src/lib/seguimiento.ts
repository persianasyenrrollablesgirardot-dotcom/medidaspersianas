/**
 * Seguimiento del pedido: donde va la produccion y como salieron las visitas.
 *
 * Modulo PURO (cero imports) para poder probarlo sin navegador. La escritura vive en
 * `bitacoraSeguimiento.ts`.
 *
 * ## Por que un eje aparte y no ampliar `ProjectStatus`
 *
 * `ProjectStatus` (draft, quick_quote, technical_pending, ready_for_fabrication, archived)
 * responde **que tan completo esta el levantamiento**. Los estados de aca responden otra
 * cosa: **donde va el pedido**. Son dos ejes distintos y un proyecto puede estar
 * `ready_for_fabrication` y `en_produccion` al mismo tiempo, sin contradiccion.
 *
 * Mezclarlos en una sola union habria obligado a los filtros y las estadisticas del
 * Dashboard —que hoy parten el mundo en "listos" y "pendientes"— a decidir de que lado cae
 * `retenido` o `entregado`, y no hay respuesta buena. Este campo es opcional: un proyecto
 * que todavia no arranco produccion simplemente no tiene ninguno, y nada de lo que ya
 * funcionaba cambia.
 *
 * ## Las dos listas son cerradas
 *
 * Salen del vocabulario oficial del negocio, el mismo que usa el sistema de operacion.
 * No se inventan estados intermedios: la lista tambien es como se habla del pedido, y un
 * estado inventado en pantalla se convierte en un estado inventado al telefono.
 *
 * ## No se bloquea el orden, a proposito
 *
 * La secuencia normal va de `pendiente_abono` a `instalado`, pero la realidad la rompe todo
 * el tiempo: un pedido queda `retenido` desde cualquier punto, una instalacion vuelve a
 * taller, un cliente recibe la mitad. Bloquear los saltos obligaria a registrar mentiras
 * para poder avanzar. Lo que si queda es el rastro: quien lo movio, cuando, y desde donde.
 * `esRetroceso()` existe para que la pantalla avise, no para impedir.
 */

export type ProductionStatus =
  | 'pendiente_abono'
  | 'pedido_proveedor'
  | 'en_produccion'
  | 'listo_instalar'
  | 'retenido'
  | 'entregado'
  | 'instalado';

export type VisitStatus = 'programada' | 'completa' | 'parcial' | 'fallida' | 'reagendada';

export type TrackingKind = 'produccion' | 'visita';

export interface EstadoDef {
  id: string;
  etiqueta: string;
  /** Que significa, en una linea. Sale en pantalla: evita que dos personas lo usen distinto. */
  descripcion: string;
  /**
   * Posicion en la secuencia normal. `null` = fuera de secuencia (`retenido` no es un
   * avance ni un retroceso: es una pausa que puede pasar en cualquier momento).
   */
  orden: number | null;
}

export const ESTADOS_PRODUCCION: EstadoDef[] = [
  {
    id: 'pendiente_abono',
    etiqueta: 'Pendiente de abono',
    descripcion: 'Cerrado con el cliente, pero sin abono validado. Nada se pide ni se corta todavia.',
    orden: 1,
  },
  {
    id: 'pedido_proveedor',
    etiqueta: 'Pedido al proveedor',
    descripcion: 'El pedido salio al proveedor con las medidas finales de fabricacion.',
    orden: 2,
  },
  {
    id: 'en_produccion',
    etiqueta: 'En produccion',
    descripcion: 'El proveedor lo esta fabricando. Desde aca un cambio ya cuesta.',
    orden: 3,
  },
  {
    id: 'listo_instalar',
    etiqueta: 'Listo para instalar',
    descripcion: 'Producto completo y revisado. Recien ahora se programa la instalacion.',
    orden: 4,
  },
  {
    id: 'retenido',
    etiqueta: 'Retenido',
    descripcion: 'Frenado por algo: falta de material, saldo, acceso a la obra o una definicion del cliente.',
    orden: null,
  },
  {
    id: 'entregado',
    etiqueta: 'Entregado',
    descripcion: 'El producto llego a destino, pero todavia no esta montado.',
    orden: 5,
  },
  {
    id: 'instalado',
    etiqueta: 'Instalado',
    descripcion: 'Montado, nivelado y probado. Ojo: instalado no es cerrado, falta la capacitacion de uso.',
    orden: 6,
  },
];

export const ESTADOS_VISITA: EstadoDef[] = [
  {
    id: 'programada',
    etiqueta: 'Programada',
    descripcion: 'Hay fecha acordada con el cliente.',
    orden: 1,
  },
  {
    id: 'completa',
    etiqueta: 'Completa',
    descripcion: 'Se hizo todo lo que estaba previsto.',
    orden: 2,
  },
  {
    id: 'parcial',
    etiqueta: 'Parcial',
    descripcion: 'Se hizo una parte. Queda pendiente volver, y conviene decir que falto.',
    orden: 2,
  },
  {
    id: 'fallida',
    etiqueta: 'Fallida',
    descripcion: 'No se pudo hacer: sin acceso, obra sin terminar, cliente ausente, medida equivocada.',
    orden: 2,
  },
  {
    id: 'reagendada',
    etiqueta: 'Reagendada',
    descripcion: 'Se movio a otra fecha antes de intentarla.',
    orden: 1,
  },
];

export interface TrackingEvent {
  id?: number;
  projectId: number;
  projectCode: string;
  tipo: TrackingKind;
  estado: string;
  actor: string;
  /** Cuando se REGISTRO el hecho. */
  at: number;
  nota?: string;
  /**
   * Solo visitas: para cuando esta la visita. Puede ser futuro, y por eso no se mezcla
   * con `at` — confundirlos hace que una visita programada para el viernes parezca hecha hoy.
   */
  fechaVisita?: number;
}

export class SeguimientoInvalido extends Error {}

export function estadosDe(tipo: TrackingKind): EstadoDef[] {
  return tipo === 'produccion' ? ESTADOS_PRODUCCION : ESTADOS_VISITA;
}

export function estadoDef(tipo: TrackingKind, estado: string): EstadoDef | undefined {
  return estadosDe(tipo).find(e => e.id === estado);
}

/**
 * Arma el evento validando lo que no se puede arreglar despues.
 *
 * Las claves opcionales se asignan SOLO si tienen valor: una clave en `undefined` hace que
 * Firestore rechace el documento entero (gotcha 4).
 */
export function construirSeguimiento(entrada: {
  projectId: number;
  projectCode: string;
  tipo: TrackingKind;
  estado: string;
  actor: string;
  at?: number;
  nota?: string;
  fechaVisita?: number;
}): TrackingEvent {
  if (entrada.tipo !== 'produccion' && entrada.tipo !== 'visita') {
    throw new SeguimientoInvalido(`Tipo de seguimiento desconocido: "${entrada.tipo}".`);
  }
  if (!estadoDef(entrada.tipo, entrada.estado)) {
    throw new SeguimientoInvalido(
      `"${entrada.estado}" no es un estado de ${entrada.tipo}. La lista es cerrada: es tambien el ` +
      'vocabulario con el que se habla del pedido, y un estado inventado en pantalla termina ' +
      'siendo un estado inventado al telefono.',
    );
  }
  if (entrada.tipo === 'produccion' && entrada.fechaVisita !== undefined) {
    throw new SeguimientoInvalido('La fecha de visita no corresponde a un estado de produccion.');
  }
  if (!Number.isFinite(entrada.projectId) || entrada.projectId <= 0) {
    throw new SeguimientoInvalido('Falta el proyecto.');
  }
  if (!entrada.projectCode) {
    throw new SeguimientoInvalido('Falta el codigo del proyecto.');
  }
  const actor = (entrada.actor || '').trim();
  if (!actor) {
    throw new SeguimientoInvalido('Falta quien lo registro. Sin autor no se puede reconstruir que paso.');
  }

  const evento: TrackingEvent = {
    projectId: entrada.projectId,
    projectCode: entrada.projectCode,
    tipo: entrada.tipo,
    estado: entrada.estado,
    actor,
    at: entrada.at ?? Date.now(),
  };
  const nota = (entrada.nota || '').trim();
  if (nota) evento.nota = nota;
  if (entrada.fechaVisita !== undefined) evento.fechaVisita = entrada.fechaVisita;
  return evento;
}

/** Los eventos de un tipo, del mas nuevo al mas viejo. */
export function historialDe(eventos: TrackingEvent[], tipo: TrackingKind): TrackingEvent[] {
  return eventos
    .filter(e => e.tipo === tipo)
    .sort((a, b) => (b.at - a.at) || ((b.id ?? 0) - (a.id ?? 0)));
}

/** El estado vigente de un tipo: el ultimo que se registro. */
export function estadoActual(eventos: TrackingEvent[], tipo: TrackingKind): TrackingEvent | undefined {
  return historialDe(eventos, tipo)[0];
}

/**
 * `true` si pasar de `desde` a `hacia` va para atras en la secuencia normal.
 *
 * No lo impide nadie: es para que la pantalla pregunte antes, porque casi siempre es un
 * error de dedo y muy de vez en cuando es real (un producto instalado que vuelve a taller).
 * Un estado fuera de secuencia —`retenido`— nunca cuenta como retroceso.
 */
export function esRetroceso(tipo: TrackingKind, desde: string | undefined, hacia: string): boolean {
  if (!desde) return false;
  const a = estadoDef(tipo, desde);
  const b = estadoDef(tipo, hacia);
  if (!a || !b || a.orden === null || b.orden === null) return false;
  return b.orden < a.orden;
}

/** Cuanto avanzo la produccion, para pintar una barra. `retenido` no mueve la aguja. */
export function avanceProduccion(eventos: TrackingEvent[]): { paso: number; total: number; retenido: boolean } {
  const total = ESTADOS_PRODUCCION.filter(e => e.orden !== null).length;
  const actual = estadoActual(eventos, 'produccion');
  if (!actual) return { paso: 0, total, retenido: false };
  const def = estadoDef('produccion', actual.estado);
  if (!def || def.orden === null) {
    // Retenido: se muestra el ultimo avance real que hubo, no cero.
    const previo = historialDe(eventos, 'produccion')
      .map(e => estadoDef('produccion', e.estado))
      .find(d => d && d.orden !== null);
    return { paso: previo?.orden ?? 0, total, retenido: true };
  }
  return { paso: def.orden, total, retenido: false };
}
