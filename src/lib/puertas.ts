/**
 * Puertas de la cadena de gestión: los puntos donde saltarse el paso cuesta dinero.
 *
 * Este módulo es PURO a propósito — no importa Dexie, ni Firebase, ni React. Así se
 * puede probar entero sin navegador (`npm run probar:bitacora`). La escritura vive en
 * `bitacora.ts`.
 *
 * De dónde salen estas diez puertas: de la cadena de gestión del negocio, donde cada
 * una cita los hechos que la sostienen. Los ids (`P-05.3`) son los mismos allá y acá
 * a propósito: si alguna vez hay que auditar un proyecto, las dos mitades hablan del
 * mismo paso y no hay que traducir.
 *
 * Seis de las diez no tenían dónde quedar registradas, y son justamente las que este
 * módulo existe para cubrir. Las otras cuatro ya dejan rastro en otra parte (el hilo de
 * WhatsApp, la cotización, el proyecto) y se pueden registrar igual, pero no es su sitio
 * natural.
 *
 * **Por qué un registro y no seis pantallas:** las seis piden lo mismo — que quede
 * escrito que una persona verificó algo, cuándo, y con qué resultado. Son el mismo gesto
 * sobre objetos distintos. Seis pantallas costarían seis veces más y dejarían seis
 * lugares donde olvidarse de escribir.
 */

export type GateOutcome = 'cumplida' | 'no_cumplida';

export interface PuertaDef {
  /** Id de la etapa en la cadena de gestión. Es la llave: no cambiarlo a la ligera. */
  id: string;
  /** Proceso al que pertenece, para agrupar en pantalla. */
  proceso: string;
  nombre: string;
  /** Qué tiene que cumplirse para pasar. */
  condicion: string;
  /** Qué hacer cuando no se cumple. Una puerta que no lo dice no detiene nada. */
  siFalla: string;
  /**
   * `true` si esta app es el sitio donde debe quedar la constancia. Las cuatro en
   * `false` ya dejan rastro en otra parte; se pueden registrar, pero no se reclaman.
   */
  constanciaEnApp: boolean;
}

export const PUERTAS: PuertaDef[] = [
  {
    id: 'P-01.4',
    proceso: 'Atención de entrada',
    nombre: 'Ningún valor suelto',
    condicion: "Todo valor que sale lleva dicho si es instalado y si es 'desde', y viene de un precio aprobado.",
    siFalla: "No se manda la cifra: se ofrece la visita de diagnóstico, que es lo que convierte el 'desde' en un valor firme.",
    constanciaEnApp: false,
  },
  {
    id: 'P-02.4',
    proceso: 'Diagnóstico y levantamiento',
    nombre: 'Clasificar el origen de la medida',
    condicion: 'Ninguna medida entra a fabricación sin estado declarado. Si la dio el cliente, su responsabilidad queda por escrito.',
    siFalla: 'No se fabrica con esa medida: se agenda visita de validación, o se deja constancia de que el cliente la asume.',
    constanciaEnApp: false,
  },
  {
    id: 'P-03.2',
    proceso: 'Cotización',
    nombre: 'Validaciones técnicas que bloquean',
    condicion: 'Cero validaciones bloqueantes abiertas en el proyecto.',
    siFalla: 'Se vuelve al levantamiento a completar medidas o corregir el diseño. No se emite con una alerta bloqueante abierta.',
    constanciaEnApp: false,
  },
  {
    id: 'P-03.3',
    proceso: 'Cotización',
    nombre: 'Ningún precio sin aprobación',
    condicion: 'Todo valor de la propuesta fue aprobado explícitamente por el dueño.',
    siFalla: 'No se emite la cotización.',
    constanciaEnApp: true,
  },
  {
    id: 'P-04.3',
    proceso: 'Negociación',
    nombre: 'Descuento autorizado',
    condicion: 'El descuento aplicado está autorizado y consta contra qué se concedió.',
    siFalla: 'No se aplica: se reemite la cotización con el valor vigente.',
    constanciaEnApp: true,
  },
  {
    id: 'P-05.3',
    proceso: 'Cierre y abono',
    nombre: 'El abono lo valida una persona',
    condicion: 'Abono confirmado tras verificar el ingreso. La foto del comprobante no es pago confirmado.',
    siFalla: 'El proyecto se queda pendiente de abono. No se hace pedido al proveedor ni se corta material.',
    constanciaEnApp: true,
  },
  {
    id: 'P-06.4',
    proceso: 'Pedido y producción',
    nombre: 'Cambio con la producción iniciada',
    condicion: 'Toda variación con impacto en dinero, producción, instalación o garantía está aprobada antes de ejecutarse.',
    siFalla: 'No se ejecuta el cambio. Se explica al cliente qué sí es posible y con qué costo.',
    constanciaEnApp: true,
  },
  {
    id: 'P-07.3',
    proceso: 'Instalación',
    nombre: 'Verificar antes de taladrar',
    condicion: 'Medidas del producto verificadas contra el vano real antes de perforar.',
    siFalla: 'No se taladra. La visita queda parcial y la pieza vuelve a taller: perforar sobre una medida equivocada daña la obra del cliente.',
    constanciaEnApp: true,
  },
  {
    id: 'P-08.1',
    proceso: 'Entrega y capacitación',
    nombre: 'Instalar no es cerrar',
    condicion: 'Capacitación de uso entregada y ajustes finales hechos.',
    siFalla: 'El proyecto no pasa a entregado. Un motor sin programar vuelve como reclamo de garantía que no es garantía.',
    constanciaEnApp: true,
  },
  {
    id: 'P-09.3',
    proceso: 'Posventa y garantía',
    nombre: 'No improvisar el plazo de garantía',
    condicion: 'El plazo y la cobertura que se comunican están respaldados por una fuente confirmada.',
    siFalla: 'No se promete un plazo: se atiende el caso por su causa técnica y se consulta antes de comprometer cobertura.',
    constanciaEnApp: false,
  },
];

