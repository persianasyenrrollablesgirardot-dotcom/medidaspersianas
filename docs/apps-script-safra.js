/**
 * ============================================================================
 *  SUBIR LOS REPORTES DE SAFRA A SUPABASE — Google Apps Script
 * ============================================================================
 *
 *  QUE HACE
 *  Todos los dias mira la carpeta de Drive donde Gemini deja el reporte, y
 *  sube a Supabase los archivos que todavia no estan. Nada mas. No interpreta,
 *  no calcula, no decide: guarda el archivo tal cual llego.
 *
 *  POR QUE ES TAN TONTO A PROPOSITO
 *  Este codigo vive en Google, fuera del repo, y no se puede probar ni versionar
 *  como el resto. Asi que hace lo minimo indispensable. Toda la parte delicada
 *  — no duplicar pedidos, no pisar un dato bueno con uno vacio, anotar los
 *  cambios de precio — pasa despues en la app, en TypeScript, donde si se puede
 *  probar. Si algun dia hay que cambiar una regla, se cambia alla, no aca.
 *
 *  COMO INSTALARLO (una sola vez, ~5 minutos)
 *
 *  1. Entra a  https://script.google.com  ->  "Nuevo proyecto".
 *  2. Borra lo que haya y pega TODO este archivo.
 *  3. Cambia las tres constantes de abajo (CARPETA, SUPABASE_URL, SUPABASE_KEY).
 *     La URL y la clave son las mismas que estan en el .env del proyecto
 *     (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).
 *  4. Guarda (el disquete) y ponle un nombre, por ejemplo "Safra a Supabase".
 *  5. Arriba elegi la funcion  subirReportesDeSafra  y toca "Ejecutar".
 *     Google te va a pedir permiso para leer tu Drive: aceptalo. Es tu propia
 *     cuenta leyendo tu propia carpeta.
 *  6. Mira el registro de ejecucion: tiene que decir cuantos archivos subio.
 *  7. Para que corra solo: reloj (Activadores) -> "Anadir activador"
 *        Funcion:            subirReportesDeSafra
 *        Origen del evento:  Basado en tiempo
 *        Tipo:               Temporizador diario
 *        Hora:               entre 11 a.m. y 12 p.m.
 *
 *     OJO CON LA HORA. La primera version decia "entre 7 y 8 a.m." y estuvo MAL: Gemini
 *     genera el archivo cerca de las 10 (los propios archivos lo dicen en `corte_hora`:
 *     10:00 el 08-sep, 10:25 el 09-sep). Con el disparador a las 7, el script corria tres
 *     horas ANTES de que existiera el archivo del dia y siempre miraba el de ayer.
 *     Si Gemini alguna vez se atrasa, no se pierde nada: la corrida del dia siguiente mira
 *     los 10 archivos mas recientes y lo levanta.
 *     Guardar. Listo, no lo tocas nunca mas.
 *
 *  SI ALGO FALLA
 *  No pasa nada grave: en la app hay un boton "Importar archivo" para meter el
 *  JSON a mano. Y como se sube por huella del contenido, subir dos veces el
 *  mismo archivo no duplica nada.
 * ============================================================================
 */

// ── Cambiar estas tres lineas ───────────────────────────────────────────────
var CARPETA       = 'Reporte Safra';                            // nombre de la carpeta en tu Drive
var SUPABASE_URL  = 'https://dnsyyvtznkllneyuopoa.supabase.co'; // el mismo del .env
var SUPABASE_KEY  = 'PEGAR_AQUI_LA_CLAVE_ANONIMA';              // VITE_SUPABASE_ANON_KEY
// ────────────────────────────────────────────────────────────────────────────

/** Cuantos archivos mirar en cada corrida. Si el script no corrio por unos
 *  dias, con esto se pone al dia solo en la siguiente. */
var CUANTOS_REVISAR = 10;

function subirReportesDeSafra() {
  var carpetas = DriveApp.getFoldersByName(CARPETA);
  if (!carpetas.hasNext()) {
    Logger.log('ERROR: no encontre la carpeta "' + CARPETA + '" en tu Drive.');
    return;
  }

  var carpeta = carpetas.next();
  var archivos = [];
  var iterador = carpeta.getFiles();
  while (iterador.hasNext()) {
    var f = iterador.next();
    if (f.getName().toLowerCase().indexOf('.json') !== -1) archivos.push(f);
  }

  if (!archivos.length) {
    Logger.log('La carpeta existe pero no tiene ningun .json.');
    return;
  }

  // Los mas nuevos primero, y solo los ultimos N: los viejos ya estan subidos.
  archivos.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  archivos = archivos.slice(0, CUANTOS_REVISAR);

  var subidos = 0, repetidos = 0, fallados = 0;

  for (var i = 0; i < archivos.length; i++) {
    var archivo = archivos[i];
    var texto = archivo.getBlob().getDataAsString('UTF-8');

    var datos;
    try {
      datos = JSON.parse(texto);
    } catch (e) {
      Logger.log('SALTADO (no es JSON valido): ' + archivo.getName());
      fallados++;
      continue;
    }
    /**
     * SOLO se comprueba que sea un objeto JSON. NADA MAS.
     *
     * La primera version exigia una clave `pedidos`, y el 8 y el 9 de septiembre no subio
     * nada: Gemini le cambio el nombre a esa clave (novedades_dia_08_septiembre,
     * novedad_dia_09_septiembre) y el script descarto los archivos en silencio. Hizo lo
     * correcto con la regla que tenia — pero la regla estaba mal.
     *
     * Del otro lado no hay un sistema, hay un modelo que reescribe la estructura cuando le
     * parece. Asi que este script mueve bytes y punto: quien decide si sirve es la app, que
     * busca los pedidos por FORMA y no por nombre, y que ademas se puede probar.
     */
    if (!datos || typeof datos !== 'object') {
      Logger.log('SALTADO (no es un objeto JSON): ' + archivo.getName());
      fallados++;
      continue;
    }

    var fila = {
      archivo: archivo.getName(),
      fecha_reporte: datos.fecha_reporte || null,
      generado_en: datos.generado_en || null,
      hash: huella(texto),
      json_crudo: datos,
      // Cuantos pedidos trae lo cuenta la app al procesarlo: aca no se sabe donde estan.
      pedidos_en_archivo: null
    };

    var respuesta = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/safra_reportes', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        Prefer: 'return=minimal'
      },
      payload: JSON.stringify(fila),
      muteHttpExceptions: true
    });

    var codigo = respuesta.getResponseCode();
    if (codigo >= 200 && codigo < 300) {
      subidos++;
      Logger.log('SUBIDO: ' + archivo.getName());
    } else if (codigo === 409) {
      // La huella ya existe: este archivo ya se habia subido. Es lo normal.
      repetidos++;
    } else {
      fallados++;
      Logger.log('ERROR ' + codigo + ' en ' + archivo.getName() + ': ' + respuesta.getContentText().slice(0, 200));
    }
  }

  Logger.log('Listo. Subidos: ' + subidos + ' | ya estaban: ' + repetidos + ' | con problema: ' + fallados);
}

/**
 * FNV-1a. Tiene que dar EXACTAMENTE lo mismo que `huella()` en
 * src/lib/safra/ingesta.ts, porque es lo que evita que el mismo archivo entre
 * dos veces. Si se cambia aca, hay que cambiarlo alla igual.
 */
function huella(texto) {
  var h = 0x811c9dc5;
  for (var i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  var hex = h.toString(16);
  while (hex.length < 8) hex = '0' + hex;
  return hex + '-' + texto.length.toString(16);
}
