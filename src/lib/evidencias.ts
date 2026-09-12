/**
 * Evidencias: que pruebas hay que tener capturadas, y que NO se puede hacer sin ellas.
 *
 * Modulo PURO (solo importa el catalogo generado). La escritura esta en
 * `capturaEvidencia.ts`.
 *
 * ## Por que existe
 *
 * El proveedor no responde una garantia con buena voluntad: pide foto de la caja, foto por
 * persiana, una imagen con la persiana nivelada, lista de empaque que coincida. Si falta
 * una, el caso no arranca y nadie avisa. Lo mismo del lado legal: sin la firma de la
 * cornamusa se incumple una resolucion de la Superintendencia.
 *
 * Registrar "el paso se hizo" no alcanza. Hay que **tener el artefacto**.
 *
 * ## La regla que ordena todo: la prueba se junta antes de necesitarla
 *
 * Seis de las catorce evidencias son **anticipadas**: se capturan cuando no hay ningun
 * problema, porque el dia que hagan falta ya no se van a poder tomar.
 *
 *   - La foto de la caja se pierde al abrirla.
 *   - La observacion en la guia solo se puede escribir al firmar el recibido.
 *   - La foto de la persiana nivelada al instalar es la que separa un defecto de fabrica de
 *     un error propio; meses despues hay que volver a sitio, y si el cliente ya la manipulo,
 *     prueba menos.
 *
 * Por eso `pendientesAnticipadas()` existe: es lo unico irrecuperable, y la pantalla lo
 * muestra aunque nadie haya reclamado nada todavia.
 *
 * ## El catalogo NO se edita aca
 *
 * `evidenciasCatalogo.ts` lo genera la base de conocimiento desde su YAML. Si la app
 * llevara su propia lista, las dos se separarian en la primera correccion y nadie se
 * enteraria hasta que un reclamo se cayera por una prueba que la app no pedia.
 */
import { EVIDENCIAS, type EvidenciaDef, type FormatoEvidencia } from './evidenciasCatalogo';

export { EVIDENCIAS };
export type { EvidenciaDef, FormatoEvidencia };

/** Una evidencia efectivamente capturada para un proyecto. */
export interface CapturaEvidencia {
  id?: number;
  projectId: number;
  projectCode: string;
  /** Id del catalogo: `EV-02`. Lista cerrada. */
  evidencia: string;
  actor: string;
  at: number;
  /** Foto guardada en la tabla `photos`, cuando el formato es foto o video. */
  photoId?: string;
  /** Lo escrito, cuando el formato es dato, lista, documento o firma. */
  nota?: string;
  /** A que solucion concreta corresponde, cuando la evidencia es por persiana. */
  solutionId?: string;
}

export class EvidenciaInvalida extends Error {}

export function evidenciaDef(id: string): EvidenciaDef | undefined {
  return EVIDENCIAS.find(e => e.id === id);
}

export function evidenciasDeEtapa(etapa: string): EvidenciaDef[] {
  return EVIDENCIAS.filter(e => e.etapa === etapa);
}

export function evidenciasDeProceso(proceso: string): EvidenciaDef[] {
  return EVIDENCIAS.filter(e => e.etapa.startsWith(proceso + '.'));
}

/** Las que se capturan antes de que exista el problema. Lo unico irrecuperable. */
export function anticipadas(): EvidenciaDef[] {
  return EVIDENCIAS.filter(e => e.anticipada);
}

/**
 * Arma la captura validando lo que no se puede arreglar despues.
 *
 * Las claves opcionales se asignan SOLO si tienen valor: una clave en `undefined` hace que
 * Firestore rechace el documento entero.
 */
