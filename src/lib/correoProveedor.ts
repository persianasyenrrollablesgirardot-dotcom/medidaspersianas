import type { TechnicalCatalog, TechnicalProject, TechnicalSolution, WindowRecord } from '../types';

/**
 * EL CORREO QUE LE LLEGA AL PROVEEDOR CUANDO SE LE ENVIA UN PEDIDO.
 *
 * Es texto escrito, no un formato ni un adjunto: se lee de arriba abajo como lo escribiria
 * una persona. Pero lo arma el CODIGO, no un modelo. Jhon lo pidio "sin omitir ninguna
 * informacion", y en una orden de produccion un dato que falta es una persiana mal
 * fabricada: eso no se le puede confiar a algo que redacta lindo pero a veces se saltea una
 * linea. Un generador deterministico recorre todo y siempre dice lo mismo.
 *
 * QUE ENTRA Y QUE NO — es el mismo criterio que la pantalla del proveedor
 * (`SupplierProjectView`), que en CLAUDE.md esta marcada como spec definitivo:
 *
 *   ENTRA:     absolutamente todo el dato tecnico, agrupado espacio > ventana > persiana.
 *   NO ENTRA:  direccion, telefono y documento del cliente (solo el NOMBRE, como referencia)
 *              y NINGUN precio, ni por item ni total.
 *
 * Lo excluido (`isExcluded`) tampoco viaja: si no se le muestra en pantalla, no puede
 * aparecer en el correo — terminaria fabricando algo que Jhon saco del pedido.
 */

const LAYER: Record<string, string> = {
  inside: 'por dentro del vano', outside: 'por fuera del vano', wall: 'sobre muro',
  ceiling: 'a techo', frame: 'sobre marco', mixed: 'mixta',
};
const DRIVE: Record<string, string> = { manual: 'manual', motor: 'motorizada', none: '' };
const SIDE: Record<string, string> = { left: 'izquierda', right: 'derecha', center: 'centro', none: '' };
const SURFACE: Record<string, string> = {
  concrete: 'concreto', drywall: 'drywall', wood: 'madera',
  aluminum: 'aluminio', tile: 'baldosa', unknown: '',
};
const POWER: Record<string, string> = {
  available: 'disponible', missing: 'FALTA', unknown: 'sin confirmar',
};

const lbl = (mapa: Record<string, string>, k?: string) => (k ? mapa[k] ?? k : '');
const m = (n?: number) => (n ? `${n.toFixed(2)} m` : '');

/** Junta trozos de frase salteando los vacios, para que no queden " · · " colgando. */
const unir = (partes: (string | number | undefined | false | null)[], sep = ' ') =>
  partes.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(sep);

function medidas(s: TechnicalSolution) {
  const ancho = s.quickQuote?.width || s.assembly.fabricationWidth || 0;
  const alto = s.quickQuote?.height || s.assembly.fabricationHeight || 0;
  const area = s.quickQuote?.manualArea ?? (ancho && alto ? ancho * alto : 0);
  return { ancho, alto, area };
}

/**
 * Una persiana, contada como se la contarias a alguien por teléfono.
 *
 * Cada bloque se salta solo si esta vacio. Lo que NUNCA se salta: si falta una medida, se
 * dice que falta. Callarlo seria peor — el proveedor la fabricaria con lo que le parezca.
 */
