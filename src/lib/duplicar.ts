import type { SpaceRecord, TechnicalSolution, WindowRecord } from '../types';
import { uid } from './ids';

/**
 * DUPLICAR ESPACIOS Y VENTANAS
 *
 * Jhon mide seguido habitaciones IGUALES: misma medida y mismo producto.
 * Volver a cargarlas a mano es justo donde se cuela un numero mal tecleado, y
 * un numero mal tecleado es una persiana mal fabricada.
 *
 * Dos reglas que NO se pueden relajar:
 *
 * 1. TODO id se vuelve a generar. El id de una persiana es la llave con la que
 *    el proveedor marca "gestionado" (`supplier_statuses` guarda
 *    `solutionId -> true` en UN documento por pedido). Dos persianas con el
 *    mismo id adentro del mismo proyecto = el proveedor marca una y se le
 *    tildan las dos, y fabrica una sola. Lo mismo con divisiones, accesorios y
 *    tareas de mantenimiento, que se editan buscandolos por id.
 *
 * 2. La copia NO se lleva las fotos. Todo lo tecnico si (medidas, tela, color,
 *    montaje, divisiones, accesorios, motor, observaciones); las fotos no,
 *    porque son de ESA ventana. Una foto del cuarto 1 colgada del cuarto 2 es
 *    evidencia falsa el dia que haya que revisar por que salio mal.
 */

/** Tope por tanda. Mas que esto es casi seguro un dedo pegado en el teclado. */
export const MAX_COPIAS = 20;

export function copiarSolucion(sol: TechnicalSolution): TechnicalSolution {
  const copia: TechnicalSolution = {
    ...sol,
    id: uid('solution'),
    assembly: { ...(sol.assembly || {}) },
    divisions: (sol.divisions || []).map(div => ({ ...div, id: uid('part') })),
    accessories: (sol.accessories || []).map(acc => ({ ...acc, id: uid('accessory') })),
    alerts: (sol.alerts || []).map(alert => ({ ...alert, id: uid('alert') })),
  };
  // Asignacion condicional a proposito: crear una clave con `undefined` que
  // antes no existia hace que Firestore rechace el documento ENTERO (gotcha 4
  // del CLAUDE.md).
  if (sol.quickQuote) copia.quickQuote = { ...sol.quickQuote };
  if (sol.motor) copia.motor = { ...sol.motor };
  if (sol.planTemplate) copia.planTemplate = { ...sol.planTemplate };
  if (sol.maintenance) {
    copia.maintenance = {
      tasks: (sol.maintenance.tasks || []).map(task => ({ ...task, id: uid('task') })),
    };
  }
  return copia;
}

export function copiarVentana(win: WindowRecord, label: string): WindowRecord {
  const copia: WindowRecord = {
    ...win,
    id: uid('window'),
    label,
    geometry: { ...(win.geometry || {}) },
    siteConditions: (win.siteConditions || []).map(cond => ({ ...cond, id: uid('condition') })),
    evidence: [], // regla 2: las fotos no viajan
    solutions: (win.solutions || []).map(copiarSolucion),
  };
  if (win.customFields) copia.customFields = { ...win.customFields };
  if (win.planTemplate) copia.planTemplate = { ...win.planTemplate };
  return copia;
}

export function copiarEspacio(space: SpaceRecord, name: string): SpaceRecord {
  return {
    ...space,
    id: uid('space'),
    name,
    // Las ventanas de adentro conservan su nombre: estan en OTRO espacio, no
    // chocan con nada.
    windows: (space.windows || []).map(win => copiarVentana(win, win.label)),
  };
}

/**
 * Nombres para las copias, sin pisar ninguno de los que ya hay.
 *
 * Si el nombre termina en numero se sigue la cuenta ("Habitacion 1" -> 2, 3…),
 * que es como Jhon los nombra de verdad. Si no, se agrega "(copia)". En los
 * dos casos se saltean los nombres ya usados: duplicar "Habitacion 1" cuando
 * ya existe la 2 da "Habitacion 3", no una segunda 2.
 */
export function nombresDeCopia(original: string, existentes: string[], cantidad: number): string[] {
  const usados = new Set(existentes.map(n => (n || '').trim().toLowerCase()));
  const base = (original || '').trim();
  const conNumero = base.match(/^(.*?)(\d+)$/);
  const nombres: string[] = [];

  for (let i = 0; i < cantidad; i++) {
    let nombre: string;
    if (conNumero) {
      const prefijo = conNumero[1];
      let n = Number(conNumero[2]) + 1;
      while (usados.has(`${prefijo}${n}`.trim().toLowerCase())) n++;
      nombre = `${prefijo}${n}`;
    } else {
      const armar = (k: number) => (k === 1 ? `${base} (copia)` : `${base} (copia ${k})`);
      let k = 1;
      while (usados.has(armar(k).trim().toLowerCase())) k++;
      nombre = armar(k);
    }
    usados.add(nombre.trim().toLowerCase());
    nombres.push(nombre);
  }
  return nombres;
}

/**
 * Import dinamico, igual que en `projectStore`: asi este archivo es logica
 * pura y se puede probar en node sin levantar React (`npm run probar:duplicar`).
 */
function avisar(usar: (toast: typeof import('react-hot-toast').default) => void) {
  void import('react-hot-toast').then(({ default: toast }) => usar(toast));
}

/**
 * Pregunta cuantas copias. Devuelve `null` si cancelo o si escribio cualquier
 * cosa (en ese caso ya aviso por pantalla), asi la pantalla que llama solo
 * tiene que hacer `if (!cantidad) return`.
 */
export function pedirCantidadDeCopias(que: string): number | null {
  const texto = window.prompt(
    `¿Cuántas copias de ${que} querés hacer?\n\nSe copia todo lo técnico (medidas, persianas, telas, colores, divisiones). Las fotos no se copian.`,
    '1',
  );
  if (texto === null) return null;

  const pedido = Math.floor(Number(texto.trim().replace(',', '.')));
  if (!Number.isFinite(pedido) || pedido < 1) {
    avisar(t => t.error('Escribí un número de copias (por ejemplo: 3).'));
    return null;
  }
  if (pedido > MAX_COPIAS) {
    avisar(t => t(`Máximo ${MAX_COPIAS} copias por vez. Se hacen ${MAX_COPIAS}.`, { icon: '⚠️' }));
    return MAX_COPIAS;
  }
  return pedido;
}

/** Aviso de "listo", corto aunque sean 20 copias. */
export function avisoDeCopias(nombres: string[], duplicado: string, creados: string): string {
  if (nombres.length === 1) return `${duplicado}: ${nombres[0]}`;
  if (nombres.length <= 3) return `${nombres.length} ${creados}: ${nombres.join(', ')}`;
  return `${nombres.length} ${creados} (${nombres[0]} … ${nombres[nombres.length - 1]})`;
}
