/**
 * Restaurar recibos, facturas, constancias y seguimiento desde un respaldo.
 *
 * La logica esta en `registrosRespaldo.ts`, que es puro. Aca va lo que toca la base.
 *
 * Se corre DESPUES de restaurar los proyectos, nunca antes: el ancla de todo esto es el
 * codigo de proyecto, y hace falta que los proyectos ya existan localmente para saber a
 * que id apunta cada codigo hoy.
 *
 * Las constancias se insertan de una en una, en orden, en vez de con `bulkAdd`. Es mas
 * lento y es a proposito: `corrigeA` apunta al id de la constancia que enmienda, y ese id
 * cambia al restaurar. Insertando en orden se va armando la traduccion de id viejo a id
 * nuevo, y cada correccion queda apuntando a donde debe. Con `bulkAdd` no habria forma.
 */
import { db } from '../db';
import {
  TABLAS,
  claveNatural,
  planRestauracion,
  resumir,
  type PlanRestauracion,
  type RegistrosRespaldo,
  type ResumenRestauracion,
  type TablaRegistro,
} from './registrosRespaldo';

export type { RegistrosRespaldo, ResumenRestauracion } from './registrosRespaldo';
export {
  leerRegistros,
  hayRegistros,
  sumarRegistros,
  VACIO,
  siguienteConsecutivo,
} from './registrosRespaldo';

async function filasDe(tabla: TablaRegistro): Promise<Record<string, unknown>[]> {
  switch (tabla) {
    case 'receipts': return db.receipts.toArray() as unknown as Promise<Record<string, unknown>[]>;
    case 'invoices': return db.invoices.toArray() as unknown as Promise<Record<string, unknown>[]>;
    case 'gateEvents': return db.projectEvents.toArray() as unknown as Promise<Record<string, unknown>[]>;
    case 'trackingEvents': return db.trackingEvents.toArray() as unknown as Promise<Record<string, unknown>[]>;
    case 'warrantyCases': return db.warrantyCases.toArray() as unknown as Promise<Record<string, unknown>[]>;
  }
}

/** Llaves naturales de lo que YA esta en cada tabla, para no duplicar. */
async function existentes(): Promise<Record<TablaRegistro, Set<string>>> {
  const pares = await Promise.all(
    TABLAS.map(async tabla => {
      const claves = new Set<string>();
      for (const fila of await filasDe(tabla)) {
        const k = claveNatural(tabla, fila);
        if (k) claves.add(k);
      }
      return [tabla, claves] as const;
    }),
  );
  return Object.fromEntries(pares) as Record<TablaRegistro, Set<string>>;
}

/** Codigo de proyecto -> id local de hoy. Se lee despues de restaurar los proyectos. */
async function mapaDeCodigos(): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  for (const p of await db.projects.toArray()) {
    if (p.code && p.id !== undefined) mapa.set(p.code, p.id);
  }
  return mapa;
}

export async function planearRestauracion(entrantes: RegistrosRespaldo): Promise<PlanRestauracion> {
  const [codigoAId, yaEstan] = await Promise.all([mapaDeCodigos(), existentes()]);
  return planRestauracion(entrantes, codigoAId, yaEstan);
}

/**
 * Inserta lo que el plan decidio. Devuelve el resumen para mostrarlo en pantalla.
 *
 * No borra ni pisa nada: solo agrega lo que falta. Restaurar dos veces el mismo archivo
 * deja todo igual, con los duplicados contados.
 */
export async function restaurarRegistros(entrantes: RegistrosRespaldo): Promise<ResumenRestauracion> {
  const plan = await planearRestauracion(entrantes);

  if (plan.receipts.aInsertar.length) {
    await db.receipts.bulkAdd(plan.receipts.aInsertar.map(limpiar) as never[]);
  }
  if (plan.invoices.aInsertar.length) {
    await db.invoices.bulkAdd(plan.invoices.aInsertar.map(limpiar) as never[]);
  }
  if (plan.trackingEvents.aInsertar.length) {
    await db.trackingEvents.bulkAdd(plan.trackingEvents.aInsertar.map(limpiar) as never[]);
  }
  if (plan.warrantyCases.aInsertar.length) {
    await db.warrantyCases.bulkAdd(plan.warrantyCases.aInsertar.map(limpiar) as never[]);
  }

  // Las constancias, una por una y en orden: hay que traducir `corrigeA`.
  const traduccion = new Map<number, number>();
  for (const fila of plan.gateEvents.aInsertar) {
    const idViejo = fila.__idViejo as number | undefined;
    const evento = limpiar(fila);
    const apuntaA = evento.corrigeA as number | undefined;
    if (apuntaA !== undefined) {
      const nuevo = traduccion.get(apuntaA);
      // Si la constancia que enmendaba no vino en el archivo, se quita el puntero en vez
      // de dejarlo apuntando a un id ajeno: mejor una constancia suelta que una que dice
      // corregir algo que no es.
      if (nuevo !== undefined) evento.corrigeA = nuevo;
      else delete evento.corrigeA;
    }
    const nuevoId = await db.projectEvents.add(evento as never);
    if (idViejo !== undefined) traduccion.set(idViejo, nuevoId as number);
  }

  return resumir(plan);
}

/** Saca el campo de trabajo que nunca debe quedar guardado. */
function limpiar(fila: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...fila };
  delete copia.__idViejo;
  return copia;
}
