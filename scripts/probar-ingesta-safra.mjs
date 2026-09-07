/**
 * Prueba de la ingesta de reportes de Safra — el nucleo de "sin duplicados y
 * sin perder informacion". Corre con:  npm run probar:safra
 *
 * No necesita Supabase ni red: simula la base en memoria con la misma regla de
 * upsert que usa PostgREST, y prueba la logica pura de `lib/safra/ingesta.ts`
 * contra el archivo REAL del 07-sep.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'ingesta-safra-' + Date.now() + '.mjs');
execSync(`npx esbuild src/lib/safra/ingesta.ts --format=esm --outfile="${tmp}" --log-level=error`, { stdio: 'inherit' });
const { prepararIngesta, huella, validarReporte } = await import('file://' + tmp);

const RUTA = 'src/lib/safra/reporte-2026-09-07.json';
const textoDia1 = fs.readFileSync(RUTA, 'utf8');
const dia1 = JSON.parse(textoDia1);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };

/** Simula la base: aplica una ingesta sobre un estado y devuelve el nuevo estado. */
function aplicar(estado, ingesta) {
  const pedidos = new Map(estado.pedidos);
  const productos = new Map(estado.productos);
  for (const p of ingesta.pedidos) {
    const previo = pedidos.get(p.pedido_id);
    // upsert: conserva visto_primera_vez, igual que el `on_conflict` real
    pedidos.set(p.pedido_id, { ...p, visto_primera_vez: previo?.visto_primera_vez || 'hoy' });
  }
  for (const pr of ingesta.productos) productos.set(pr.pedido_id + '#' + pr.item, pr);
  return { pedidos, productos, cambios: [...estado.cambios, ...ingesta.cambios] };
}
const guardadosDe = (estado) => new Map([...estado.pedidos].map(([k, v]) => [k, v]));

let base = { pedidos: new Map(), productos: new Map(), cambios: [] };

console.log('\n=== 1. Primera importacion del archivo real ===');
let ing = prepararIngesta(dia1, guardadosDe(base), 'dia1.json');
base = aplicar(base, ing);
ok(ing.resumen.nuevos === 7, `7 pedidos nuevos (dio ${ing.resumen.nuevos})`);
ok(base.pedidos.size === 7, `7 pedidos en base (${base.pedidos.size})`);
ok(base.productos.size === 18, `18 piezas en base (${base.productos.size})`);
ok(ing.cambios.length === 0, 'sin cambios que revisar');

console.log('\n=== 2. El MISMO archivo otra vez (no debe duplicar) ===');
ing = prepararIngesta(dia1, guardadosDe(base), 'dia1.json');
base = aplicar(base, ing);
ok(ing.resumen.nuevos === 0, `0 nuevos (dio ${ing.resumen.nuevos})`);
ok(ing.resumen.sinCambios === 7, `7 sin cambios (dio ${ing.resumen.sinCambios})`);
ok(base.pedidos.size === 7, `siguen 7 pedidos, no 14 (${base.pedidos.size})`);
ok(base.productos.size === 18, `siguen 18 piezas, no 36 (${base.productos.size})`);
ok(base.cambios.length === 0, 'sin falsos positivos de cambio');

console.log('\n=== 3. Reporte acumulativo: los 7 de ayer + 1 nuevo ===');
const dia2 = JSON.parse(textoDia1);
dia2.fecha_reporte = '2026-09-08';
dia2.pedidos.push({
  pedido_id: 'P-1160000',
  referencia_personalizada: 'CLIENTE NUEVO',
  facturacion: { factura_numero: 'PPAL16090001', fecha: '2026-09-08', forma_pago: 'CUPO', subtotal: 100000, iva: 19000, total: 119000 },
  productos: [{ item: 1, tipo: 'Persiana Enrollable', tela: 'Blackout', cantidad: 1, ancho_m: 1, alto_m: 1, mando: 'Derecho', coordinado: 'Blanco', encajonada: false, ubicacion: 'sala', precio_final: 100000, perfil: 'Cuadrado', enrollado: 'Detras' }],
});
ing = prepararIngesta(dia2, guardadosDe(base), 'dia2.json');
base = aplicar(base, ing);
ok(ing.resumen.nuevos === 1, `1 nuevo (dio ${ing.resumen.nuevos})`);
ok(base.pedidos.size === 8, `8 pedidos (${base.pedidos.size})`);
ok(base.productos.size === 19, `19 piezas (${base.productos.size})`);

