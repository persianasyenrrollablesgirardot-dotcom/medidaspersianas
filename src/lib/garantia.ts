/**
 * Garantia: que cubre, por cuanto tiempo, y —sobre todo— cuando NO hay que responder.
 *
 * Modulo PURO (cero imports). La escritura esta en `casosGarantia.ts`.
 *
 * ## No hay un plazo unico, y esa era la pregunta mal hecha
 *
 * Durante meses convivieron cuatro cifras distintas (1 anio, 12 meses, 5 anios, "sin plazo
 * escrito") y ninguna tenia razon del todo, porque todas buscaban UN numero. Jhon lo fijo
 * el 11-sep-2026, en dos rondas, y la regla que salio cabe en una linea:
 *
 *   **Un anio para todo, salvo la tela Screen Solar, que son tres.**
 *
 *   tela Screen Solar                            ->  3 anios
 *   tela blackout                                ->  1 anio
 *   tela de poliester                            ->  1 anio
 *   perfileria (perfiles, mecanismos, herrajes)  ->  1 anio
 *   motor                                        ->  1 anio
 *   mano de obra de instalacion                  ->  1 anio
 *
 * **El plazo sigue a la TELA, no al sistema**: los tres anios del Screen Solar valen igual
 * en Sheer Elegance, en enrollables y en panel japones.
 *
 * ## Una persiana lleva DOS plazos a la vez
 *
 * Tres anios la tela y uno la perfileria. Por eso `coberturaDeSolucion()` devuelve las dos
 * y la pantalla muestra las dos: decir "tres anios" a secas promete de mas, y decir "un
 * anio" promete de menos. La pregunta del cliente es una sola; la respuesta honesta son dos
 * cifras.
 *
 * ## Lo que NO se sabe se responde como no sabido
 *
 * Quedan las **cadenillas y las peliculas solares**, sin plazo fijado desde siempre. Para
 * esas esto devuelve `sin_definir` con el motivo, y NUNCA un numero estimado. Un plazo
 * inventado aca se convierte en una promesa al cliente que la empresa no puede sostener.
 *
 * La misma respuesta vale para una tela cuya familia no se reconoce: sin saber que tela es,
 * no se sabe que plazo le toca, y adivinar hacia el lado de los tres anios promete de mas.
 */

export type PiezaGarantia =
  | 'tela'
  | 'perfileria'
  | 'motor'
  | 'instalacion'
  | 'cadenilla'
  | 'pelicula';

export type FamiliaTela = 'screen_solar' | 'poliester' | 'blackout' | 'otra';

/** Las seis causas del vocabulario del negocio. Lista cerrada. */
export type CausaGarantia = 'producto' | 'instalacion' | 'cliente' | 'ambiente' | 'tercero' | 'construccion';

export interface CausaDef {
  id: CausaGarantia;
  etiqueta: string;
  descripcion: string;
  /** Si por si sola suele implicar que el caso entra en garantia. Orienta, no decide. */
  sueleEntrar: boolean;
}

export const CAUSAS: CausaDef[] = [
  { id: 'producto', etiqueta: 'Producto', descripcion: 'Defecto de fabricacion de la tela, el mecanismo o el accesorio.', sueleEntrar: true },
  { id: 'instalacion', etiqueta: 'Instalacion', descripcion: 'Algo quedo mal montado, nivelado o ajustado por nosotros.', sueleEntrar: true },
  { id: 'cliente', etiqueta: 'Cliente', descripcion: 'Mal uso, manipulacion indebida o golpe.', sueleEntrar: false },
  { id: 'ambiente', etiqueta: 'Ambiente', descripcion: 'Humedad o exposicion exterior no autorizada.', sueleEntrar: false },
  { id: 'tercero', etiqueta: 'Tercero', descripcion: 'Intervino alguien mas: otro tecnico, otro proveedor.', sueleEntrar: false },
  { id: 'construccion', etiqueta: 'Construccion', descripcion: 'La obra o una instalacion previa irregular.', sueleEntrar: false },
];

