/**
 * Prueba de la bitacora de puertas.  Corre con:  npm run probar:bitacora
 *
 * Lo que mas se comprueba aca es lo que no se puede arreglar despues.
 *
 * 1. Que NINGUNA clave quede valiendo `undefined`. Firestore rechaza el documento
 *    COMPLETO si una propiedad vale undefined, y ya rompio dos cosas a la vez en este
 *    repo (ver gotcha 4 del CLAUDE.md). Un evento mal armado no falla al guardarlo
 *    local: falla el dia que se intente subir, con el registro ya cargado de datos.
 *
 * 2. Que la lista de puertas sea CERRADA. El id (`P-05.3`) es el mismo que usa la
 *    cadena de gestion del negocio. Si la app acepta un id inventado, la constancia
 *    deja de coincidir con el paso que dice cubrir y no se puede auditar.
 *
 * 3. Que una correccion NO borre lo corregido. El sentido de esto es poder probar que
 *    alguien verifico algo; si enmendar pisara el historial, la bitacora serviria para
 *    lo contrario de lo que fue hecha.
 *
 * 4. Que toda puerta diga que hacer cuando NO se cumple. Una puerta que no lo dice no
 *    detiene nada: quien la encuentre va a seguir igual.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'puertas-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/puertas.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const {
  PUERTAS,
  puertaPorId,
  puertasPendientesDeConstancia,
  construirEvento,
  estadoDePuertas,
  avanceDeConstancia,
  PuertaInvalida,
} = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };
const lanza = (fn, msg) => {
  let salto = false;
  try { fn(); } catch (e) { salto = e instanceof PuertaInvalida; }
  ok(salto, msg);
};

const base = {
  projectId: 7,
  projectCode: 'PRY-0007',
  etapa: 'P-05.3',
  resultado: 'cumplida',
  actor: 'persianasyenrrollablesgirardot@gmail.com',
};

// ── 1. El catalogo ───────────────────────────────────────────────────────────
console.log('\nCatalogo de puertas');
ok(PUERTAS.length === 10, `Son las 10 puertas de la cadena (hay ${PUERTAS.length})`);
ok(new Set(PUERTAS.map(p => p.id)).size === PUERTAS.length, 'Ningun id repetido');
ok(PUERTAS.every(p => /^P-\d{2}\.\d+$/.test(p.id)), 'Todos los ids tienen la forma P-NN.N de la cadena');
ok(PUERTAS.every(p => p.condicion && p.condicion.length > 10), 'Toda puerta dice que tiene que cumplirse');
ok(
  PUERTAS.every(p => p.siFalla && p.siFalla.length > 10),
  'Toda puerta dice que hacer si NO se cumple — sin eso no detiene nada',
);
ok(PUERTAS.every(p => p.proceso && p.nombre), 'Toda puerta sabe a que proceso pertenece y como se llama');
ok(
  puertasPendientesDeConstancia().length === 6,
  `Seis son las que esta app existe para cubrir (son ${puertasPendientesDeConstancia().length})`,
);
ok(puertaPorId('P-07.3')?.nombre === 'Verificar antes de taladrar', 'Se encuentra una puerta por su id');
ok(puertaPorId('P-99.9') === undefined, 'Un id que no existe no devuelve nada');

// ── 2. Claves undefined: el error que rompe Firestore entero ─────────────────
console.log('\nNinguna clave en undefined (gotcha 4)');
const minimo = construirEvento(base);
const claves = Object.keys(minimo);
ok(
  !claves.some(k => minimo[k] === undefined),
  'Un evento minimo no trae NI UNA clave en undefined',
);
ok(!('nota' in minimo), "Sin nota, la clave 'nota' no se crea (no queda en undefined)");
ok(!('evidenceId' in minimo), "Sin foto, la clave 'evidenceId' no se crea");
ok(!('corrigeA' in minimo), "Sin correccion, la clave 'corrigeA' no se crea");
const conVacios = construirEvento({ ...base, nota: '   ', evidenceId: '' });
ok(!('nota' in conVacios), 'Una nota en blanco tampoco crea la clave');
ok(!('evidenceId' in conVacios), 'Una foto vacia tampoco crea la clave');
ok(
  JSON.parse(JSON.stringify(conVacios)).etapa === 'P-05.3',
  'El evento sobrevive un viaje por JSON sin perder nada',
);

const completo = construirEvento({ ...base, nota: 'Ingreso verificado en Nequi', evidenceId: 'foto-1', corrigeA: 3 });
ok(completo.nota === 'Ingreso verificado en Nequi', 'Con nota, la nota entra');
ok(completo.evidenceId === 'foto-1' && completo.corrigeA === 3, 'Con foto y correccion, entran las dos');

// ── 3. Lista cerrada y datos obligatorios ───────────────────────────────────
console.log('\nLo que no se acepta');
lanza(() => construirEvento({ ...base, etapa: 'P-99.9' }), 'Rechaza una etapa que no es una puerta conocida');
lanza(() => construirEvento({ ...base, etapa: 'validar abono' }), 'Rechaza texto libre como etapa');
lanza(() => construirEvento({ ...base, resultado: 'mas o menos' }), 'Rechaza un resultado fuera de los dos posibles');
lanza(() => construirEvento({ ...base, actor: '' }), 'Rechaza una constancia sin autor');
lanza(() => construirEvento({ ...base, actor: '   ' }), 'Un autor en blanco tampoco pasa');
lanza(() => construirEvento({ ...base, projectId: 0 }), 'Rechaza un evento sin proyecto');
lanza(() => construirEvento({ ...base, projectCode: '' }), 'Rechaza un evento sin codigo de proyecto');
ok(
  construirEvento({ ...base, actor: '  jhon@correo.com  ' }).actor === 'jhon@correo.com',
  'El autor se guarda sin espacios de sobra',
);

// ── 4. El estado de cada puerta, y la correccion que no borra ───────────────
console.log('\nEstado de las puertas');
const e1 = { id: 1, ...base, resultado: 'no_cumplida', at: 1000, nota: 'El comprobante no cuadra' };
const e2 = { id: 2, ...base, resultado: 'cumplida', at: 2000, nota: 'Ingreso verificado', corrigeA: 1 };
const otra = { id: 3, ...base, etapa: 'P-07.3', resultado: 'cumplida', at: 1500 };

const estados = estadoDePuertas([e1, e2, otra]);
ok(estados.length === 10, 'Devuelve las 10 puertas, tambien las que no tienen ningun evento');
const abono = estados.find(e => e.puerta.id === 'P-05.3');
ok(abono.vigente?.id === 2, 'Manda el evento que corrige, no el corregido');
ok(abono.historial.length === 2, 'Pero el corregido SIGUE en el historial: enmendar no borra');
ok(abono.historial[0].id === 2, 'El historial va del mas nuevo al mas viejo');
const taladro = estados.find(e => e.puerta.id === 'P-07.3');
ok(taladro.vigente?.id === 3, 'Cada puerta ve solo sus propios eventos');
const sinEventos = estados.find(e => e.puerta.id === 'P-08.1');
ok(sinEventos.vigente === undefined && sinEventos.historial.length === 0, 'Una puerta sin constancia se ve vacia');
ok(!('vigente' in sinEventos), "Sin evento vigente, la clave 'vigente' no se crea");

const dosSinCorregir = estadoDePuertas([
  { id: 10, ...base, at: 1000 },
  { id: 11, ...base, at: 5000 },
]).find(e => e.puerta.id === 'P-05.3');
ok(dosSinCorregir.vigente?.id === 11, 'Con dos eventos sin corregir, manda el mas reciente');

// ── 5. Avance ───────────────────────────────────────────────────────────────
console.log('\nAvance de constancia');
const vacio = avanceDeConstancia([]);
ok(vacio.cumplidas === 0 && vacio.total === 6, 'Un proyecto sin nada registrado arranca en 0 de 6');
ok(avanceDeConstancia([e1, e2, otra]).cumplidas === 2, 'Cuenta las cumplidas vigentes (abono corregido + taladro)');
ok(
  avanceDeConstancia([{ id: 20, ...base, etapa: 'P-01.4', at: 1000 }]).cumplidas === 0,
  'Una puerta que NO es de esta app no suma al avance, aunque se registre',
);
ok(
  avanceDeConstancia([{ id: 21, ...base, resultado: 'no_cumplida', at: 1000 }]).cumplidas === 0,
  'Una puerta registrada como no cumplida no cuenta como cumplida',
);

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