export function construirCaptura(entrada: {
  projectId: number;
  projectCode: string;
  evidencia: string;
  actor: string;
  at?: number;
  photoId?: string;
  nota?: string;
  solutionId?: string;
}): CapturaEvidencia {
  const def = evidenciaDef(entrada.evidencia);
  if (!def) {
    throw new EvidenciaInvalida(
      `"${entrada.evidencia}" no es una evidencia del catalogo. La lista es cerrada y la ` +
      'genera la base de conocimiento: una evidencia inventada aca no se la exige nadie.',
    );
  }
  if (!Number.isFinite(entrada.projectId) || entrada.projectId <= 0) {
    throw new EvidenciaInvalida('Falta el proyecto.');
  }
  if (!entrada.projectCode) throw new EvidenciaInvalida('Falta el codigo del proyecto.');
  const actor = (entrada.actor || '').trim();
  if (!actor) {
    throw new EvidenciaInvalida('Falta quien la captura. Una prueba sin autor no prueba de quien es.');
  }

  // Una foto que no es foto no sirve de evidencia: el proveedor pide la imagen.
  const esVisual = def.formato === 'foto' || def.formato === 'video';
  if (esVisual && !entrada.photoId) {
    throw new EvidenciaInvalida(
      `${def.id} es de tipo ${def.formato}: sin la imagen no hay evidencia. ${def.siFalta}`,
    );
  }
  if (!esVisual && !(entrada.nota || '').trim()) {
    throw new EvidenciaInvalida(
      `${def.id} necesita que se escriba qué se verificó o qué se dejó constancia.`,
    );
  }

  const captura: CapturaEvidencia = {
    projectId: entrada.projectId,
    projectCode: entrada.projectCode,
    evidencia: entrada.evidencia,
    actor,
    at: entrada.at ?? Date.now(),
  };
  if (entrada.photoId) captura.photoId = entrada.photoId;
  const nota = (entrada.nota || '').trim();
  if (nota) captura.nota = nota;
  if (entrada.solutionId) captura.solutionId = entrada.solutionId;
  return captura;
}

export interface EstadoEvidencia {
  def: EvidenciaDef;
  capturas: CapturaEvidencia[];
  /** Con al menos una captura se considera reunida. */
  reunida: boolean;
}

export function estadoDeEvidencias(
  capturas: CapturaEvidencia[],
  lista: EvidenciaDef[] = EVIDENCIAS,
): EstadoEvidencia[] {
  return lista.map(def => {
    const propias = capturas
      .filter(c => c.evidencia === def.id)
      .sort((a, b) => b.at - a.at);
    return { def, capturas: propias, reunida: propias.length > 0 };
  });
}

/** Las anticipadas que todavia no se capturaron. Es la lista que urge. */
export function pendientesAnticipadas(capturas: CapturaEvidencia[]): EvidenciaDef[] {
  return estadoDeEvidencias(capturas, anticipadas())
    .filter(e => !e.reunida)
    .map(e => e.def);
}

export interface Veredicto {
  puede: boolean;
  faltan: EvidenciaDef[];
  /** Frase lista para mostrar, o para que un agente se la diga a quien deba producirla. */
  motivo: string;
}

/**
 * Si se puede escalar una garantia al proveedor, y que falta si no.
 *
 * Devuelve la lista completa de faltantes en vez de la primera: pedirlas de a una obliga a
 * volver a sitio varias veces, y la visita al cliente se hace UNA vez.
 */
export function puedeEscalarAlProveedor(capturas: CapturaEvidencia[]): Veredicto {
  const requeridas = evidenciasDeProceso('P-10');
  const faltan = estadoDeEvidencias(capturas, requeridas)
    .filter(e => !e.reunida)
    .map(e => e.def);

  if (faltan.length === 0) {
    return {
      puede: true,
      faltan: [],
      motivo: 'Estan las ' + requeridas.length + ' evidencias que pide el proveedor. Se puede radicar.',
    };
  }
  return {
    puede: false,
    faltan,
    motivo:
      `Faltan ${faltan.length} de ${requeridas.length} evidencias que exige el proveedor. ` +
      'Reportar sin ellas no adelanta nada: no emite dictamen y el caso queda parado sin que nadie avise.',
  };
}

/** Cuantas evidencias de un proceso estan reunidas. Para pintar un avance. */
export function avanceDeProceso(
  capturas: CapturaEvidencia[],
  proceso: string,
): { reunidas: number; total: number } {
  const estados = estadoDeEvidencias(capturas, evidenciasDeProceso(proceso));
  return { reunidas: estados.filter(e => e.reunida).length, total: estados.length };
}
