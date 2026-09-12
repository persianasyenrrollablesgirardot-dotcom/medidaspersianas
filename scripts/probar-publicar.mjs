/**
 * Prueba del armado de la publicacion.  Corre con:  npm run probar:publicar
 *
 * Lo que se cuida, en orden de importancia:
 *
 * 1. **Que la identidad sea `cloudDocId ?? code`, nunca el codigo pelado.** El rescate de
 *    julio dejo 28 codigos con 2 a 4 copias. Con el codigo como identidad, todas escriben
 *    sobre la misma fila y solo UNA queda publicada. Es el fallo que ya obligo a inventar
 *    `cloudDocId`, y repetirlo en una tabla nueva no lo notaria nadie.
 *
 * 2. **Que ninguna clave valga `undefined`.** `JSON.stringify` las borra SIN AVISAR, asi
 *    que el campo desaparece del cuerpo en vez de fallar. Es el gotcha 4 por otra puerta:
 *    con Firestore al menos se rechazaba el documento entero y se notaba.
 *
 * 3. **Que los totales salgan del resumen y no se recalculen.** Dos formulas para el mismo
 *    numero acaban discrepando, y eso se descubre cotizando.
 *
 * 4. **Que no viaje ninguna foto.** Repetir el `dataUrl` reventaria el cuerpo del POST
 *    igual que reventaba el limite de 1 MB de Firestore.
 *
 * 5. **Que retirar MARQUE y no borre**, y que no se pise `enviado_en`: sigue siendo cierto
 *    que el pedido se envio aquel dia, y esa mitad de la historia es la que hace falta
 *    cuando llega un reclamo.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), 'publicar-' + Date.now() + '.mjs');
execSync(
  `npx esbuild src/lib/publicarPedido.ts --bundle --format=esm --outfile="${tmp}" --log-level=error`,
  { stdio: 'inherit' },
);
const { armarPublicacion, refDePublicacion } = await import('file://' + tmp);

let fallos = 0;
const ok = (cond, msg) => { console.log((cond ? '  OK   ' : '  FALLA') + ' ' + msg); if (!cond) fallos++; };

const AHORA = Date.UTC(2026, 8, 12, 15, 0, 0);

/** Un proyecto con lo justo, y una foto adentro para comprobar que NO viaja. */
const proyecto = (extra = {}) => ({
  id: 7,
  code: 'P-1156386',
  clientName: 'Vanessa Bogota',
  siteName: 'Apto 302',
  city: 'Girardot',
  address: 'Calle 12 #3-45',
  contactPhone: '3001234567',
  clientDocument: '52.123.456',
  status: 'ready_for_fabrication',
  discountPercent: 10,
  createdAt: AHORA - 100000,
  updatedAt: AHORA - 50000,
  synced: true,
  sentToSupplier: true,
  spaces: [{
    id: 'esp1', name: 'Sala',
    windows: [{
      id: 'v1', label: 'Ventana 1',
      geometry: { widthTop: 1200, heightLeft: 1500 },
      siteConditions: [],
      evidence: [{ id: 'ev1', kind: 'level', photoId: 'foto-1', dataUrl: 'data:image/jpeg;base64,AAAA' }],
      solutions: [{ id: 'sol1', system: 'Enrollable', fabric: 'Screen Solar 5%' }],
    }],
  }],
  ...extra,
});

const resumen = (extra = {}) => ({
  projectId: 7,
  code: 'P-1156386',
  clientName: 'Vanessa Bogota',
  status: 'ready_for_fabrication',
  spacesCount: 1,
  windowsCount: 1,
  solutionsCount: 1,
  totalEstimate: 435055.67,
  totalAreaM2: 1.8,
  systemTotals: { Enrollable: { area: 1.8, price: 435055.67 } },
  createdAt: AHORA - 100000,
  updatedAt: AHORA - 50000,
  synced: true,
  ...extra,
});

// ── 1. La identidad, que es la regla que ya costo una vez ───────────────────
console.log('\nLa identidad del pedido');
{
  const sinDoc = armarPublicacion(proyecto(), resumen(), { ahora: AHORA });
  ok(sinDoc.id === 'P-1156386', 'Sin cloudDocId la identidad es el code');

  const conDoc = armarPublicacion(proyecto({ cloudDocId: 'P-1156386__2' }), resumen(), { ahora: AHORA });
  ok(conDoc.id === 'P-1156386__2', 'Con cloudDocId manda el cloudDocId, no el code');
  ok(conDoc.code === 'P-1156386', 'Y el code viaja igual, para poder auditar');
  ok(conDoc.id !== sinDoc.id, 'Dos copias del MISMO code dan dos identidades distintas');
}

// ── 2. Ninguna clave en undefined (gotcha 4, por la otra puerta) ────────────
console.log('\nNada en undefined: JSON.stringify las borraria sin avisar');
{
  const pelado = {
    id: 9, code: 'P-9', clientName: 'Quien sea', status: 'draft',
    createdAt: AHORA, updatedAt: AHORA, synced: false, spaces: [],
  };
  const resumenPelado = {
    projectId: 9, code: 'P-9', clientName: 'Quien sea', status: 'draft',
    spacesCount: 0, windowsCount: 0, solutionsCount: 0,
    createdAt: AHORA, updatedAt: AHORA, synced: false,
  };
  const pub = armarPublicacion(pelado, resumenPelado, { ahora: AHORA });

  const enUndefined = Object.entries(pub).filter(([, v]) => v === undefined).map(([k]) => k);
  ok(enUndefined.length === 0, `Ninguna clave vale undefined (${enUndefined.join(', ') || 'ninguna'})`);

  ok(pub.sitio === null && pub.ciudad === null && pub.direccion === null,
    'Lo que falta es null EXPLICITO, no una clave ausente');
  ok(pub.total === null, 'Un total que no existe es null, nunca 0');
  ok(pub.descuento_pct === null, 'Y un descuento ausente tambien es null');

  const ida = JSON.parse(JSON.stringify(pub));
  ok(Object.keys(ida).length === Object.keys(pub).length,
    'Pasar por JSON no pierde ninguna clave: eso es lo que se estaba cuidando');
}