function contarPersiana(
  s: TechnicalSolution,
  win: WindowRecord,
  catalog: TechnicalCatalog | undefined,
  numero: number,
): string {
  const esMant = s.itemType === 'maintenance';
  const { ancho, alto, area } = medidas(s);
  const color = s.color || s.assembly.profileColor;
  const lineas: string[] = [];

  if (esMant) {
    lineas.push(`  ${numero}. MANTENIMIENTO / SERVICIO — ${s.system || 'sin sistema indicado'}`);
  } else {
    lineas.push(`  ${numero}. ${s.system || 'Persiana'}`);
    lineas.push(unir([
      '     Fabricar',
      ancho ? m(ancho) : 'ANCHO SIN REGISTRAR',
      'de ancho ×',
      alto ? m(alto) : 'ALTO SIN REGISTRAR',
      'de alto',
      area ? `(${area.toFixed(2)} m²)` : '',
    ]) + '.');
  }

  const ficha = unir([
    s.fabric && `Tela: ${s.fabric}.`,
    color && `Color: ${color}.`,
    win.openingType && `Apertura: ${win.openingType}.`,
    win.shape && `Forma: ${win.shape}.`,
  ]);
  if (ficha) lineas.push('     ' + ficha);

  const montaje = unir([
    s.layer && `Instalación ${lbl(LAYER, s.layer)}`,
    s.mount && `montaje ${s.mount}`,
    s.surface && lbl(SURFACE, s.surface) && `sobre ${lbl(SURFACE, s.surface)}`,
  ], ', ');
  if (montaje) lineas.push('     ' + montaje + '.');

  const operacion = unir([
    s.drive && lbl(DRIVE, s.drive) && `Operación ${lbl(DRIVE, s.drive)}`,
    s.controlSide && lbl(SIDE, s.controlSide) && `mando a la ${lbl(SIDE, s.controlSide)}`,
  ], ', ');
  if (operacion) lineas.push('     ' + operacion + '.');

  const fab = unir([
    s.assembly.tubeProfileRail && `tubo/riel ${s.assembly.tubeProfileRail}`,
    s.assembly.bracketType && `soporte ${s.assembly.bracketType}`,
    s.assembly.valance && `bandó/cenefa ${s.assembly.valance}`,
    s.assembly.chainColor && `cadena ${s.assembly.chainColor}`,
    s.assembly.bottomProfile && `perfil inferior ${s.assembly.bottomProfile}`,
  ], ', ');
  if (fab) lineas.push('     Fabricación: ' + fab + '.');
  if (s.assembly.deductionNotes) lineas.push('     Descuentos: ' + s.assembly.deductionNotes);

  // Campos personalizados, con la etiqueta que tenia el catalogo cuando se envio.
  const defs = (win as unknown as { projectCatalogSnapshot?: TechnicalCatalog })
    .projectCatalogSnapshot?.customWindowFields || catalog?.customWindowFields || [];
  const propios = defs.filter(f => win.customFields?.[f.id]);
  if (propios.length) {
    lineas.push('     ' + propios.map(f => `${f.label}: ${win.customFields![f.id]}`).join('. ') + '.');
  }

  if (s.divisions.length) {
    lineas.push(`     Va en ${s.divisions.length} tramos:`);
    for (const p of s.divisions) {
      lineas.push('       - ' + unir([
        p.label || 'tramo',
        (p.width || p.height) && `${m(p.width)} × ${m(p.height)}`,
        p.controlSide && lbl(SIDE, p.controlSide) && `mando a la ${lbl(SIDE, p.controlSide)}`,
        p.notes,
      ], ' · '));
    }
  }

  if (s.accessories.length) {
    lineas.push('     Accesorios: ' + s.accessories
      .map(a => unir([a.name, a.qty ? `× ${a.qty}` : '', a.notes ? `(${a.notes})` : '']))
      .join('; ') + '.');
  }

  if ((s.drive === 'motor' || s.motor) && s.motor) {
    lineas.push('     Motorización: ' + unir([
      s.motor.motorSide && lbl(SIDE, s.motor.motorSide) && `motor a la ${lbl(SIDE, s.motor.motorSide)}`,
      s.motor.powerPoint && `punto eléctrico ${lbl(POWER, s.motor.powerPoint)}`,
      s.motor.voltage && `${s.motor.voltage}`,
      s.motor.controlChannel && `canal ${s.motor.controlChannel}`,
      s.motor.wifiNeeded && 'requiere WiFi',
      s.motor.groundPole === 'no' && 'SIN polo a tierra',
    ], ', ') + '.');
    if (s.motor.notes) lineas.push('     Nota del motor: ' + s.motor.notes);
  }

  const servicios = (s.maintenance?.tasks || []).filter(t => t.selected);
  if (servicios.length) {
    lineas.push('     Servicios: ' + servicios.map(t => t.label).join('; ') + '.');
  }

  if (s.quickQuote?.note) lineas.push('     Nota: ' + s.quickQuote.note);
  if (s.notes) lineas.push('     Observaciones: ' + s.notes);

  // Las alertas van al final y con el simbolo: son lo que hace que alguien levante el
  // telefono antes de cortar material.
  for (const a of s.alerts || []) {
    lineas.push(`     ${a.level === 'blocker' ? '⛔' : '⚠'} ${a.message}`);
  }

  return lineas.join('\n');
}

export interface CorreoPedido {
  asunto: string;
  cuerpo: string;
}

/**
 * Arma el correo completo. `esReenvio` cambia el tono: no es lo mismo un pedido nuevo que
 * una correccion de uno que el proveedor quiza ya empezo a fabricar.
 */