export const EXCLUSIONES = [
  'Mal uso o manipulacion indebida',
  'Golpes o danos fisicos',
  'Humedad o exposicion exterior no autorizada',
  'Intervencion de terceros',
  'Instalaciones previas irregulares',
  'En motorizados: sobrecarga electrica, desprogramacion por terceros o instalacion electrica deficiente',
];

export interface PiezaDef {
  id: PiezaGarantia;
  etiqueta: string;
  /** Meses de cobertura, o `null` si no esta fijado. */
  meses: number | null;
  /** Por que ese plazo, o por que no hay. Sale en pantalla: es lo que sostiene la respuesta. */
  motivo: string;
}

const PERFILERIA: PiezaDef = {
  id: 'perfileria',
  etiqueta: 'Perfileria (perfiles, mecanismos y herrajes)',
  meses: 12,
  motivo: 'Un anio, fijado por el propietario el 11-sep-2026.',
};

const OTRAS_PIEZAS: Record<Exclude<PiezaGarantia, 'tela' | 'perfileria'>, PiezaDef> = {
  motor: {
    id: 'motor',
    etiqueta: 'Motor',
    meses: 12,
    motivo: 'Un anio, fijado por el propietario el 11-sep-2026. El documento al cliente dice "segun fabricante" sin nombrar ninguno; la empresa responde un anio igual, sea el motor que sea.',
  },
  instalacion: {
    id: 'instalacion',
    etiqueta: 'Mano de obra de instalacion',
    meses: 12,
    motivo: 'Un anio, fijado por el propietario el 11-sep-2026.',
  },
  cadenilla: {
    id: 'cadenilla',
    etiqueta: 'Cadenilla',
    meses: null,
    motivo: 'Marcada "por definir" desde siempre. Nunca se fijo.',
  },
  pelicula: {
    id: 'pelicula',
    etiqueta: 'Pelicula solar',
    meses: null,
    motivo: 'Marcada "por definir" desde siempre. Nunca se fijo.',
  },
};

const TELAS: Record<FamiliaTela, PiezaDef> = {
  screen_solar: {
    id: 'tela',
    etiqueta: 'Tela Screen Solar',
    meses: 36,
    motivo: 'Tres anios, fijado por el propietario el 11-sep-2026. Vale igual en Sheer Elegance, enrollables y panel japones: el plazo sigue a la tela, no al sistema.',
  },
  poliester: {
    id: 'tela',
    etiqueta: 'Tela de poliester',
    meses: 12,
    motivo: 'Un anio, fijado por el propietario el 11-sep-2026. En Girardot no se comercializa poliester.',
  },
  blackout: {
    id: 'tela',
    etiqueta: 'Tela blackout',
    meses: 12,
    motivo: 'Un anio, fijado por el propietario el 11-sep-2026. Necesitaba respuesta propia porque el blackout es PVC con fibra de vidrio: no es Screen Solar ni poliester.',
  },
  otra: {
    id: 'tela',
    etiqueta: 'Tela (familia sin identificar)',
    meses: null,
    motivo: 'Sin identificar la familia de la tela no se puede saber que plazo le toca.',
  },
};

export function piezaDef(pieza: PiezaGarantia, familia?: FamiliaTela): PiezaDef {
  if (pieza === 'perfileria') return PERFILERIA;
  if (pieza === 'tela') return TELAS[familia ?? 'otra'];
  return OTRAS_PIEZAS[pieza];
}

/** Familia de tela a partir del nombre comercial. Devuelve 'otra' si no reconoce. */
export function familiaDeTela(nombre: string | undefined): FamiliaTela {
  const n = (nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!n.trim()) return 'otra';
  // El orden importa: "Sheer Screen" es screen, y un blackout se nombra como blackout
  // aunque este montado en un enrollable.
  if (n.includes('blackout')) return 'blackout';
  if (n.includes('screen')) return 'screen_solar';
  if (n.includes('poliester') || n.includes('polyester')) return 'poliester';
  return 'otra';
}

export type Veredicto = 'dentro' | 'vencida' | 'sin_definir';

export interface Cobertura {
  pieza: PiezaDef;
  veredicto: Veredicto;
  /** Cuando vence, si hay plazo y fecha de instalacion. */
  venceEl?: number;
  /** Dias que faltan (positivo) o que pasaron (negativo). */
  diasRestantes?: number;
  /** Frase lista para decirle al cliente, o para explicar por que no hay respuesta. */
  explicacion: string;
}

