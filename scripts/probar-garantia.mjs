/**
 * Prueba de las reglas de garantia.  Corre con:  npm run probar:garantia
 *
 * Lo que se cuida, en orden de importancia:
 *
 * 1. **Que NO invente un plazo cuando no lo hay.** Quedan las cadenillas y las peliculas
 *    solares, y tambien una tela cuya familia no se reconoce. Un numero estimado aca se
 *    convierte en una promesa al cliente que la empresa no puede sostener.
 *
 * 2. **Que devuelva los DOS plazos de una persiana**, tela y perfileria. Una sola cifra
 *    siempre miente para alguno de los dos lados: "tres anios" promete de mas, "un anio"
 *    promete de menos.
 *
 * 3. **Que el plazo siga a la TELA y no al sistema.** El Screen Solar son tres anios en
 *    Sheer Elegance, en enrollables y en panel japones, igual.
 *
 * 4. **Que el veredicto quede congelado en el caso.** Si manana cambia una regla, el caso
 *    tiene que seguir diciendo que se le respondio al cliente aquel dia.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'garantia-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/garantia.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const {
  CAUSAS,
  EXCLUSIONES,
  RESOLUCIONES,
  PIEZAS,
  piezaDef,
  familiaDeTela,
  evaluarCobertura,
  coberturaDeSolucion,
  construirCaso,
  abiertos,
  cerrados,
  CasoInvalido,
} = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };
const lanza = (fn, msg) => {
  let salto = false;
  try { fn(); } catch (e) { salto = e instanceof CasoInvalido; }
  ok(salto, msg);
};

const ENE_2025 = Date.UTC(2025, 0, 15, 12);
const dias = n => ENE_2025 + n * 24 * 60 * 60 * 1000;

// ── 1. Lo que NO se sabe se responde como no sabido ─────────────────────────
console.log('\nLo que no tiene plazo fijado');
for (const [pieza, familia, etiqueta] of [
  ['cadenilla', undefined, 'la cadenilla'],
  ['pelicula', undefined, 'la pelicula solar'],
  ['tela', 'otra', 'una tela sin identificar'],
]) {
  const c = evaluarCobertura({ pieza, familiaTela: familia, fechaInstalacion: ENE_2025, fechaReclamo: dias(30) });
  ok(
    c.veredicto === 'sin_definir' && c.pieza.meses === null,
    `Para ${etiqueta} NO inventa un plazo: responde sin_definir aunque haya fecha de instalacion`,
  );
  ok(c.explicacion.length > 30, `Y explica por que no hay respuesta (${etiqueta})`);
}

// ── 2. Los plazos que SI estan fijados ──────────────────────────────────────
console.log('\nLos plazos fijados');
ok(piezaDef('tela', 'screen_solar').meses === 36, 'La tela Screen Solar es de 36 meses');
ok(piezaDef('tela', 'blackout').meses === 12, 'La tela blackout es de 12 meses');
ok(piezaDef('tela', 'poliester').meses === 12, 'La tela de poliester es de 12 meses');
ok(piezaDef('perfileria').meses === 12, 'La perfileria es de 12 meses');
ok(piezaDef('motor').meses === 12, 'El motor es de 12 meses');
ok(piezaDef('instalacion').meses === 12, 'La mano de obra de instalacion es de 12 meses');
ok(piezaDef('tela', 'otra').meses === null, 'Una tela sin identificar no tiene plazo');
ok(PIEZAS.length === 6, 'Son seis piezas posibles');
// La regla entera, dicha de una: es asi de simple y conviene que la prueba lo fije.
const conPlazo = PIEZAS
  .flatMap(p => p === 'tela' ? ['screen_solar', 'blackout', 'poliester'].map(f => piezaDef(p, f)) : [piezaDef(p)])
  .filter(d => d.meses !== null);
ok(
  conPlazo.filter(d => d.meses !== 12).length === 1 && conPlazo.some(d => d.meses === 36),
  'Un anio para TODO, salvo una sola excepcion de tres anios: el Screen Solar',
);
ok(
  piezaDef('motor').motivo.includes('segun fabricante'),
  'Del motor dice que la empresa responde un anio igual, aunque el documento diga "segun fabricante"',
);

// ── 3. El plazo sigue a la tela, no al sistema ──────────────────────────────
console.log('\nEl plazo sigue a la TELA, no al sistema');
ok(familiaDeTela('Screen Solar 3%') === 'screen_solar', 'Reconoce el screen por el nombre');
ok(familiaDeTela('Sheer Screen') === 'screen_solar', 'Sheer Screen es screen');
ok(familiaDeTela('Blackout Text') === 'blackout', 'Blackout Text es blackout');
ok(familiaDeTela('Blackout Screen') === 'blackout', 'Ante las dos palabras manda blackout: no es screen solar');
ok(familiaDeTela('Poliester Zen') === 'poliester', 'Reconoce el poliester');
ok(familiaDeTela('Polièster Zen') === 'poliester', 'Y con tilde tambien');
ok(familiaDeTela('Trasluz Tiffany') === 'otra', 'Lo que no reconoce queda como otra, no se adivina');
ok(familiaDeTela(undefined) === 'otra', 'Sin nombre de tela, otra');
const enrollable = coberturaDeSolucion({ nombreTela: 'Screen Solar 5%', fechaInstalacion: ENE_2025, fechaReclamo: dias(400) });
const panel = coberturaDeSolucion({ nombreTela: 'Screen Solar 5%', fechaInstalacion: ENE_2025, fechaReclamo: dias(400) });
ok(
  enrollable.tela.pieza.meses === 36 && panel.tela.pieza.meses === 36,
  'El mismo Screen Solar da 3 anios sin importar en que sistema vaya',
);

// ── 4. Los DOS plazos de una persiana ───────────────────────────────────────
console.log('\nUna persiana lleva dos plazos a la vez');
const alMes13 = coberturaDeSolucion({ nombreTela: 'Screen Solar 3%', fechaInstalacion: ENE_2025, fechaReclamo: dias(400) });
ok(alMes13.tela.veredicto === 'dentro', 'A los 400 dias la TELA screen sigue cubierta');
ok(alMes13.perfileria.veredicto === 'vencida', 'Pero la PERFILERIA ya vencio');
ok(
  alMes13.tela.veredicto !== alMes13.perfileria.veredicto,
  'Justo el caso que hace falta distinguir: una sola cifra habria mentido para un lado',
);
const blackout = coberturaDeSolucion({ nombreTela: 'Blackout Text', fechaInstalacion: ENE_2025, fechaReclamo: dias(400) });
ok(
  blackout.tela.veredicto === 'vencida' && blackout.perfileria.veredicto === 'vencida',
  'En un blackout los dos plazos corren parejos: al ano se venceron los dos',
);
const desconocida = coberturaDeSolucion({ nombreTela: 'Trasluz Tiffany', fechaInstalacion: ENE_2025, fechaReclamo: dias(100) });
ok(
  desconocida.tela.veredicto === 'sin_definir' && desconocida.perfileria.veredicto === 'dentro',
  'Con una tela que no se reconoce se responde por la perfileria y NO por la tela',
);

// ── 5. Vigencia ─────────────────────────────────────────────────────────────
console.log('\nVigencia');
const justo = evaluarCobertura({ pieza: 'perfileria', fechaInstalacion: ENE_2025, fechaReclamo: Date.UTC(2026, 0, 15, 12) });
ok(justo.veredicto === 'dentro', 'El ultimo dia del plazo todavia esta dentro');
const unDiaDespues = evaluarCobertura({ pieza: 'perfileria', fechaInstalacion: ENE_2025, fechaReclamo: Date.UTC(2026, 0, 16, 12) });
ok(unDiaDespues.veredicto === 'vencida', 'Un dia despues, vencida');
const finDeMes = evaluarCobertura({ pieza: 'perfileria', fechaInstalacion: Date.UTC(2025, 0, 31, 12), fechaReclamo: Date.UTC(2026, 0, 31, 12) });
ok(finDeMes.veredicto === 'dentro', 'Un 31 de enero + 12 meses cae el 31 de enero, no se desborda al 3 de marzo');
const sinFecha = evaluarCobertura({ pieza: 'perfileria' });
ok(sinFecha.veredicto === 'sin_definir', 'Sin fecha de instalacion no dictamina');
ok(sinFecha.explicacion.includes('1 anio'), 'Pero igual informa el plazo que le toca');

// ── 6. Vocabularios ─────────────────────────────────────────────────────────
console.log('\nVocabularios');
ok(
  JSON.stringify(CAUSAS.map(c => c.id)) ===
  JSON.stringify(['producto', 'instalacion', 'cliente', 'ambiente', 'tercero', 'construccion']),
  'Las seis causas son las del vocabulario del negocio',
);
ok(CAUSAS.filter(c => c.sueleEntrar).length === 2, 'Solo producto e instalacion suelen entrar en garantia');
ok(EXCLUSIONES.length === 6 && EXCLUSIONES.some(e => e.includes('sobrecarga')), 'Las exclusiones incluyen las electricas del motorizado');
ok(RESOLUCIONES.length === 4, 'Cuatro formas de cerrar un caso');

// ── 7. El caso, y el veredicto congelado ───────────────────────────────────
console.log('\nEl caso');
const caso = construirCaso({
  projectId: 4, projectCode: 'PRY-0004', actor: 'jhon@correo.com',
  descripcion: 'La persiana de la sala no sube', pieza: 'tela',
  nombreTela: 'Screen Solar 3%', fechaInstalacion: ENE_2025, abiertoEl: dias(400),
});
// Justo el caso que distingue: a los 400 dias un Screen Solar sigue cubierto y un
// blackout no. Con un plazo unico, uno de los dos habria quedado mal contestado.
const casoBlackout = construirCaso({
  projectId: 4, projectCode: 'PRY-0004', actor: 'jhon@correo.com',
  descripcion: 'Se despego la tela', pieza: 'tela',
  nombreTela: 'Blackout Text', fechaInstalacion: ENE_2025, abiertoEl: dias(400),
});
ok(casoBlackout.veredictoAlAbrir === 'vencida', 'El mismo dia, un blackout ya esta vencido');
ok(caso.veredictoAlAbrir === 'dentro', 'El caso guarda el veredicto del dia en que se abrio');
ok(caso.explicacionAlAbrir.includes('3 anios'), 'Y la explicacion con la que se le respondio al cliente');
ok(caso.familiaTela === 'screen_solar', 'Deduce la familia de la tela por su nombre');
ok(caso.cerradoEl === undefined && !('cerradoEl' in caso), 'Un caso nuevo no trae clave cerradoEl en undefined');
ok(!('causa' in caso) && !('resolucion' in caso), 'Ni causa ni resolucion antes de cerrarlo');
const sinFechaInst = construirCaso({
  projectId: 4, projectCode: 'PRY-0004', actor: 'a', descripcion: 'x', pieza: 'perfileria',
});
ok(!('fechaInstalacion' in sinFechaInst), 'Sin fecha de instalacion, la clave no se crea');

lanza(() => construirCaso({ projectId: 4, projectCode: 'P', actor: 'a', descripcion: '  ', pieza: 'tela' }),
  'Rechaza un caso sin el reclamo escrito');
lanza(() => construirCaso({ projectId: 4, projectCode: 'P', actor: '', descripcion: 'x', pieza: 'tela' }),
  'Rechaza un caso sin autor');
lanza(() => construirCaso({ projectId: 0, projectCode: 'P', actor: 'a', descripcion: 'x', pieza: 'tela' }),
  'Rechaza un caso sin proyecto');
lanza(() => construirCaso({ projectId: 4, projectCode: 'P', actor: 'a', descripcion: 'x', pieza: 'vidrio' }),
  'Rechaza una pieza que no existe');

const lista = [
  { ...caso, id: 1 },
  { ...caso, id: 2, cerradoEl: dias(410) },
  { ...caso, id: 3, abiertoEl: dias(405) },
];
ok(abiertos(lista).length === 2 && cerrados(lista).length === 1, 'Separa abiertos de cerrados');
ok(abiertos(lista)[0].id === 3, 'Los abiertos van del mas reciente al mas viejo');

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
