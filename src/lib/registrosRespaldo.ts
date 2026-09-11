/**
 * Restaurar los registros que NO viven adentro del proyecto.
 *
 * Modulo PURO (cero imports): decide QUE se restaura y con que identidad. La escritura
 * esta en `restaurarRegistros.ts`.
 *
 * ## El problema que resuelve
 *
 * `restoreProjects` fusiona por CODIGO de proyecto y reparte ids nuevos: el `projectId`
 * que venia en el archivo no vale nada despues de restaurar. Recibos, constancias y
 * seguimiento apuntan justamente a `projectId`, asi que restaurarlos tal cual los dejaria
 * colgando de proyectos equivocados o de ninguno.
 *
 * Por eso el ancla es `projectCode`, que es la misma llave con la que se fusionan los
 * proyectos. Cada registro se vuelve a apuntar al id local que tenga hoy su codigo.
 *
 * ## Tres cosas que hay que hacer bien o es peor el remedio
 *
 * 1. **No duplicar.** Restaurar dos veces el mismo archivo no puede dejar dos copias de
 *    cada recibo: Contabilidad suma abonos y saldos, y duplicarlos le miente a Jhon sobre
 *    cuanta plata entro. Cada tabla tiene una llave natural con la que se reconoce lo que
 *    ya esta.
 *
 * 2. **Remapear `corrigeA`.** Una constancia corregida apunta al ID de la anterior. Si se
 *    restaura sin traducir ese id, la correccion apunta a cualquier cosa y la constancia
 *    vieja vuelve a figurar como vigente. Es corrupcion silenciosa: la pantalla se ve bien
 *    y dice lo contrario de lo que paso.
 *
 * 3. **No inventar duenos.** Un registro cuyo codigo de proyecto no existe localmente
 *    queda afuera y se informa. Colgarlo del proyecto equivocado seria peor que perderlo.
 */

export interface RegistrosRespaldo {
  receipts: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  gateEvents: Record<string, unknown>[];
  trackingEvents: Record<string, unknown>[];
}

export type TablaRegistro = keyof RegistrosRespaldo;

export const TABLAS: TablaRegistro[] = ['receipts', 'invoices', 'gateEvents', 'trackingEvents'];

export const VACIO: RegistrosRespaldo = { receipts: [], invoices: [], gateEvents: [], trackingEvents: [] };

function filas(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && !Array.isArray(f));
}

/**
 * Saca los registros de un respaldo ya parseado.
 *
 * Tolerante a proposito: un respaldo `version: 1` no trae ninguna de estas claves y eso
 * no es un error, es un archivo viejo. Devuelve listas vacias y sigue.
 */
export function leerRegistros(parsed: unknown): RegistrosRespaldo {
  if (!parsed || typeof parsed !== 'object') return { ...VACIO };
  const raiz = parsed as Record<string, unknown>;
  return {
    receipts: filas(raiz.receipts),
    invoices: filas(raiz.invoices),
    gateEvents: filas(raiz.gateEvents),
    trackingEvents: filas(raiz.trackingEvents),
  };
}

export function hayRegistros(r: RegistrosRespaldo): boolean {
  return TABLAS.some(t => r[t].length > 0);
}

export function sumarRegistros(a: RegistrosRespaldo, b: RegistrosRespaldo): RegistrosRespaldo {
  return {
    receipts: [...a.receipts, ...b.receipts],
    invoices: [...a.invoices, ...b.invoices],
    gateEvents: [...a.gateEvents, ...b.gateEvents],
    trackingEvents: [...a.trackingEvents, ...b.trackingEvents],
  };
}

/**
 * Llave natural de cada tabla: con que se reconoce que un registro "ya esta".
 *
 * No se usa el `id`, que cambia al restaurar. Se usa lo que identifica al hecho en si.
 * Las facturas se reconocen por su consecutivo, que es una llave de verdad; las demas,
 * por la combinacion de proyecto, momento y contenido.
 */
export function claveNatural(tabla: TablaRegistro, fila: Record<string, unknown>): string | null {
  switch (tabla) {
    case 'receipts': {
      const { projectCode, date, total, abono } = fila;
      if (!projectCode || typeof date !== 'number') return null;
      return `${projectCode}|${date}|${total ?? ''}|${abono ?? ''}`;
    }
    case 'invoices': {
      const { type, documentNumber } = fila;
      if (!type || !documentNumber) return null;
      return `${type}|${documentNumber}`;
    }
    case 'gateEvents': {
      const { projectCode, etapa, at, actor } = fila;
      if (!projectCode || !etapa || typeof at !== 'number') return null;
      return `${projectCode}|${etapa}|${at}|${actor ?? ''}`;
    }
    case 'trackingEvents': {
      const { projectCode, tipo, estado, at, actor } = fila;
      if (!projectCode || !tipo || !estado || typeof at !== 'number') return null;
      return `${projectCode}|${tipo}|${estado}|${at}|${actor ?? ''}`;
    }
  }
}

/** Las tablas que cuelgan de un proyecto y hay que volver a apuntar. */
const LIGADAS_A_PROYECTO: TablaRegistro[] = ['receipts', 'gateEvents', 'trackingEvents'];