console.log('\n=== 4. Gemini omite campos: NO deben borrarse los guardados ===');
const dia3 = JSON.parse(JSON.stringify(dia2));
const victima = dia3.pedidos.find(p => p.pedido_id === 'P-1151633');
const refOriginal = victima.referencia_personalizada;
const pagoOriginal = victima.facturacion.forma_pago;
victima.referencia_personalizada = '';        // se le fue el nombre del cliente
victima.facturacion.forma_pago = null;        // y la forma de pago
ing = prepararIngesta(dia3, guardadosDe(base), 'dia3.json');
const fila = ing.pedidos.find(p => p.pedido_id === 'P-1151633');
ok(fila.referencia_personalizada === refOriginal, `conservo la referencia "${fila.referencia_personalizada}"`);
ok(fila.forma_pago === pagoOriginal, `conservo la forma de pago "${fila.forma_pago}"`);
base = aplicar(base, ing);

console.log('\n=== 5. Cambia un precio: se guarda PERO queda anotado ===');
const dia4 = JSON.parse(JSON.stringify(dia3));
const cambiada = dia4.pedidos.find(p => p.pedido_id === 'P-1153104');
cambiada.facturacion.total = 999999;
ing = prepararIngesta(dia4, guardadosDe(base), 'dia4.json');
const anotado = ing.cambios.find(c => c.pedido_id === 'P-1153104' && c.campo === 'total');
ok(!!anotado, 'el cambio de total quedo anotado para revisar');
ok(anotado && anotado.valor_anterior === '208565.35', `valor anterior guardado (${anotado?.valor_anterior})`);
ok(anotado && anotado.valor_nuevo === '999999', `valor nuevo guardado (${anotado?.valor_nuevo})`);
const filaCambiada = ing.pedidos.find(p => p.pedido_id === 'P-1153104');
ok(filaCambiada.total === 999999, 'igual se guarda el valor nuevo (no se descarta)');
base = aplicar(base, ing);

console.log('\n=== 6. Un pedido DESAPARECE del reporte: no se pierde ===');
const dia5 = JSON.parse(JSON.stringify(dia4));
dia5.pedidos = dia5.pedidos.filter(p => p.pedido_id !== 'P-1150672');
const antes = base.pedidos.size;
ing = prepararIngesta(dia5, guardadosDe(base), 'dia5.json');
base = aplicar(base, ing);
ok(base.pedidos.size === antes, `siguen los ${base.pedidos.size} pedidos (no se borro ninguno)`);
ok(base.pedidos.has('P-1150672'), 'P-1150672 sigue guardado aunque no vino en el archivo');
ok(!ing.pedidos.some(p => p.pedido_id === 'P-1150672'), 'y ni siquiera se toco');

console.log('\n=== 7. Pedido sin pedido_id: se descarta (no se puede deduplicar) ===');
const dia6 = JSON.parse(JSON.stringify(dia5));
dia6.pedidos.push({ pedido_id: '', referencia_personalizada: 'FANTASMA', facturacion: { total: 1 }, productos: [] });
ing = prepararIngesta(dia6, guardadosDe(base), 'dia6.json');
ok(!ing.pedidos.some(p => !p.pedido_id), 'el pedido sin id no entra');

console.log('\n=== 8. Huella e validacion ===');
ok(huella(textoDia1) === huella(textoDia1), 'la huella es estable');
ok(huella(textoDia1) !== huella(textoDia1 + ' '), 'cambia si cambia el contenido');
ok(validarReporte({}).ok === false, 'rechaza un objeto vacio');
ok(validarReporte({ pedidos: [] }).ok === false, 'rechaza un reporte sin pedidos');
ok(validarReporte(dia1).ok === true, 'acepta el reporte real');

console.log('\n=== 9. Campos propios de cada sistema en `extra` ===');
ing = prepararIngesta(dia1, new Map(), 'x.json');
const vertical = ing.productos.find(p => p.tipo === 'Persiana Vertical');
const premium = ing.productos.find(p => p.tipo === 'Persiana Enrollable Premium');
const panel = ing.productos.find(p => p.tipo === 'Persiana Panel Japones');
ok(vertical.extra.cantidad_lamas === 59, `Vertical conserva cantidad_lamas (${vertical.extra.cantidad_lamas})`);
ok(!!vertical.extra.pesa_lama, `Vertical conserva pesa_lama (${vertical.extra.pesa_lama})`);
ok(!!premium.extra.cover_light, `Premium conserva cover_light (${premium.extra.cover_light})`);
ok(!!panel.extra.cenefa, `Panel Japones conserva cenefa (${panel.extra.cenefa})`);
ok(vertical.ubicacion === 'vertical', 'los campos comunes van en columnas propias');

console.log('\n' + (fallos === 0 ? '*** TODO OK — ' + 0 + ' fallos ***' : `*** ${fallos} FALLOS ***`));
process.exit(fallos ? 1 : 0);
