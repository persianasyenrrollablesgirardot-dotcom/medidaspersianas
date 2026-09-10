/**
 * Prueba de duplicar espacios y ventanas.  Corre con:  npm run probar:duplicar
 *
 * Duplicar parece inofensivo hasta que se mira quien usa los ids. El id de una
 * persiana es la llave con la que el proveedor marca "gestionado"
 * (`supplier_statuses`: solutionId -> true, UN documento por pedido). Si la
 * copia se queda con el id del original, el proveedor marca una y se le tildan
 * las dos: fabrica una persiana y el cliente recibe una menos. Eso no se ve en
 * pantalla ni al probar a mano — solo aparece en la obra.
 *
 * Por eso lo que se comprueba aca es, sobre todo, que NO se repita NI UN id en
 * todo el arbol copiado, y que el contenido tecnico si este completo.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'duplicar-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/duplicar.ts --bundle --format=esm --external:react-hot-toast --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const { copiarEspacio, copiarVentana, copiarSolucion, nombresDeCopia } = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };

// ── Un espacio con TODO lleno ────────────────────────────────────────────────
const solucion = {
  id: 'sol-1', itemType: 'blind', name: 'Persiana interna', layer: 'inside',
  system: 'Enrollables', fabric: 'Blackout', color: 'Beige', mount: 'Techo',
  surface: 'concrete', drive: 'motor', controlSide: 'right',
  planTemplate: { id: 'A', label: 'Plan A', imageUrl: '', layout: 'L', rollDirection: 'front', solutionCount: 1 },
  quickQuote: { width: 1.2, height: 2.1, pricePerM2: 180000, quantity: 2, estimatedTotal: 907200 },
  assembly: { fabricationWidth: 118, fabricationHeight: 208, tubeProfileRail: 'Tubo 38', bracketType: 'Soporte L', valance: 'Bandó recto', chainColor: 'Blanco', bottomProfile: 'Perfil ovalado' },
  divisions: [
    { id: 'part-1', label: 'Parte 1', width: 60, height: 208, controlSide: 'left' },
    { id: 'part-2', label: 'Parte 2', width: 58, height: 208, controlSide: 'right' },
  ],
  accessories: [{ id: 'acc-1', name: 'Guía lateral', qty: 2, notes: 'Aluminio' }],
  motor: { motorSide: 'right', powerPoint: 'available', voltage: '110V', distanceToPowerM: 1.5 },
  status: 'ready_for_fabrication',
  alerts: [{ id: 'al-1', level: 'warning', message: 'Vano desnivelado' }],
  notes: 'Cuidar la moldura',
};

const mantenimiento = {
  id: 'sol-2', itemType: 'maintenance', name: 'Servicio Mantenimiento', layer: 'inside',
  system: 'Enrollables', drive: 'none', assembly: {}, divisions: [], accessories: [],
  status: 'quick', alerts: [],
  maintenance: { tasks: [{ id: 'task-1', label: 'Lavado', price: 45000, selected: true }] },
};

const ventana = {
  id: 'win-1', label: 'Ventana 1', openingType: 'Corrediza', shape: 'Rectangular',
  quickMode: 'simple', customFields: { cf1: 'Templado' },
  geometry: { widthTop: 120, widthMiddle: 119, widthBottom: 120, heightLeft: 210, heightCenter: 210, heightRight: 209, depth: 12, levelStatus: 'minor_unlevel' },
  siteConditions: [{ id: 'cond-1', label: 'Humedad', severity: 'medium' }],
  evidence: [
    { id: 'ev-1', kind: 'measurement', label: 'medida.jpg', dataUrl: '', photoId: 'ev-1', createdAt: 1 },
    { id: 'ev-2', kind: 'general', label: 'general.jpg', dataUrl: '', photoId: 'ev-2', createdAt: 2 },
  ],
  solutions: [solucion, mantenimiento],
  notes: 'Ventana sobre el lavadero',
};

const espacio = { id: 'esp-1', name: 'Habitación 1', notes: 'Piso en madera', windows: [ventana] };

// ── 1. Ni un id repetido en todo el arbol ────────────────────────────────────
const copia = copiarEspacio(espacio, 'Habitación 2');

const idsDe = espacios => {
  const ids = [];
  espacios.forEach(sp => {
    ids.push(sp.id);
    (sp.windows || []).forEach(w => {
      ids.push(w.id);
      (w.siteConditions || []).forEach(c => ids.push(c.id));
      (w.evidence || []).forEach(e => ids.push(e.id));
      (w.solutions || []).forEach(s => {
        ids.push(s.id);
        (s.divisions || []).forEach(d => ids.push(d.id));
        (s.accessories || []).forEach(a => ids.push(a.id));
        (s.alerts || []).forEach(a => ids.push(a.id));
        ((s.maintenance && s.maintenance.tasks) || []).forEach(t => ids.push(t.id));
      });
    });
  });
  return ids;
};

const todos = idsDe([espacio, copia]);
ok(new Set(todos).size === todos.length, `Ningún id se repite entre el original y la copia (${todos.length} ids)`);

const originales = new Set(idsDe([espacio]));
ok(idsDe([copia]).every(id => !originales.has(id)), 'Ningún id de la copia existe en el original');

// ── 2. El original no se toca ────────────────────────────────────────────────
ok(espacio.id === 'esp-1' && espacio.name === 'Habitación 1', 'El espacio original queda igual');
ok(espacio.windows[0].solutions[0].divisions[0].id === 'part-1', 'Las divisiones del original quedan igual');
ok(espacio.windows[0].evidence.length === 2, 'El original conserva sus 2 fotos');

// ── 3. El contenido tecnico viaja completo ───────────────────────────────────
const wCopia = copia.windows[0];
const sCopia = wCopia.solutions[0];
ok(copia.name === 'Habitación 2' && copia.notes === 'Piso en madera', 'Nombre nuevo, notas del espacio copiadas');
ok(wCopia.label === 'Ventana 1', 'La ventana de adentro conserva su nombre');
ok(JSON.stringify(wCopia.geometry) === JSON.stringify(ventana.geometry), 'Las medidas del vano viajan completas');
ok(wCopia.customFields.cf1 === 'Templado' && wCopia.openingType === 'Corrediza' && wCopia.shape === 'Rectangular', 'Campos personalizados, apertura y forma');
ok(wCopia.notes === 'Ventana sobre el lavadero', 'Observaciones de la ventana');
ok(wCopia.siteConditions.length === 1 && wCopia.siteConditions[0].label === 'Humedad', 'Condiciones del sitio');
ok(sCopia.system === 'Enrollables' && sCopia.fabric === 'Blackout' && sCopia.color === 'Beige' && sCopia.mount === 'Techo', 'Sistema, tela, color y montaje');
ok(sCopia.drive === 'motor' && sCopia.controlSide === 'right' && sCopia.surface === 'concrete', 'Operación, lado del mando y superficie');
ok(JSON.stringify(sCopia.assembly) === JSON.stringify(solucion.assembly), 'Detalles de fabricación (tubo/soporte/bandó/cadena/perfil)');
ok(sCopia.divisions.length === 2 && sCopia.divisions[1].width === 58 && sCopia.divisions[1].controlSide === 'right', 'Tramos/divisiones con sus medidas');
ok(sCopia.accessories.length === 1 && sCopia.accessories[0].qty === 2, 'Accesorios');
ok(JSON.stringify(sCopia.motor) === JSON.stringify(solucion.motor), 'Motorización');
ok(sCopia.quickQuote.pricePerM2 === 180000 && sCopia.quickQuote.quantity === 2, 'Precio por m² y cantidad');
ok(sCopia.alerts.length === 1 && sCopia.alerts[0].message === 'Vano desnivelado', 'Alertas técnicas');
ok(sCopia.notes === 'Cuidar la moldura', 'Observaciones de la persiana');
ok(wCopia.solutions[1].maintenance.tasks[0].label === 'Lavado' && wCopia.solutions[1].maintenance.tasks[0].price === 45000, 'Ítems de mantenimiento con su precio');
ok(wCopia.solutions[1].itemType === 'maintenance', 'El mantenimiento sigue siendo mantenimiento');

// ── 4. Las fotos NO viajan ───────────────────────────────────────────────────
ok(wCopia.evidence.length === 0, 'La copia arranca SIN fotos (son de esa ventana, no de la copia)');

// ── 5. Objetos nuevos, no la misma referencia ────────────────────────────────
sCopia.assembly.fabricationWidth = 999;
sCopia.divisions[0].width = 999;
sCopia.quickQuote.width = 999;
sCopia.motor.voltage = '999V';
wCopia.geometry.widthTop = 999;
wCopia.customFields.cf1 = '999';
ok(solucion.assembly.fabricationWidth === 118, 'Editar la copia no cambia el `assembly` del original');
ok(solucion.divisions[0].width === 60, 'Editar la copia no cambia las divisiones del original');
ok(solucion.quickQuote.width === 1.2, 'Editar la copia no cambia el `quickQuote` del original');
ok(solucion.motor.voltage === '110V', 'Editar la copia no cambia el motor del original');
ok(ventana.geometry.widthTop === 120, 'Editar la copia no cambia las medidas del original');
ok(ventana.customFields.cf1 === 'Templado', 'Editar la copia no cambia los campos personalizados del original');

// ── 6. Nada de claves con `undefined` nuevas (Firestore rechaza el doc entero) ─
const pelada = copiarSolucion({ id: 's', name: 'Simple', layer: 'inside', system: 'Enrollables', drive: 'manual', assembly: {}, divisions: [], accessories: [], status: 'quick', alerts: [] });
const conUndefined = Object.entries(pelada).filter(([, v]) => v === undefined).map(([k]) => k);
ok(conUndefined.length === 0, `Ninguna clave nueva vale undefined (gotcha 4)${conUndefined.length ? ': ' + conUndefined.join(', ') : ''}`);

// ── 7. Los nombres siguen la cuenta y no pisan lo que ya hay ─────────────────
ok(JSON.stringify(nombresDeCopia('Habitación 1', ['Habitación 1'], 3)) === JSON.stringify(['Habitación 2', 'Habitación 3', 'Habitación 4']), 'Habitación 1 → 2, 3, 4');
ok(JSON.stringify(nombresDeCopia('Habitación 1', ['Habitación 1', 'Habitación 2'], 2)) === JSON.stringify(['Habitación 3', 'Habitación 4']), 'Se saltea la Habitación 2 que ya existe');
ok(JSON.stringify(nombresDeCopia('Sala', ['Sala'], 2)) === JSON.stringify(['Sala (copia)', 'Sala (copia 2)']), 'Sin número al final → (copia), (copia 2)');
ok(JSON.stringify(nombresDeCopia('Sala', ['Sala', 'Sala (copia)'], 1)) === JSON.stringify(['Sala (copia 2)']), 'No repite una (copia) que ya existe');
ok(JSON.stringify(nombresDeCopia('Ventana 1', ['ventana 2'], 1)) === JSON.stringify(['Ventana 3']), 'Compara sin distinguir mayúsculas');
ok(nombresDeCopia('Alcoba 09', ['Alcoba 09'], 1)[0] === 'Alcoba 10', 'Un número con cero adelante sigue contando');

// ── 8. Duplicar una ventana sola ─────────────────────────────────────────────
const vCopia = copiarVentana(ventana, 'Ventana 2');
ok(vCopia.label === 'Ventana 2' && vCopia.id !== ventana.id, 'La ventana copiada tiene id y nombre nuevos');
ok(vCopia.solutions.length === 2 && vCopia.solutions[0].id !== solucion.id, 'Se lleva sus persianas, con ids nuevos');
ok(vCopia.evidence.length === 0, 'La ventana copiada tampoco se lleva las fotos');

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
