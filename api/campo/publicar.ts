/**
 * PUBLICA EL PEDIDO VENDIDO EN EL SUPABASE DEL GERENTE.
 *
 * Fase 0 de la arquitectura de tres piezas: cuando el admin marca "Enviar a Proveedor",
 * el pedido sale del telefono y queda en una tabla que el Gerente y el agente pueden
 * leer. Un solo sentido: Juno escribe, no lee de vuelta.
 *
 * POR QUE ESTE ENDPOINT VIVE ACA Y NO EN EL BACKEND DEL GERENTE:
 * todo endpoint del Gerente exige la cabecera `x-clave` con `APP_CLAVE`. Para llamarlo,
 * Juno tendria que llevar esa clave en el bundle — y todo lo que esta en `src/` es
 * publico, lo lea quien lo lea, INCLUIDO EL PROVEEDOR, que tiene login. Con esa clave
 * cualquiera podria pedirle a `/api/respaldo` del Gerente la operacion entera: clientes,
 * telefonos y deudas. Aca la service_role vive en Vercel y nunca baja al navegador.
 *
 * QUIEN PUEDE LLAMARLO: solo el DUENO, con el mismo mecanismo ya probado de
 * `api/enviar-pedido.ts` — se verifica el token de Firebase contra `accounts:lookup` y se
 * compara con `OWNER_EMAIL`. No se usa `firebase-admin` a proposito: pediria una clave de
 * cuenta de servicio mas para guardar y rotar.
 *
 * OJO CON LOS DOS SUPABASE: Juno usa `dnsyyvtznkllneyuopoa` para el bucket de evidencias.
 * Estas tablas viven en `olububjdvboiqgmihsmk`, el del Gerente. Por eso las variables se
 * llaman GERENTE_* — confundirlas escribe en la base equivocada y no se nota.
 */

const OWNER_EMAIL = 'persianasyenrrollablesgirardot@gmail.com';
const FIREBASE_API_KEY = 'AIzaSyAyQFHSfPKDBbGfKuSzPXA3wXXfsAS5jbk';

