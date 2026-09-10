/**
 * Prueba del correo al proveedor.  Corre con:  npm run probar:correo
 *
 * Jhon lo pidió "bien detallado, sin omitir ninguna información". Eso es una promesa que hay
 * que poder demostrar, no una intención: acá se arma un pedido con TODOS los campos llenos y
 * se comprueba uno por uno que su valor aparece en el correo.
 *
 * Y la otra mitad, que importa igual: que NUNCA se filtre un precio ni un dato personal del
 * cliente. En CLAUDE.md eso está marcado como spec definitivo del proveedor.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'correo-' + Date.now() + '.mjs');
execSync(`npx esbuild src/lib/correoProveedor.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`, { stdio: 'inherit' });
const { armarCorreoPedido } = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };

// ── Un pedido con TODO lleno, incluida una trampa: plata y datos personales ──
const catalog = { customWindowFields: [{ id: 'cf1', label: 'Tipo de vidrio', options: [] }] };

const proyecto = {
  code: 'PRY-0142',
  clientName: 'Camilo Ricaurte',
  // Todo esto NO puede aparecer en el correo:
  address: 'Carrera 9 #12-34, Girardot',
  contactPhone: '3001234567',
  clientDocument: '1014208880',
  totalEstimate: 3133122,
  discountPercent: 10,
  spaces: [
    {
      id: 'e1', name: 'Sala', notes: 'Piso en madera, cuidar al taladrar',
      windows: [{
        id: 'w1', label: 'Ventana 1',
        openingType: 'Corrediza', shape: 'Rectangular',
        customFields: { cf1: 'Templado 6mm' },
        notes: 'Hay una cortina vieja que hay que retirar',
        geometry: {
          widthTop: 2.52, widthMiddle: 2.5, widthBottom: 2.51,
          heightLeft: 1.6, heightCenter: 1.61, heightRight: 1.59,
          depth: 0.12, angleDegrees: 45, levelStatus: 'severe_unlevel',
        },
        siteConditions: [{ id: 'sc1', label: 'Toma eléctrica lejos', severity: 'high', notes: 'a 3 metros' }],
        evidence: [],
        solutions: [{
          id: 's1', name: 'P1', system: 'Enrollable Premium',
          fabric: 'Blackout Pinpoint 1.83 Blanco', color: 'Blanco Hueso',
          layer: 'inside', drive: 'motor', controlSide: 'right',
          mount: 'Soporte a muro', surface: 'concrete',
          assembly: {
            fabricationWidth: 2.52, fabricationHeight: 1.6,
            tubeProfileRail: 'Tubo 38mm', bracketType: 'Soporte reforzado',
            valance: 'Bandó recto', chainColor: 'Cadena blanca',
            bottomProfile: 'Perfil cuadrado', deductionNotes: 'Descontar 1cm por lado',
            profileColor: 'Aluminio natural',
          },
          divisions: [
            { id: 'd1', label: 'Tramo izquierdo', width: 1.2, height: 1.6, controlSide: 'left', notes: 'lleva tope' },
            { id: 'd2', label: 'Tramo derecho', width: 1.32, height: 1.6, controlSide: 'right' },
          ],
          accessories: [{ id: 'a1', name: 'Tapa lateral', qty: 2, notes: 'color hueso' }],
          motor: {
            motorSide: 'left', powerPoint: 'missing', voltage: '110V',
            controlChannel: 'Canal 3', wifiNeeded: true, groundPole: 'no',
            notes: 'Llevar extensión',
          },
          quickQuote: { width: 2.52, height: 1.6, quantity: 1, pricePerM2: 180000, estimatedTotal: 725760, note: 'Confirmar color con la señora' },
          notes: 'El cliente pidió que quede a ras del marco',
          alerts: [
            { id: 'al1', level: 'blocker', message: 'Motor sin punto electrico confirmado.' },
            { id: 'al2', level: 'warning', message: 'Validar polo a tierra.' },
          ],
          status: 'ready_for_fabrication',
        }],
      }],
    },
    // Un espacio EXCLUIDO: no puede aparecer.
    {
      id: 'e2', name: 'Deposito Excluido', isExcluded: true,
      windows: [{ id: 'w9', label: 'Ventana fantasma', geometry: {}, siteConditions: [], evidence: [],
        solutions: [{ id: 's9', name: 'X', system: 'Sistema Fantasma', layer: 'inside', drive: 'manual',
          assembly: {}, divisions: [], accessories: [], status: 'quick', alerts: [] }] }],
    },
  ],
};

const { asunto, cuerpo } = armarCorreoPedido(proyecto, catalog, { paraQuien: 'William' });

console.log('=== 1. NO SE OMITE NADA ===');
const debenEstar = [
  ['PRY-0142', 'el código del pedido'], ['Camilo Ricaurte', 'el nombre del cliente'],
  ['Sala', 'el espacio'], ['Piso en madera', 'la nota del espacio'],
  ['Ventana 1', 'la ventana'], ['Enrollable Premium', 'el sistema'],
  ['Blackout Pinpoint 1.83 Blanco', 'la tela'], ['Blanco Hueso', 'el color'],
  ['2.52 m', 'el ancho de fabricación'], ['1.60 m', 'el alto de fabricación'],
  ['Corrediza', 'el tipo de apertura'], ['Rectangular', 'la forma'],
  ['por dentro del vano', 'la instalación'], ['Soporte a muro', 'el montaje'],
  ['concreto', 'la superficie'], ['motorizada', 'la operación'], ['derecha', 'el lado del mando'],
  ['Tubo 38mm', 'el tubo'], ['Soporte reforzado', 'el soporte'], ['Bandó recto', 'el bandó'],
  ['Cadena blanca', 'el color de cadena'], ['Perfil cuadrado', 'el perfil inferior'],
  ['Descontar 1cm por lado', 'las notas de descuento'],
  ['Tipo de vidrio', 'la etiqueta del campo personalizado'], ['Templado 6mm', 'su valor'],
  ['Tramo izquierdo', 'el tramo 1'], ['Tramo derecho', 'el tramo 2'], ['lleva tope', 'la nota del tramo'],
  ['Tapa lateral', 'el accesorio'], ['color hueso', 'la nota del accesorio'],
  ['motor a la izquierda', 'el lado del motor'], ['FALTA', 'que el punto eléctrico falta'],
  ['110V', 'el voltaje'], ['Canal 3', 'el canal'], ['requiere WiFi', 'el wifi'],
  ['SIN polo a tierra', 'el polo a tierra'], ['Llevar extensión', 'la nota del motor'],
  ['Confirmar color con la señora', 'la nota rápida'],
  ['El cliente pidió que quede a ras del marco', 'las observaciones'],
  ['Motor sin punto electrico confirmado.', 'la alerta bloqueante'],
  ['Validar polo a tierra.', 'la alerta de aviso'],
  ['profundidad 0.12 m', 'la profundidad del vano'], ['ángulo 45°', 'el ángulo'],
  ['MUY desnivelado', 'el desnivel'],
  ['Toma eléctrica lejos', 'la condición del sitio'], ['a 3 metros', 'su detalle'],
  ['Hay una cortina vieja', 'la nota de la ventana'],
];
for (const [texto, que] of debenEstar) ok(cuerpo.includes(texto), `aparece ${que}`);

console.log('\n=== 2. NUNCA SE FILTRA PLATA NI DATOS PERSONALES ===');
const noPuedenEstar = [
  ['Carrera 9', 'la dirección'], ['3001234567', 'el teléfono'], ['1014208880', 'el documento'],
  ['3133122', 'el total del proyecto'], ['180000', 'el precio por m²'],
  ['725760', 'el total estimado de la persiana'], ['$', 'cualquier símbolo de peso'],
];
for (const [texto, que] of noPuedenEstar) ok(!cuerpo.includes(texto), `NO aparece ${que}`);
ok(cuerpo.includes('Camilo Ricaurte'), 'pero el NOMBRE del cliente sí, que es la referencia');

console.log('\n=== 3. LO EXCLUIDO NO VIAJA ===');
ok(!cuerpo.includes('Deposito Excluido'), 'el espacio excluido no aparece');
ok(!cuerpo.includes('Sistema Fantasma'), 'ni su persiana');

console.log('\n=== 4. LO QUE FALTA SE DICE, NO SE CALLA ===');
const sinMedidas = JSON.parse(JSON.stringify(proyecto));
sinMedidas.spaces[0].windows[0].solutions[0].assembly.fabricationWidth = 0;
sinMedidas.spaces[0].windows[0].solutions[0].quickQuote = undefined;
const r2 = armarCorreoPedido(sinMedidas, catalog);
ok(r2.cuerpo.includes('ANCHO SIN REGISTRAR'), 'una medida que falta se avisa en el correo');

console.log('\n=== 5. EL ASUNTO ===');
ok(asunto.includes('PRY-0142') && asunto.includes('Camilo Ricaurte'), `asunto: "${asunto}"`);
const reenvio = armarCorreoPedido(proyecto, catalog, { esReenvio: true });
ok(reenvio.asunto.startsWith('ACTUALIZADO'), `el reenvío se distingue: "${reenvio.asunto}"`);
ok(reenvio.cuerpo.includes('avisame antes de seguir'), 'y avisa que puede haber empezado a fabricar');

console.log('\n=== EL CORREO QUE SALE ===\n');
console.log(cuerpo.split('\n').slice(0, 34).join('\n'));
console.log('   [...]\n');

console.log(fallos === 0 ? '*** TODO OK ***' : `*** ${fallos} FALLOS ***`);
process.exit(fallos ? 1 : 0);