const DIA = 24 * 60 * 60 * 1000;

function sumarMeses(desde: number, meses: number): number {
  const d = new Date(desde);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  // 31-ene + 1 mes daria 3-mar: se corrige al ultimo dia del mes que corresponde.
  if (d.getDate() < dia) d.setDate(0);
  return d.getTime();
}

/**
 * Evalua una pieza. Sin fecha de instalacion informa el plazo pero no dictamina: no se
 * puede decir si vencio algo que no se sabe cuando empezo.
 */
export function evaluarCobertura(entrada: {
  pieza: PiezaGarantia;
  familiaTela?: FamiliaTela;
  fechaInstalacion?: number;
  fechaReclamo?: number;
}): Cobertura {
  const def = piezaDef(entrada.pieza, entrada.familiaTela);

  if (def.meses === null) {
    return {
      pieza: def,
      veredicto: 'sin_definir',
      explicacion: `No hay plazo fijado para ${def.etiqueta.toLowerCase()}. ${def.motivo} No se promete un plazo: se consulta antes de comprometer cobertura.`,
    };
  }

  const anios = def.meses / 12;
  const plazo = anios === 1 ? '1 anio' : `${anios} anios`;

  if (entrada.fechaInstalacion === undefined) {
    return {
      pieza: def,
      veredicto: 'sin_definir',
      explicacion: `${def.etiqueta}: ${plazo} de garantia. Falta la fecha de instalacion para saber si el caso esta dentro.`,
    };
  }

  const venceEl = sumarMeses(entrada.fechaInstalacion, def.meses);
  const reclamo = entrada.fechaReclamo ?? Date.now();
  const diasRestantes = Math.round((venceEl - reclamo) / DIA);
  const dentro = reclamo <= venceEl;

  return {
    pieza: def,
    veredicto: dentro ? 'dentro' : 'vencida',
    venceEl,
    diasRestantes,
    explicacion: dentro
      ? `${def.etiqueta}: ${plazo} de garantia, vigente hasta el ${fechaCorta(venceEl)}.`
      : `${def.etiqueta}: ${plazo} de garantia, vencida el ${fechaCorta(venceEl)} (hace ${Math.abs(diasRestantes)} dias).`,
  };
}

