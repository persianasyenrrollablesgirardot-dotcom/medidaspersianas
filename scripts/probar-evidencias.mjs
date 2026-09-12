/**
 * Prueba de las evidencias.  Corre con:  npm run probar:evidencias
 *
 * Lo que se cuida:
 *
 * 1. **Que el catalogo venga generado y no escrito a mano.** Si la app llevara su propia
 *    lista, las dos se separarian en la primera correccion y nadie se enteraria hasta que
 *    un reclamo se cayera por una prueba que la app no pedia. La prueba comprueba el
 *    encabezado del archivo generado y que su contenido cuadre con lo que dice la base.
 *
 * 2. **Que no se pueda escalar una garantia sin las pruebas.** Reportar sin ellas no
 *    adelanta nada: el proveedor no emite dictamen y el caso queda parado sin que nadie
 *    avise. Y faltan TODAS las que falten, no la primera: pedirlas de a una obliga a volver
 *    a sitio varias veces, y la visita al cliente se hace una sola vez.
 *
 * 3. **Que una foto exigida no se pueda dar por cumplida con una nota.** El proveedor pide
 *    la imagen; un texto que diga "ya la tome" no es la imagen.
 *
 * 4. **Que las anticipadas se sepan aparte.** Son las unicas irrecuperables.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CATALOGO = 'src/lib/evidenciasCatalogo.ts';
const tmp = path.join(os.tmpdir(), 'evidencias-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/evidencias.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const {
  EVIDENCIAS,
  evidenciaDef,
  evidenciasDeEtapa,
  evidenciasDeProceso,
  anticipadas,
  construirCaptura,
  estadoDeEvidencias,
  pendientesAnticipadas,
  puedeEscalarAlProveedor,
  avanceDeProceso,
  EvidenciaInvalida,
} = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };
const lanza = (fn, msg) => {
  let salto = false;
  try { fn(); } catch (e) { salto = e instanceof EvidenciaInvalida; }
  ok(salto, msg);
};

const base = {
  projectId: 7, projectCode: 'PRY-0007',
  actor: 'persianasyenrrollablesgirardot@gmail.com',
};
const captura = (evidencia, extra = {}) => ({ ...base, evidencia, at: 1000, ...extra });

// ── 1. El catalogo es generado, no escrito a mano ───────────────────────────
console.log('\nEl catalogo lo genera la base de conocimiento');
const fuente = fs.readFileSync(CATALOGO, 'utf8');
ok(fuente.startsWith('// GENERADO por'), 'El archivo se declara generado en su primera linea');
ok(fuente.includes('NO editar a mano'), 'Y avisa que no se edita a mano');
ok(
  fuente.includes('evidencias.yaml'),
  'Y dice cual es su fuente, para poder ir a corregirla alla',
);
ok(EVIDENCIAS.length >= 10, `Trae el catalogo completo (${EVIDENCIAS.length} evidencias)`);
ok(new Set(EVIDENCIAS.map(e => e.id)).size === EVIDENCIAS.length, 'Sin ids repetidos');
ok(
  EVIDENCIAS.every(e => /^EV-\d{2}$/.test(e.id)),
  'Todos los ids tienen la forma EV-NN de la base',
);
ok(
  EVIDENCIAS.every(e => e.bloquea && e.siFalta),
  'Toda evidencia dice que bloquea y que pasa si falta — si no, nadie la reune',
);
ok(
  EVIDENCIAS.every(e => e.etapa && e.etapaNombre && e.procesoNombre),
  'Toda evidencia sabe de que etapa y de que proceso viene',
);

// ── 2. Las anticipadas ──────────────────────────────────────────────────────
console.log('\nLas anticipadas: lo unico irrecuperable');
const antic = anticipadas();
ok(antic.length >= 5, `Hay varias anticipadas (${antic.length})`);
ok(
  antic.some(e => e.etapa.startsWith('P-06')) && antic.some(e => e.etapa.startsWith('P-07')),
  'Se capturan al recibir la caja y al instalar, que es cuando existen',
);
ok(
  pendientesAnticipadas([]).length === antic.length,
  'Un proyecto sin nada capturado las debe todas',
);
const unaCapturada = pendientesAnticipadas([captura(antic[0].id, { photoId: 'f1', nota: 'x' })]);
ok(unaCapturada.length === antic.length - 1, 'Capturar una la saca de la lista de pendientes');
ok(!unaCapturada.some(e => e.id === antic[0].id), 'Y la que sale es la que se capturo');

// ── 3. Una foto exigida no se cumple con una nota ──────────────────────────
console.log('\nUna foto es una foto');
const deFoto = EVIDENCIAS.find(e => e.formato === 'foto');
lanza(
  () => construirCaptura(captura(deFoto.id, { nota: 'ya la tome' })),
  'Rechaza dar por cumplida una evidencia de foto con solo una nota',
);
ok(
  construirCaptura(captura(deFoto.id, { photoId: 'f1' })).photoId === 'f1',
  'Con la imagen si la acepta',
);
const deTexto = EVIDENCIAS.find(e => e.formato === 'documento' || e.formato === 'dato');
lanza(
  () => construirCaptura(captura(deTexto.id, {})),
  'Y una evidencia escrita sin nada escrito tampoco pasa',
);

// ── 4. Lo que no se acepta ─────────────────────────────────────────────────
console.log('\nLo que no se acepta');
lanza(() => construirCaptura(captura('EV-99', { photoId: 'f' })), 'Rechaza una evidencia que no esta en el catalogo');
lanza(() => construirCaptura(captura('la foto esa', { photoId: 'f' })), 'Rechaza texto libre como evidencia');
lanza(() => construirCaptura({ ...captura(deFoto.id, { photoId: 'f' }), actor: '' }), 'Rechaza una captura sin autor');
lanza(() => construirCaptura({ ...captura(deFoto.id, { photoId: 'f' }), projectId: 0 }), 'Rechaza una captura sin proyecto');
const minima = construirCaptura(captura(deFoto.id, { photoId: 'f1' }));
ok(!('nota' in minima) && !('solutionId' in minima), 'No crea claves en undefined (gotcha 4)');

// ── 5. La puerta: no se escala sin las pruebas ─────────────────────────────
console.log('\nNo se escala una garantia sin las pruebas');
const requeridas = evidenciasDeProceso('P-10');
ok(requeridas.length >= 5, `Escalar exige varias evidencias (${requeridas.length})`);
const sinNada = puedeEscalarAlProveedor([]);
ok(!sinNada.puede, 'Sin nada capturado NO se puede escalar');
ok(sinNada.faltan.length === requeridas.length, 'Y faltan todas');
ok(
  sinNada.motivo.includes('queda parado'),
  'El motivo explica por que reportar sin ellas no adelanta nada',
);
const casiTodas = requeridas.slice(0, -1).map(e => captura(e.id, { photoId: 'f', nota: 'ok' }));
const casi = puedeEscalarAlProveedor(casiTodas);
ok(!casi.puede && casi.faltan.length === 1, 'Con una sola faltante sigue sin poderse');
ok(casi.faltan[0].id === requeridas[requeridas.length - 1].id, 'Y dice exactamente cual falta');
const todas = requeridas.map(e => captura(e.id, { photoId: 'f', nota: 'ok' }));
ok(puedeEscalarAlProveedor(todas).puede, 'Con todas reunidas si se puede radicar');

// ── 6. Estado y avance ─────────────────────────────────────────────────────
console.log('\nEstado y avance');
const estados = estadoDeEvidencias(todas, requeridas);
ok(estados.every(e => e.reunida), 'Todas figuran reunidas');
ok(estados[0].capturas.length === 1, 'Cada una guarda su captura');
const dosVeces = estadoDeEvidencias(
  [captura(requeridas[0].id, { photoId: 'f1', nota: 'a' }), { ...captura(requeridas[0].id, { photoId: 'f2', nota: 'b' }), at: 2000 }],
  [requeridas[0]],
);
ok(dosVeces[0].capturas.length === 2, 'Capturar de nuevo AGREGA, no reemplaza');
ok(dosVeces[0].capturas[0].at === 2000, 'Y la mas reciente va primero');
const avance = avanceDeProceso(casiTodas, 'P-10');
ok(
  avance.reunidas === requeridas.length - 1 && avance.total === requeridas.length,
  'El avance cuenta reunidas sobre el total del proceso',
);
ok(evidenciaDef('EV-01') !== undefined, 'Se busca una evidencia por su id');
ok(evidenciasDeEtapa('P-06.4').length >= 2, 'Y se piden las de una etapa concreta');

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
