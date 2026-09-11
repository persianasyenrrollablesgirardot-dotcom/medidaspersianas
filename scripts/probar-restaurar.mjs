/**
 * Prueba de la restauracion de registros.  Corre con:  npm run probar:restaurar
 *
 * El respaldo decia "completo" y solo guardaba proyectos. Ahora se lleva recibos,
 * facturas, constancias y seguimiento — y devolverlos es mas delicado que guardarlos,
 * porque `restoreProjects` fusiona por CODIGO y reparte ids NUEVOS. El `projectId` del
 * archivo no vale nada al volver.
 *
 * Lo que se cuida:
 *
 * 1. **No duplicar.** Restaurar dos veces el mismo archivo no puede dejar dos copias de
 *    cada recibo: Contabilidad suma abonos y saldos, y duplicarlos le miente a Jhon sobre
 *    cuanta plata entro.
 *
 * 2. **Volver a apuntar al proyecto correcto**, por codigo y no por id.
 *
 * 3. **No inventar duenos.** Un registro cuyo codigo no existe aca queda afuera y se
 *    cuenta. Colgarlo del proyecto equivocado seria peor que perderlo.
 *
 * 4. **El consecutivo se calcula sobre el MAXIMO.** Restaurar facturas viejas les da ids
 *    nuevos; tomar la ultima por id y sumarle uno devolveria un numero que ya existe.
 *
 * (El remapeo de `corrigeA` al insertar se prueba aparte, en la parte de orden: el plan
 * entrega las constancias de vieja a nueva, que es lo que hace posible traducirlo.)
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'registros-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/registrosRespaldo.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const {
  leerRegistros,
  hayRegistros,
  sumarRegistros,
  claveNatural,
  planRestauracion,
  resumir,
  siguienteConsecutivo,
  TABLAS,
} = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };

const sinNada = { receipts: new Set(), invoices: new Set(), gateEvents: new Set(), trackingEvents: new Set(), warrantyCases: new Set() };
const codigos = new Map([['PRY-0001', 41], ['PRY-0002', 77]]);

// ── 1. Leer el archivo ───────────────────────────────────────────────────────
console.log('\nLeer el respaldo');
const viejo = leerRegistros({ app: 'x', version: 1, projects: [] });
ok(TABLAS.every(t => viejo[t].length === 0), 'Un respaldo version 1 no trae registros y eso NO es un error');
ok(!hayRegistros(viejo), 'hayRegistros() lo reporta vacio');
ok(TABLAS.every(t => leerRegistros(null)[t].length === 0), 'Un archivo ilegible devuelve listas vacias, no explota');
const leido = leerRegistros({
  version: 2,
  receipts: [{ projectCode: 'PRY-0001', date: 10, total: 100, abono: 50 }, 'basura', null],
  invoices: [{ type: 'FACTURA', documentNumber: 'FAC-0007' }],
  gateEvents: [],
  trackingEvents: [{ projectCode: 'PRY-0001', tipo: 'produccion', estado: 'en_produccion', at: 5, actor: 'a' }],
});
ok(leido.receipts.length === 1, 'Las filas que no son objetos se descartan al leer');
ok(hayRegistros(leido), 'Con algo adentro, hayRegistros() da true');
const sumado = sumarRegistros(leido, leido);
ok(sumado.receipts.length === 2, 'sumarRegistros junta lo hallado en varios archivos');

// ── 2. Llaves naturales ──────────────────────────────────────────────────────
console.log('\nLlaves naturales (no el id, que cambia al restaurar)');
ok(
  claveNatural('invoices', { type: 'FACTURA', documentNumber: 'FAC-0007' }) === 'FACTURA|FAC-0007',
  'Una factura se reconoce por su consecutivo',
);
ok(
  claveNatural('receipts', { projectCode: 'PRY-0001', date: 10, total: 100, abono: 50, id: 99 }) ===
  claveNatural('receipts', { projectCode: 'PRY-0001', date: 10, total: 100, abono: 50, id: 3 }),
  'El id NO entra en la llave: el mismo recibo con otro id es el mismo recibo',
);
ok(claveNatural('receipts', { date: 10 }) === null, 'Una fila sin proyecto no tiene llave utilizable');
ok(claveNatural('gateEvents', { projectCode: 'A', etapa: 'P-05.3', at: 1 }) === 'A|P-05.3|1|', 'Constancia sin actor igual tiene llave');

// ── 3. Volver a apuntar por codigo ───────────────────────────────────────────
console.log('\nVolver a apuntar al proyecto por CODIGO');
const entrantes = {
  receipts: [{ id: 900, projectId: 5, projectCode: 'PRY-0001', date: 10, total: 100, abono: 50 }],
  invoices: [{ id: 800, type: 'FACTURA', documentNumber: 'FAC-0007' }],
  gateEvents: [{ id: 700, projectId: 5, projectCode: 'PRY-0002', etapa: 'P-05.3', at: 20, actor: 'a' }],
  trackingEvents: [{ id: 600, projectId: 5, projectCode: 'PRY-0001', tipo: 'produccion', estado: 'en_produccion', at: 30, actor: 'a' }],
  warrantyCases: [{ id: 500, projectId: 5, projectCode: 'PRY-0002', abiertoEl: 40, descripcion: 'No sube', actor: 'a', pieza: 'tela' }],
};
const plan = planRestauracion(entrantes, codigos, sinNada);
ok(plan.receipts.aInsertar[0].projectId === 41, 'El recibo queda apuntando al id local de su codigo, no al viejo');
ok(plan.gateEvents.aInsertar[0].projectId === 77, 'La constancia tambien, y a OTRO proyecto distinto');
ok(plan.receipts.aInsertar[0].id === undefined, 'El id viejo no se guarda');
ok(plan.gateEvents.aInsertar[0].__idViejo === 700, 'Pero se conserva aparte, para poder traducir corrigeA');
ok(plan.invoices.aInsertar[0].projectId === undefined, 'Una factura no cuelga de un proyecto: no se le inventa uno');
ok(resumir(plan).insertados === 5, 'Entran los cinco registros');
ok(plan.warrantyCases.aInsertar[0].projectId === 77, 'Un caso de garantia tambien se vuelve a apuntar por codigo');

// ── 4. No duplicar ───────────────────────────────────────────────────────────
console.log('\nRestaurar dos veces no duplica');
const yaEstan = {
  receipts: new Set([claveNatural('receipts', entrantes.receipts[0])]),
  invoices: new Set([claveNatural('invoices', entrantes.invoices[0])]),
  gateEvents: new Set([claveNatural('gateEvents', entrantes.gateEvents[0])]),
  trackingEvents: new Set([claveNatural('trackingEvents', entrantes.trackingEvents[0])]),
  warrantyCases: new Set([claveNatural('warrantyCases', entrantes.warrantyCases[0])]),
};
const segundaVez = planRestauracion(entrantes, codigos, yaEstan);
ok(resumir(segundaVez).insertados === 0, 'La segunda pasada no inserta NADA');
ok(resumir(segundaVez).duplicados === 5, 'Y cuenta los cinco como duplicados');

const repetidoEnElArchivo = planRestauracion(
  { ...entrantes, receipts: [entrantes.receipts[0], { ...entrantes.receipts[0], id: 901 }] },
  codigos,
  sinNada,
);
ok(
  repetidoEnElArchivo.receipts.aInsertar.length === 1 && repetidoEnElArchivo.receipts.duplicados === 1,
  'Un recibo repetido DENTRO del mismo archivo tampoco entra dos veces',
);

// ── 5. Huerfanos e invalidos ─────────────────────────────────────────────────
console.log('\nLo que no tiene dueno');
const huerfano = planRestauracion(
  { receipts: [{ projectCode: 'PRY-9999', date: 1, total: 1, abono: 1 }], invoices: [], gateEvents: [], trackingEvents: [], warrantyCases: [] },
  codigos,
  sinNada,
);
ok(huerfano.receipts.aInsertar.length === 0, 'Un recibo de un proyecto que no existe aca NO se inserta');
ok(huerfano.receipts.huerfanos === 1, 'Se cuenta como huerfano, no se cuelga de cualquier proyecto');
const invalido = planRestauracion(
  { receipts: [{ total: 5 }], invoices: [], gateEvents: [], trackingEvents: [], warrantyCases: [] },
  codigos,
  sinNada,
);
ok(invalido.receipts.invalidos === 1, 'Una fila sin llave utilizable se cuenta aparte');

// ── 6. Orden de las constancias: sin eso no se puede traducir corrigeA ──────
console.log('\nOrden de insercion de las constancias');
const desordenadas = planRestauracion(
  {
    receipts: [], invoices: [], trackingEvents: [], warrantyCases: [],
    gateEvents: [
      { id: 2, projectCode: 'PRY-0001', etapa: 'P-05.3', at: 2000, actor: 'a', corrigeA: 1 },
      { id: 1, projectCode: 'PRY-0001', etapa: 'P-05.3', at: 1000, actor: 'a' },
    ],
  },
  codigos,
  sinNada,
);
ok(desordenadas.gateEvents.aInsertar[0].__idViejo === 1, 'Salen de la mas VIEJA a la mas nueva');
ok(
  desordenadas.gateEvents.aInsertar[1].corrigeA === 1,
  'La correccion conserva a quien apunta, para que el escritor lo traduzca al id nuevo',
);

// ── 7. Consecutivo sobre el maximo, no sobre el ultimo ──────────────────────
console.log('\nConsecutivo de documentos');
ok(siguienteConsecutivo([], 'FACTURA') === 'FAC-0001', 'Sin facturas, empieza en FAC-0001');
ok(siguienteConsecutivo([], 'COTIZACION') === 'COT-0001', 'Las cotizaciones llevan su propia serie');
const mezcladas = [
  { type: 'FACTURA', documentNumber: 'FAC-0012' },
  { type: 'FACTURA', documentNumber: 'FAC-0003' },   // restaurada despues: id mas alto, numero mas bajo
  { type: 'COTIZACION', documentNumber: 'COT-0099' },
];
ok(
  siguienteConsecutivo(mezcladas, 'FACTURA') === 'FAC-0013',
  'Toma el MAXIMO, no la ultima insertada — si no, devolveria FAC-0004, que ya existe',
);
ok(siguienteConsecutivo(mezcladas, 'COTIZACION') === 'COT-0100', 'No mezcla series al contar');
ok(
  siguienteConsecutivo([{ type: 'FACTURA', documentNumber: 'pendiente' }], 'FACTURA') === 'FAC-0001',
  'Un numero que no se puede leer no arrastra la serie',
);

// ── 8. Tolerancia a un respaldo al que le falta una tabla entera ────────────
console.log('\nRespaldo incompleto');
const incompleto = planRestauracion({ receipts: [], invoices: [] }, codigos, sinNada);
ok(resumir(incompleto).insertados === 0, 'Un objeto al que le faltan tablas no voltea la restauracion');
const soloCaso = planRestauracion(
  { warrantyCases: [{ projectCode: 'PRY-0001', abiertoEl: 9, descripcion: 'x' }] },
  codigos, sinNada,
);
ok(soloCaso.warrantyCases.aInsertar.length === 1, 'Y lo que si viene se procesa igual');

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