// ── 3. Los totales salen del resumen, no se recalculan ──────────────────────
console.log('\nLos numeros salen del resumen que ya los calculo');
{
  const pub = armarPublicacion(proyecto(), resumen(), { ahora: AHORA });
  ok(pub.espacios === 1 && pub.ventanas === 1 && pub.soluciones === 1, 'Conteos tomados del resumen');
  ok(pub.area_m2 === 1.8, 'El area sale del resumen');
  ok(pub.descuento_pct === 10, 'El descuento sale del proyecto');
  ok(pub.detalle.Enrollable.price === 435055.67, 'El detalle es el systemTotals que ya existia');

  ok(pub.total === 435056, 'El total va REDONDEADO: son pesos enteros, la columna es bigint');
  ok(Number.isInteger(pub.total), 'Y es un entero de verdad, no un flotante que termine en .999');

  const raro = armarPublicacion(proyecto(), resumen({ totalEstimate: Number.NaN }), { ahora: AHORA });
  ok(raro.total === null, 'Un total que no es un numero valido es null, no NaN');
}

// ── 4. Ninguna foto viaja en el cuerpo ──────────────────────────────────────
console.log('\nLas fotos no viajan: ya van por Storage');
{
  const pub = armarPublicacion(proyecto(), resumen(), { ahora: AHORA });
  const texto = JSON.stringify(pub);
  ok(!texto.includes('dataUrl'), 'No aparece ninguna clave dataUrl');
  ok(!texto.includes('data:image'), 'Ni el contenido de una imagen embebida');
  ok(!texto.includes('foto-1'), 'Ni el id de la foto: el cuerpo es solo el dato del pedido');
  ok(!('spaces' in pub), 'No viaja el arbol del levantamiento: esto es una salida, no una copia');
}

// ── 5. El momento: Date.now() al encolar, NO project.updatedAt ──────────────
console.log('\nEl momento de la publicacion');
{
  const pub = armarPublicacion(proyecto(), resumen(), { ahora: AHORA });
  ok(pub.actualizado_en === AHORA, 'actualizado_en es el instante que le pasa quien encola');
  ok(pub.actualizado_en !== proyecto().updatedAt,
    'Y NO es project.updatedAt: hay cosas que se publican sin modificar el proyecto');

  const despues = armarPublicacion(proyecto(), resumen(), { ahora: AHORA + 1000 });
  ok(despues.actualizado_en > pub.actualizado_en, 'Dos publicaciones seguidas quedan ordenadas');
}

// ── 6. Retirar MARCA, no borra ──────────────────────────────────────────────
console.log('\nRetirar del proveedor');
{
  const enviado = armarPublicacion(proyecto(), resumen(), { ahora: AHORA });
  ok(enviado.retirado_en === null, 'Un pedido enviado no tiene retirado_en');

  const retirado = armarPublicacion(proyecto(), resumen(), { ahora: AHORA + 5000, retirado: true });
  ok(typeof retirado.retirado_en === 'string', 'Al retirar se MARCA con una fecha');
  ok(retirado.id === enviado.id, 'Sobre la MISMA fila: no nace otra, y ninguna se borra');
  ok(typeof retirado.enviado_en === 'string',
    'Y enviado_en sigue estando: que se envio aquel dia sigue siendo cierto');
}

// ── 7. La gestion externa ───────────────────────────────────────────────────
console.log('\nDe donde vino el pedido');
{
  ok(armarPublicacion(proyecto(), resumen(), { ahora: AHORA }).gestion === 'app',
    'Por defecto la gestion es de la app');
  ok(armarPublicacion(proyecto(), resumen(), { ahora: AHORA, gestion: 'externa' }).gestion === 'externa',
    'Y el pedido gestionado por fuera queda marcado como externa');
}

// ── 8. El refId de la cola ──────────────────────────────────────────────────
console.log('\nEl refId de la cola');
{
  ok(refDePublicacion('P-1156386') === 'pub:P-1156386', 'Lleva el prefijo pub:');
  ok(refDePublicacion('P-1') !== 'P-1',
    'Y NUNCA es el id pelado: compartir refId con upsert_project infla la cola');
}

// ── 9. El nombre del cliente nunca falta ────────────────────────────────────
console.log('\nEl cliente');
{
  const sinNombre = armarPublicacion(
    proyecto({ clientName: '' }), resumen(), { ahora: AHORA },
  );
  ok(sinNombre.cliente_nombre === 'Cliente sin nombre',
    'cliente_nombre es NOT NULL en la base: sin nombre se dice, no se manda vacio');
  ok(!('cliente_id' in armarPublicacion(proyecto(), resumen(), { ahora: AHORA })),
    'Juno NO manda cliente_id: publica, no empareja — el emparejado lo hace quien tiene los alias');
}

fs.unlinkSync(tmp);
console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallas.`);
process.exit(fallos === 0 ? 0 : 1);