export function armarCorreoPedido(
  project: TechnicalProject,
  catalog?: TechnicalCatalog,
  opciones: { esReenvio?: boolean; paraQuien?: string } = {},
): CorreoPedido {
  const espacios = (project.spaces || [])
    .filter(e => !e.isExcluded)
    .map(e => ({ ...e, windows: (e.windows || []).filter(w => !w.isExcluded) }))
    .filter(e => e.windows.length > 0);

  const todas = espacios.flatMap(e => e.windows.flatMap(w => w.solutions || []));
  const piezas = todas.filter(s => s.itemType !== 'maintenance');
  const areaTotal = piezas.reduce((suma, s) => suma + medidas(s).area, 0);

  const cliente = project.clientName || 'sin nombre de cliente';
  const codigo = project.code || 'sin código';

  const partes: string[] = [];

  partes.push(opciones.paraQuien ? `Buenas, ${opciones.paraQuien}.` : 'Buenas.');
  partes.push('');
  partes.push(
    opciones.esReenvio
      ? `Te reenvío el pedido ${codigo} (${cliente}) porque tuvo cambios. ` +
        'Por favor tomá ESTA versión como la buena y descartá la anterior; si ya empezaste ' +
        'a fabricar algo de este pedido, avisame antes de seguir.'
      : `Te paso un pedido nuevo para fabricación: ${codigo}, del cliente ${cliente}.`,
  );
  partes.push('');
  partes.push(unir([
    `Son ${espacios.length} ${espacios.length === 1 ? 'espacio' : 'espacios'}`,
    `${espacios.reduce((n, e) => n + e.windows.length, 0)} ventanas`,
    `${piezas.length} ${piezas.length === 1 ? 'pieza' : 'piezas'}`,
    areaTotal ? `${areaTotal.toFixed(2)} m² en total` : '',
  ], ', ') + '.');
  partes.push('');
  partes.push('El detalle, espacio por espacio:');
  partes.push('');

  for (const espacio of espacios) {
    partes.push(`── ${espacio.name || 'Espacio sin nombre'} ──`);
    if (espacio.notes) partes.push(`   (${espacio.notes})`);
    partes.push('');

    for (const win of espacio.windows) {
      partes.push(`  ${win.label || 'Ventana sin nombre'}`);

      const g = win.geometry || {};
      const vano = unir([
        g.widthTop && `ancho arriba ${m(g.widthTop)}`,
        g.widthMiddle && `al medio ${m(g.widthMiddle)}`,
        g.widthBottom && `abajo ${m(g.widthBottom)}`,
        g.heightLeft && `alto izq. ${m(g.heightLeft)}`,
        g.heightCenter && `centro ${m(g.heightCenter)}`,
        g.heightRight && `der. ${m(g.heightRight)}`,
        g.depth && `profundidad ${m(g.depth)}`,
        g.angleDegrees && `ángulo ${g.angleDegrees}°`,
      ], ', ');
      if (vano) partes.push(`     Medidas del vano: ${vano}.`);
      if (g.levelStatus === 'minor_unlevel') partes.push('     El vano está levemente desnivelado.');
      if (g.levelStatus === 'severe_unlevel') partes.push('     ⚠ El vano está MUY desnivelado.');

      // Condiciones del sitio: son las que explican por que una medida es rara.
      for (const c of win.siteConditions || []) {
        partes.push(`     ${c.severity === 'high' ? '⚠' : '·'} ${c.label}${c.notes ? ` — ${c.notes}` : ''}`);
      }
      if (win.notes) partes.push(`     Nota de la ventana: ${win.notes}`);
      partes.push('');

      (win.solutions || []).forEach((s, i) => {
        partes.push(contarPersiana(s, win, catalog, i + 1));
        partes.push('');
      });
    }
  }

  partes.push('Si algo no se entiende o falta un dato, escribime antes de cortar material.');
  partes.push('');
  partes.push('Gracias,');
  partes.push('Fábrica de Cortinas Girardot');
  partes.push('');
  partes.push('—');
  partes.push(
    'Este correo lo genera la app de levantamiento técnico. Trae los mismos datos que ves ' +
    'en la Orden de Producción, sin precios ni datos personales del cliente.',
  );

  return {
    asunto: opciones.esReenvio
      ? `ACTUALIZADO · Pedido ${codigo} — ${cliente}`
      : `Pedido ${codigo} — ${cliente} (${piezas.length} ${piezas.length === 1 ? 'pieza' : 'piezas'})`,
    cuerpo: partes.join('\n'),
  };
}
