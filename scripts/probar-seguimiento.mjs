/**
 * Prueba del seguimiento del pedido.  Corre con:  npm run probar:seguimiento
 *
 * Lo que se cuida aca:
 *
 * 1. Que las dos listas sean CERRADAS y coincidan con el vocabulario del negocio. Un
 *    estado inventado en pantalla termina siendo un estado inventado al telefono, y ahi
 *    ya no hay dos personas diciendo lo mismo.
 *
 * 2. Que NINGUNA clave quede en `undefined` (gotcha 4: Firestore rechaza el documento
 *    entero). El error no se nota al guardar local; aparece el dia que se intente subir.
 *
 * 3. Que `at` (cuando se registro) y `fechaVisita` (para cuando esta la visita) NO se
 *    mezclen. Confundirlos hace que una visita programada para el viernes parezca hecha
 *    hoy, que es la clase de error que se descubre cuando el cliente llama.
 *
 * 4. Que `retenido` no cuente como avance ni como retroceso, y que no borre el avance que
 *    ya habia. Un pedido frenado en produccion no vuelve a cero: sigue en produccion,
 *    frenado.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'seguimiento-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/seguimiento.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const {
  ESTADOS_PRODUCCION,
  ESTADOS_VISITA,
  estadosDe,
  estadoDef,
  construirSeguimiento,
  historialDe,
  estadoActual,
  esRetroceso,
  avanceProduccion,
  SeguimientoInvalido,
} = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };
const lanza = (fn, msg) => {
  let salto = false;
  try { fn(); } catch (e) { salto = e instanceof SeguimientoInvalido; }
  ok(salto, msg);
};

const base = {
  projectId: 12,
  projectCode: 'PRY-0012',
  tipo: 'produccion',
  estado: 'en_produccion',
  actor: 'persianasyenrrollablesgirardot@gmail.com',
};

// ── 1. Los vocabularios ──────────────────────────────────────────────────────
console.log('\nVocabularios cerrados');
const produccionEsperada = [
  'pendiente_abono', 'pedido_proveedor', 'en_produccion',
  'listo_instalar', 'retenido', 'entregado', 'instalado',
];
const visitaEsperada = ['programada', 'completa', 'parcial', 'fallida', 'reagendada'];
ok(
  JSON.stringify(ESTADOS_PRODUCCION.map(e => e.id)) === JSON.stringify(produccionEsperada),
  'Los 7 estados de produccion son exactamente los del vocabulario del negocio',
);
ok(
  JSON.stringify(ESTADOS_VISITA.map(e => e.id)) === JSON.stringify(visitaEsperada),
  'Los 5 estados de visita son exactamente los del vocabulario del negocio',
);
ok(
  [...ESTADOS_PRODUCCION, ...ESTADOS_VISITA].every(e => e.etiqueta && e.descripcion),
  'Todo estado dice como se llama y que significa — sin eso dos personas lo usan distinto',
);
ok(estadoDef('produccion', 'retenido').orden === null, 'Retenido esta fuera de secuencia a proposito');
ok(estadosDe('visita').length === 5, 'estadosDe() devuelve la lista del tipo pedido');
ok(estadoDef('produccion', 'programada') === undefined, 'Un estado de visita NO es valido en produccion');
ok(estadoDef('visita', 'en_produccion') === undefined, 'Y al reves tampoco');

// ── 2. Claves undefined ──────────────────────────────────────────────────────
console.log('\nNinguna clave en undefined (gotcha 4)');
const minimo = construirSeguimiento(base);
ok(!Object.keys(minimo).some(k => minimo[k] === undefined), 'Un evento minimo no trae claves en undefined');
ok(!('nota' in minimo), "Sin nota, la clave 'nota' no se crea");
ok(!('fechaVisita' in minimo), "Sin fecha de visita, la clave no se crea");
ok(!('nota' in construirSeguimiento({ ...base, nota: '  ' })), 'Una nota en blanco tampoco crea la clave');
ok(
  JSON.parse(JSON.stringify(construirSeguimiento({ ...base, nota: 'Tela demorada' }))).nota === 'Tela demorada',
  'El evento sobrevive un viaje por JSON',
);

// ── 3. Lo que no se acepta ───────────────────────────────────────────────────
console.log('\nLo que no se acepta');
lanza(() => construirSeguimiento({ ...base, estado: 'casi_listo' }), 'Rechaza un estado inventado');
lanza(() => construirSeguimiento({ ...base, estado: 'programada' }), 'Rechaza un estado de visita en produccion');
lanza(() => construirSeguimiento({ ...base, tipo: 'otra_cosa' }), 'Rechaza un tipo desconocido');
lanza(() => construirSeguimiento({ ...base, actor: '' }), 'Rechaza un registro sin autor');
lanza(() => construirSeguimiento({ ...base, projectId: 0 }), 'Rechaza un registro sin proyecto');
lanza(
  () => construirSeguimiento({ ...base, fechaVisita: Date.now() }),
  'Rechaza una fecha de visita colgada de un estado de produccion',
);

// ── 4. `at` y `fechaVisita` son cosas distintas ─────────────────────────────
console.log('\nCuando se registro vs. para cuando es');
const viernes = Date.UTC(2026, 8, 18, 14, 0);
const visita = construirSeguimiento({
  projectId: 12, projectCode: 'PRY-0012', tipo: 'visita', estado: 'programada',
  actor: 'jhon@correo.com', at: 1000, fechaVisita: viernes,
});
ok(visita.at === 1000, 'at guarda cuando se registro');
ok(visita.fechaVisita === viernes, 'fechaVisita guarda para cuando es, aunque sea futuro');
ok(visita.at !== visita.fechaVisita, 'Son campos distintos: una visita programada no es una visita hecha');

// ── 5. Historial y estado vigente ───────────────────────────────────────────
console.log('\nHistorial y estado vigente');
const eventos = [
  { id: 1, ...base, estado: 'pendiente_abono', at: 1000 },
  { id: 2, ...base, estado: 'pedido_proveedor', at: 2000 },
  { id: 3, ...base, estado: 'en_produccion', at: 3000 },
  { id: 4, projectId: 12, projectCode: 'PRY-0012', tipo: 'visita', estado: 'programada', actor: 'x', at: 2500 },
];
ok(estadoActual(eventos, 'produccion').estado === 'en_produccion', 'El vigente de produccion es el ultimo');
ok(estadoActual(eventos, 'visita').estado === 'programada', 'La visita tiene su propio vigente');
ok(historialDe(eventos, 'produccion').length === 3, 'El historial de produccion ignora las visitas');
ok(historialDe(eventos, 'produccion')[0].id === 3, 'Va del mas nuevo al mas viejo');
ok(estadoActual([], 'produccion') === undefined, 'Un proyecto sin nada registrado no tiene estado');
const empate = estadoActual([{ id: 8, ...base, at: 500 }, { id: 9, ...base, estado: 'instalado', at: 500 }], 'produccion');
ok(empate.id === 9, 'Con la misma marca de tiempo, desempata el id mas alto');

// ── 6. Retroceso: se avisa, no se impide ────────────────────────────────────
console.log('\nRetroceso');
ok(esRetroceso('produccion', 'instalado', 'en_produccion'), 'Volver de instalado a produccion es retroceso');
ok(!esRetroceso('produccion', 'pedido_proveedor', 'en_produccion'), 'Avanzar no lo es');
ok(!esRetroceso('produccion', undefined, 'en_produccion'), 'El primer estado nunca es retroceso');
ok(!esRetroceso('produccion', 'en_produccion', 'retenido'), 'Retener no es retroceder: es una pausa');
ok(!esRetroceso('produccion', 'retenido', 'en_produccion'), 'Y salir de retenido tampoco');

// ── 7. Avance ───────────────────────────────────────────────────────────────
console.log('\nAvance de produccion');
ok(avanceProduccion([]).paso === 0, 'Sin eventos, el avance es 0');
ok(avanceProduccion([]).total === 6, 'El total son los 6 estados en secuencia (retenido no cuenta)');
ok(avanceProduccion(eventos).paso === 3, 'En produccion es el paso 3');
ok(!avanceProduccion(eventos).retenido, 'Y no esta retenido');
const frenado = [...eventos, { id: 5, ...base, estado: 'retenido', at: 4000 }];
ok(avanceProduccion(frenado).retenido, 'Retenido se marca aparte');
ok(
  avanceProduccion(frenado).paso === 3,
  'Un pedido retenido NO vuelve a cero: sigue en el ultimo avance real que tuvo',
);

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