/** Devuelve el correo del dueno del token, o null si el token no sirve. */
async function correoDelToken(idToken: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!r.ok) return null;
    const datos = (await r.json()) as { users?: { email?: string }[] };
    return datos.users?.[0]?.email ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Solo POST' });
    return;
  }

  const url = process.env.GERENTE_SUPABASE_URL;
  const llave = process.env.GERENTE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) {
    // Falla CERRADA y lo dice: que quede claro que el problema es la configuracion
    // y no el pedido, para que nadie lo busque del lado de la app.
    res.status(503).json({
      error: 'Falta configurar GERENTE_SUPABASE_URL y GERENTE_SUPABASE_SERVICE_ROLE_KEY en Vercel.',
    });
    return;
  }

  const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { pedido, cliente } = cuerpo ?? {};

  // El token puede venir en la cabecera (lo que dice la spec) o en el cuerpo (como lo
  // manda `enviar-pedido.ts`). Se aceptan los dos para no tener dos convenciones.
  const cabecera: string = req.headers?.authorization || '';
  const idToken: string =
    (cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '') || cuerpo?.idToken || '';

  if (!idToken) {
    res.status(401).json({ error: 'Falta el token de sesion.' });
    return;
  }
  if (!pedido || typeof pedido.id !== 'string' || !pedido.id) {
    res.status(400).json({ error: 'Falta el pedido o su id.' });
    return;
  }
  if (typeof pedido.actualizado_en !== 'number') {
    // Sin esto no se puede decidir si una llegada es vieja: mejor rechazar que pisar.
    res.status(400).json({ error: 'El pedido no trae `actualizado_en`.' });
    return;
  }

  const quien = await correoDelToken(idToken);
  if (!quien) {
    res.status(401).json({ error: 'Sesion no valida. Volve a entrar a la app.' });
    return;
  }
  if (quien.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Solo el dueno puede publicar pedidos.' });
    return;
  }

  const cabeceras = {
    apikey: llave,
    Authorization: `Bearer ${llave}`,
    'Content-Type': 'application/json',
  };

  try {
    /**
     * 1. UN REINTENTO VIEJO NO PUEDE PISAR UN DATO NUEVO.
     *
     * La cola reintenta con espera creciente y puede entregar fuera de orden. Se compara
     * con el guardado y se descarta lo ESTRICTAMENTE menor: lo igual tiene que pasar,
     * porque un republish legitimo puede traer el mismo numero.
     */
    let enviadoGuardado: string | null = null;
    const previo = await fetch(
      `${url}/rest/v1/gvs_pedidos_campo?id=eq.${encodeURIComponent(pedido.id)}&select=actualizado_en,enviado_en`,
      { headers: cabeceras },
    );
    if (previo.ok) {
      const filas = (await previo.json()) as { actualizado_en: number; enviado_en: string | null }[];
      const guardado = filas?.[0]?.actualizado_en;
      enviadoGuardado = filas?.[0]?.enviado_en ?? null;
      if (typeof guardado === 'number' && pedido.actualizado_en < guardado) {
        res.status(200).json({ ok: true, descartado: 'llegada vieja', guardado });
        return;
      }
    }

    /**
     * 2. JUNO PUBLICA; NO EMPAREJA.
     *
     * `cliente_id` queda nulo a proposito. El Gerente tambien crea clientes dictando: si
     * dos backends deciden por su cuenta a quien se parece un nombre, la logica diverge y
     * se duplican los clientes — y el duplicado aparece semanas despues, con historial
     * colgando de los dos. Empareja despues quien tiene los alias.
     */
    const fila = {
      ...pedido,
      cliente_id: null,
      cliente_nombre: pedido.cliente_nombre || cliente?.nombre || 'Cliente sin nombre',
      telefono: pedido.telefono ?? cliente?.telefono ?? null,
      documento: pedido.documento ?? cliente?.documento ?? null,
      direccion: pedido.direccion ?? cliente?.direccion ?? null,
      ciudad: pedido.ciudad ?? cliente?.ciudad ?? null,
      /**
       * CUANDO SE ENVIO NO SE PISA NUNCA.
       *
       * Un retiro llega con `enviado_en: null` — no porque no se haya enviado, sino
       * porque quien retira no sabe la fecha original. Si se escribiera ese null, la
       * fila diria que el pedido nunca estuvo en produccion, que es lo contrario de lo
       * que paso y justo lo que hace falta probar en un reclamo.
       *
       * Solo se escribe una fecha nueva cuando la trae la publicacion (un envio o un
       * re-envio). En lo demas manda lo que ya estaba guardado.
       */
      enviado_en: pedido.enviado_en ?? enviadoGuardado,
      actualizado: new Date().toISOString(),
    };

    const subida = await fetch(`${url}/rest/v1/gvs_pedidos_campo`, {
      method: 'POST',
      headers: { ...cabeceras, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(fila),
    });
    if (!subida.ok) {
      const detalle = await subida.text();
      res.status(502).json({
        error: `Supabase rechazo el pedido (${subida.status})`,
        detalle: detalle.slice(0, 300),
      });
      return;
    }

    /**
     * 3. LA NOVEDAD LLEVA UN ID DERIVADO, NO UNO AL AZAR.
     *
     * Si fuera al azar, cada reintento de la cola dejaria una novedad mas y el historial
     * del cliente se llenaria de ruido — y una lista que miente por exceso se deja de
     * mirar igual que una que miente por defecto. Derivado del pedido y del momento, un
     * reintento escribe encima de si mismo.
     */
    const retirado = !!pedido.retirado_en;
    const novedad = {
      id: `nov_juno_${pedido.id}_${pedido.actualizado_en}`,
      cliente_id: null,
      pedido_id: pedido.id,
      origen: 'juno',
      tipo: 'cambio_estado',
      texto: retirado
        ? `Pedido ${pedido.code} retirado del proveedor.`
        : `Pedido ${pedido.code} enviado al proveedor${pedido.gestion === 'externa' ? ' (gestion externa)' : ''}.`,
    };

    // Va en su propio try: lo que hace que el pedido se pueda gestionar es la fila del
    // pedido. Si la novedad falla, el pedido ya esta publicado y eso es lo que importa.
    try {
      await fetch(`${url}/rest/v1/gvs_novedades`, {
        method: 'POST',
        headers: { ...cabeceras, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(novedad),
      });
    } catch (e) {
      console.warn('Pedido publicado, pero la novedad no entro', e);
    }

    res.status(200).json({ ok: true, id: pedido.id });
  } catch (e: any) {
    res.status(500).json({
      error: 'No se pudo contactar a Supabase.',
      detalle: String(e?.message || e).slice(0, 200),
    });
  }
}