export interface PlanTabla {
  /** Listos para insertar: sin `id`, con `projectId` ya apuntando al local. */
  aInsertar: Record<string, unknown>[];
  /** Ya estaban. No se tocan. */
  duplicados: number;
  /** Su codigo de proyecto no existe aca. Se informan, no se cuelgan de cualquiera. */
  huerfanos: number;
  /** Sin llave natural utilizable: fila incompleta o corrupta. */
  invalidos: number;
}

export type PlanRestauracion = Record<TablaRegistro, PlanTabla>;

export function planVacio(): PlanRestauracion {
  return {
    receipts: { aInsertar: [], duplicados: 0, huerfanos: 0, invalidos: 0 },
    invoices: { aInsertar: [], duplicados: 0, huerfanos: 0, invalidos: 0 },
    gateEvents: { aInsertar: [], duplicados: 0, huerfanos: 0, invalidos: 0 },
    trackingEvents: { aInsertar: [], duplicados: 0, huerfanos: 0, invalidos: 0 },
  };
}

/**
 * Decide que entra y con que identidad.
 *
 * `codigoAId` mapea codigo de proyecto -> id local de HOY, despues de restaurar los
 * proyectos. `existentes` son las llaves naturales que ya estan en cada tabla.
 *
 * Los eventos salen ordenados de mas viejo a mas nuevo: `restaurarRegistros` los inserta
 * en ese orden para poder traducir `corrigeA`, que siempre apunta hacia atras.
 */
export function planRestauracion(
  entrantes: RegistrosRespaldo,
  codigoAId: Map<string, number>,
  existentes: Record<TablaRegistro, Set<string>>,
): PlanRestauracion {
  const plan = planVacio();

  for (const tabla of TABLAS) {
    const vistas = new Set(existentes[tabla]);
    const filasTabla = [...entrantes[tabla]];

    // Los eventos se insertan de viejo a nuevo: `corrigeA` apunta siempre hacia atras,
    // asi que al llegar a la correccion ya se conoce el id nuevo de lo corregido.
    if (tabla === 'gateEvents' || tabla === 'trackingEvents') {
      filasTabla.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    }

    for (const fila of filasTabla) {
      const clave = claveNatural(tabla, fila);
      if (!clave) {
        plan[tabla].invalidos++;
        continue;
      }
      if (vistas.has(clave)) {
        plan[tabla].duplicados++;
        continue;
      }

      const copia: Record<string, unknown> = { ...fila };
      // El id viejo se conserva aparte SOLO para traducir `corrigeA`; nunca se guarda.
      const idViejo = copia.id;
      delete copia.id;

      if (LIGADAS_A_PROYECTO.includes(tabla)) {
        const codigo = String(fila.projectCode ?? '');
        const local = codigoAId.get(codigo);
        if (local === undefined) {
          plan[tabla].huerfanos++;
          continue;
        }
        copia.projectId = local;
      }

      if (typeof idViejo === 'number') copia.__idViejo = idViejo;
      // Nunca una clave en `undefined`: Firestore rechaza el documento entero (gotcha 4).
      for (const k of Object.keys(copia)) {
        if (copia[k] === undefined) delete copia[k];
      }

      plan[tabla].aInsertar.push(copia);
      vistas.add(clave);
    }
  }

  return plan;
}

/**
 * Proximo consecutivo, calculado sobre el MAXIMO y no sobre el ultimo insertado.
 *
 * Importa por esto: restaurar un respaldo mete facturas viejas con ids nuevos, asi que la
 * ultima por id pasa a ser la mas vieja por numero. Tomar esa y sumarle uno devolveria un
 * consecutivo que YA existe, y dos facturas con el mismo numero es un problema de verdad.
 * Mirando el maximo, el orden de insercion deja de importar.
 */
export function siguienteConsecutivo(
  documentos: { type: string; documentNumber?: string }[],
  type: 'COTIZACION' | 'FACTURA',
): string {
  const prefijo = type === 'COTIZACION' ? 'COT-' : 'FAC-';
  let maximo = 0;
  for (const doc of documentos) {
    if (doc.type !== type || !doc.documentNumber) continue;
    const n = parseInt(String(doc.documentNumber).replace(prefijo, ''), 10);
    if (Number.isFinite(n) && n > maximo) maximo = n;
  }
  return `${prefijo}${String(maximo + 1).padStart(4, '0')}`;
}

export interface ResumenRestauracion {
  insertados: number;
  duplicados: number;
  huerfanos: number;
  invalidos: number;
}

export function resumir(plan: PlanRestauracion): ResumenRestauracion {
  let insertados = 0, duplicados = 0, huerfanos = 0, invalidos = 0;
  for (const tabla of TABLAS) {
    insertados += plan[tabla].aInsertar.length;
    duplicados += plan[tabla].duplicados;
    huerfanos += plan[tabla].huerfanos;
    invalidos += plan[tabla].invalidos;
  }
  return { insertados, duplicados, huerfanos, invalidos };
}
