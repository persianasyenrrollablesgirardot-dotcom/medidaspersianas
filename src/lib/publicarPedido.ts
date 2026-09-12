import type { ProjectSummary, TechnicalProject } from '../types';

/**
 * ARMA LO QUE SE PUBLICA CUANDO UN PEDIDO SE VENDE.
 *
 * Fase 0 de la arquitectura de tres piezas: hasta ahora el pedido vivia en el IndexedDB
 * del telefono, y un dato que vive ahi no lo puede ver nadie mas — ni el Gerente, ni un
 * agente, ni una automatizacion, ni Jhon desde el computador. Esto le agrega una SALIDA;
 * no cambia el levantamiento ni lo que ve el proveedor.
 *
 * Este archivo es PURO: cero imports con efectos, solo tipos (que se borran al compilar).
 * El envio vive en `enviarPublicacion.ts`. Es la misma division que ya tienen
 * `correoProveedor.ts` / `enviarCorreo.ts` y `puertas.ts` / `bitacora.ts`, y es lo que
 * permite que `npm run probar:publicar` corra sin navegador, sin red y sin IndexedDB.
 */

/** Una fila de `gvs_pedidos_campo`, tal como viaja en el cuerpo del POST. */
export interface Publicacion {
  id: string;
  code: string;
  cliente_nombre: string;
  sitio: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  documento: string | null;
  estado: string | null;
  total: number | null;
  area_m2: number | null;
  descuento_pct: number | null;
  espacios: number | null;
  ventanas: number | null;
  soluciones: number | null;
  enviado_en: string | null;
  retirado_en: string | null;
  gestion: 'app' | 'externa';
  actualizado_en: number;
  detalle: Record<string, { area: number; price: number }> | null;
}

export interface OpcionesPublicacion {
  /**
   * El instante de la publicacion, en milisegundos. Lo pone quien encola.
   *
   * NO es `project.updatedAt`, y la diferencia importa: hay cosas que se publican sin
   * modificar el proyecto (un retiro, o cualquier cosa que en el futuro cuelgue de el).
   * Con `updatedAt` esas llegadas traerian el mismo numero que la anterior y el backend
   * —que descarta lo viejo— podria tragarselas para siempre. Un `Date.now()` al encolar
   * es monotono de verdad.
   *
   * Se recibe por parametro en vez de llamar a `Date.now()` adentro para que la funcion
   * siga siendo pura y se pueda probar sin que el reloj cambie el resultado.
   */
  ahora: number;
  /**
   * 'externa' es el pedido que Jhon gestiona por fuera de la app (el boton
   * `markAsSentLocally` del Dashboard, que NO sube a Firestore). Se publica igual: ya se
   * vendio, la garantia corre y hay evidencia que reclamar. Dejarlo afuera seria un punto
   * ciego en una venta real.
   */
  gestion?: 'app' | 'externa';
  /** Se retira del proveedor. La fila NO se borra: se marca. */
  retirado?: boolean;
}

/**
 * `undefined` no viaja: `JSON.stringify` borra esas claves SIN AVISAR, asi que el campo
 * desaparece del cuerpo en vez de fallar. Es el gotcha 4 del `CLAUDE.md` por otra puerta:
 * alla Firestore rechazaba el documento entero y al menos se notaba; aca se perderia en
 * silencio. Por eso todo lo ausente se normaliza a `null` explicito.
 */
function oNulo<T>(valor: T | undefined | null): T | null {
  return valor === undefined || valor === null ? null : valor;
}

/** Los pesos colombianos son enteros. `total` es `bigint` en la base. */
function aPesos(valor: number | undefined): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  return Math.round(valor);
}

/**
 * Arma el cuerpo a publicar. Sin efectos: se puede probar sin tocar la red.
 *
 * Los totales, el area y los conteos salen del `ProjectSummary`, que YA los calcula.
 * No se recalculan: dos formulas para el mismo numero acaban discrepando, y eso se
 * descubre cotizando.
 *
 * Y NO viaja ninguna foto. Las imagenes van por `supabasePhotos` a Storage; repetir el
 * `dataUrl` aca reventaria el cuerpo del POST igual que reventaba el limite de 1 MB de
 * Firestore — el mismo error, en otra puerta.
 */
export function armarPublicacion(
  proyecto: TechnicalProject,
  resumen: ProjectSummary,
  opciones: OpcionesPublicacion,
): Publicacion {
  /**
   * LA CLAVE ES `cloudDocId ?? code`, NUNCA `code` PELADO.
   *
   * El rescate de julio dejo 28 codigos con 2 a 4 copias. Con el codigo como identidad,
   * todas las copias escriben sobre la misma fila y solo UNA queda publicada — que es el
   * fallo exacto que obligo a inventar `cloudDocId`. Repetirlo aca lo repetiria en
   * silencio, y en una tabla nueva donde nadie lo estaria buscando.
   */
  const id = proyecto.cloudDocId || proyecto.code;
  const retirado = !!opciones.retirado;

  return {
    id,
    code: proyecto.code,
    cliente_nombre: proyecto.clientName || 'Cliente sin nombre',
    sitio: oNulo(proyecto.siteName),
    ciudad: oNulo(proyecto.city),
    direccion: oNulo(proyecto.address),
    telefono: oNulo(proyecto.contactPhone),
    documento: oNulo(proyecto.clientDocument),
    estado: oNulo(proyecto.status),
    total: aPesos(resumen.totalEstimate),
    area_m2: oNulo(resumen.totalAreaM2),
    descuento_pct: oNulo(proyecto.discountPercent),
    espacios: oNulo(resumen.spacesCount),
    ventanas: oNulo(resumen.windowsCount),
    soluciones: oNulo(resumen.solutionsCount),
    // Cuando se retira NO se toca `enviado_en`: sigue siendo cierto que se envio aquel
    // dia. Pisarlo borraria la mitad de la historia que hace falta en un reclamo.
    enviado_en: new Date(opciones.ahora).toISOString(),
    retirado_en: retirado ? new Date(opciones.ahora).toISOString() : null,
    gestion: opciones.gestion ?? 'app',
    actualizado_en: opciones.ahora,
    detalle: oNulo(resumen.systemTotals),
  };
}

/**
 * El `refId` de la cola. El prefijo NO es cosmetico.
 *
 * `enqueue()` busca lo pendiente con `where('refId').equals(refId).first()` y solo
 * reemplaza si ademas coincide el tipo; si el primero que encuentra es de otro tipo,
 * AGREGA una fila nueva cada vez. Compartir el `refId` con `upsert_project` haria que,
 * con una publicacion atascada, cada reconciliacion —cada 5 minutos— acumulara una fila
 * y volviera a subir el proyecto entero. Gastar datos moviles en la obra es justo lo que
 * el candado `subidosEnEstaSesion` existe para evitar.
 */
export function refDePublicacion(id: string): string {
  return `pub:${id}`;
}