/**
 * Un hecho de puerta. Se agrega y NUNCA se edita ni se borra.
 *
 * Una constancia que se puede cambiar después no es constancia. El error se corrige con
 * un evento nuevo que apunta al anterior (`corrigeA`), igual que un asiento contable: lo
 * que pasó queda, y lo que se corrigió también.
 */
export interface GateEvent {
  id?: number;
  projectId: number;
  /** Se guarda además del id porque sobrevive a cualquier reindexado local. */
  projectCode: string;
  /** Id de la etapa en la cadena (`P-05.3`). Validado contra PUERTAS. */
  etapa: string;
  resultado: GateOutcome;
  /** Email del usuario autenticado. Nunca un nombre escrito a mano. */
  actor: string;
  at: number;
  nota?: string;
  /** Foto ya existente en la tabla `photos`. */
  evidenceId?: string;
  /** Id del evento que este corrige. Para enmendar sin borrar. */
  corrigeA?: number;
}

export function puertaPorId(etapa: string): PuertaDef | undefined {
  return PUERTAS.find(p => p.id === etapa);
}

/** Las que esta app existe para cubrir. */
export function puertasPendientesDeConstancia(): PuertaDef[] {
  return PUERTAS.filter(p => p.constanciaEnApp);
}

export class PuertaInvalida extends Error {}

/**
 * Arma el evento validando todo lo que no se puede arreglar después.
 *
 * Las claves opcionales se asignan SOLO si tienen valor: crear una clave que vale
 * `undefined` hace que Firestore rechace el documento entero, y este registro está
 * pensado para poder viajar a la nube el día que haga falta.
 */
export function construirEvento(entrada: {
  projectId: number;
  projectCode: string;
  etapa: string;
  resultado: GateOutcome;
  actor: string;
  at?: number;
  nota?: string;
  evidenceId?: string;
  corrigeA?: number;
}): GateEvent {
  if (!puertaPorId(entrada.etapa)) {
    throw new PuertaInvalida(
      `La etapa "${entrada.etapa}" no es una puerta conocida. La lista es cerrada a propósito: ` +
      'un id inventado acá deja de coincidir con la cadena de gestión y la constancia no se puede auditar.',
    );
  }
  if (entrada.resultado !== 'cumplida' && entrada.resultado !== 'no_cumplida') {
    throw new PuertaInvalida(`Resultado inválido: "${entrada.resultado}".`);
  }
  if (!Number.isFinite(entrada.projectId) || entrada.projectId <= 0) {
    throw new PuertaInvalida('Falta el proyecto al que pertenece la constancia.');
  }
  if (!entrada.projectCode) {
    throw new PuertaInvalida('Falta el código del proyecto.');
  }
  const actor = (entrada.actor || '').trim();
  if (!actor) {
    throw new PuertaInvalida(
      'Falta quién lo verificó. Una constancia sin autor no prueba nada, que es justo lo que esto viene a resolver.',
    );
  }

  const evento: GateEvent = {
    projectId: entrada.projectId,
    projectCode: entrada.projectCode,
    etapa: entrada.etapa,
    resultado: entrada.resultado,
    actor,
    at: entrada.at ?? Date.now(),
  };
  const nota = (entrada.nota || '').trim();
  if (nota) evento.nota = nota;
  if (entrada.evidenceId) evento.evidenceId = entrada.evidenceId;
  if (entrada.corrigeA !== undefined) evento.corrigeA = entrada.corrigeA;
  return evento;
}

export interface EstadoPuerta {
  puerta: PuertaDef;
  /** El evento que manda hoy, ya descontadas las correcciones. */
  vigente?: GateEvent;
  /** Todos los eventos de esa puerta, del más nuevo al más viejo. */
  historial: GateEvent[];
}

/**
 * Estado de cada puerta de un proyecto.
 *
 * Un evento corregido por otro deja de ser el vigente, pero NO desaparece del historial:
 * el propósito de esto es poder mostrar qué se verificó y cuándo, incluido lo que se
 * enmendó. Si hay dos eventos sin corregir para la misma puerta, manda el más reciente.
 */
export function estadoDePuertas(eventos: GateEvent[]): EstadoPuerta[] {
  const corregidos = new Set<number>();
  for (const e of eventos) {
    if (e.corrigeA !== undefined) corregidos.add(e.corrigeA);
  }
  const recientesPrimero = [...eventos].sort((a, b) => b.at - a.at);

  return PUERTAS.map(puerta => {
    const historial = recientesPrimero.filter(e => e.etapa === puerta.id);
    const vigente = historial.find(e => e.id === undefined || !corregidos.has(e.id));
    const estado: EstadoPuerta = { puerta, historial };
    if (vigente) estado.vigente = vigente;
    return estado;
  });
}

/** Cuántas de las puertas que esta app debe cubrir tienen constancia cumplida. */
export function avanceDeConstancia(eventos: GateEvent[]): { cumplidas: number; total: number } {
  const estados = estadoDePuertas(eventos).filter(e => e.puerta.constanciaEnApp);
  return {
    cumplidas: estados.filter(e => e.vigente?.resultado === 'cumplida').length,
    total: estados.length,
  };
}