function fechaCorta(at: number): string {
  const d = new Date(at);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Las DOS coberturas de una persiana: su tela y su perfileria.
 *
 * Es la forma en que hay que responderle al cliente. Una sola cifra siempre miente para
 * alguno de los dos lados.
 */
export function coberturaDeSolucion(entrada: {
  nombreTela?: string;
  familiaTela?: FamiliaTela;
  fechaInstalacion?: number;
  fechaReclamo?: number;
}): { tela: Cobertura; perfileria: Cobertura } {
  const familia = entrada.familiaTela ?? familiaDeTela(entrada.nombreTela);
  return {
    tela: evaluarCobertura({ pieza: 'tela', familiaTela: familia, fechaInstalacion: entrada.fechaInstalacion, fechaReclamo: entrada.fechaReclamo }),
    perfileria: evaluarCobertura({ pieza: 'perfileria', fechaInstalacion: entrada.fechaInstalacion, fechaReclamo: entrada.fechaReclamo }),
  };
}

export type ResolucionCaso =
  | 'en_garantia'
  | 'fuera_de_garantia'
  | 'mantenimiento_cotizado'
  | 'cerrado_sin_costo';

export const RESOLUCIONES: { id: ResolucionCaso; etiqueta: string; descripcion: string }[] = [
  { id: 'en_garantia', etiqueta: 'En garantia', descripcion: 'Se atiende sin costo por cobertura.' },
  { id: 'fuera_de_garantia', etiqueta: 'Fuera de garantia', descripcion: 'No entra. Hay que decir por que, con la causa.' },
  { id: 'mantenimiento_cotizado', etiqueta: 'Mantenimiento cotizado', descripcion: 'No entra en garantia y se ofrecio el servicio con precio.' },
  { id: 'cerrado_sin_costo', etiqueta: 'Cerrado sin costo', descripcion: 'Se resolvio en sitio o no habia falla.' },
];

export interface CasoGarantia {
  id?: number;
  projectId: number;
  projectCode: string;
  abiertoEl: number;
  actor: string;
  descripcion: string;
  pieza: PiezaGarantia;
  familiaTela?: FamiliaTela;
  nombreTela?: string;
  fechaInstalacion?: number;
  /**
   * Veredicto y explicacion CONGELADOS al abrir el caso.
   *
   * Se guardan aunque se puedan recalcular, y a proposito: si manana cambia una regla,
   * esto sigue diciendo que se le respondio al cliente aquel dia. Recalcular siempre
   * reescribiria la historia.
   */
  veredictoAlAbrir: Veredicto;
  explicacionAlAbrir: string;
  causa?: CausaGarantia;
  resolucion?: ResolucionCaso;
  notaCierre?: string;
  cerradoEl?: number;
}

export class CasoInvalido extends Error {}

export function construirCaso(entrada: {
  projectId: number;
  projectCode: string;
  actor: string;
  descripcion: string;
  pieza: PiezaGarantia;
  familiaTela?: FamiliaTela;
  nombreTela?: string;
  fechaInstalacion?: number;
  abiertoEl?: number;
}): CasoGarantia {
  if (!Number.isFinite(entrada.projectId) || entrada.projectId <= 0) {
    throw new CasoInvalido('Falta el proyecto del que viene el reclamo.');
  }
  if (!entrada.projectCode) throw new CasoInvalido('Falta el codigo del proyecto.');
  const actor = (entrada.actor || '').trim();
  if (!actor) throw new CasoInvalido('Falta quien abre el caso.');
  const descripcion = (entrada.descripcion || '').trim();
  if (!descripcion) {
    throw new CasoInvalido('Falta que reclama el cliente. Un caso sin el reclamo escrito no sirve para nada despues.');
  }
  if (!piezaDef(entrada.pieza, entrada.familiaTela) || !PIEZAS.some(p => p === entrada.pieza)) {
    throw new CasoInvalido(`"${entrada.pieza}" no es una pieza conocida.`);
  }

  const abiertoEl = entrada.abiertoEl ?? Date.now();
  const cobertura = evaluarCobertura({
    pieza: entrada.pieza,
    familiaTela: entrada.familiaTela ?? (entrada.pieza === 'tela' ? familiaDeTela(entrada.nombreTela) : undefined),
    fechaInstalacion: entrada.fechaInstalacion,
    fechaReclamo: abiertoEl,
  });

  const caso: CasoGarantia = {
    projectId: entrada.projectId,
    projectCode: entrada.projectCode,
    abiertoEl,
    actor,
    descripcion,
    pieza: entrada.pieza,
    veredictoAlAbrir: cobertura.veredicto,
    explicacionAlAbrir: cobertura.explicacion,
  };
  // Claves opcionales por asignacion condicional: una clave en `undefined` hace que
  // Firestore rechace el documento entero.
  const familia = entrada.familiaTela ?? (entrada.pieza === 'tela' ? familiaDeTela(entrada.nombreTela) : undefined);
  if (familia) caso.familiaTela = familia;
  if (entrada.nombreTela) caso.nombreTela = entrada.nombreTela;
  if (entrada.fechaInstalacion !== undefined) caso.fechaInstalacion = entrada.fechaInstalacion;
  return caso;
}

export const PIEZAS: PiezaGarantia[] = ['tela', 'perfileria', 'motor', 'instalacion', 'cadenilla', 'pelicula'];

export function causaDef(id: string): CausaDef | undefined {
  return CAUSAS.find(c => c.id === id);
}

export function abiertos(casos: CasoGarantia[]): CasoGarantia[] {
  return casos.filter(c => c.cerradoEl === undefined).sort((a, b) => b.abiertoEl - a.abiertoEl);
}

export function cerrados(casos: CasoGarantia[]): CasoGarantia[] {
  return casos.filter(c => c.cerradoEl !== undefined).sort((a, b) => (b.cerradoEl ?? 0) - (a.cerradoEl ?? 0));
}
