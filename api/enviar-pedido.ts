/**
 * MANDA EL CORREO DEL PEDIDO AL PROVEEDOR.
 *
 * Corre en Vercel, no en el navegador, por una razon: la clave del servicio de correo no
 * puede viajar en el bundle. Todo lo que este en `src/` es publico.
 *
 * QUIEN PUEDE LLAMARLO: solo el DUEÑO. Se verifica el token de Firebase contra Google y se
 * compara el correo con el del dueño. Sin eso, cualquiera con la URL podria mandar correos
 * desde la direccion del negocio, que es exactamente como se arruina un dominio.
 *
 * NO se verifica con `firebase-admin` a proposito: eso pediria una clave de cuenta de
 * servicio mas para guardar y rotar. `accounts:lookup` con la Web API key alcanza y no
 * agrega ningun secreto nuevo.
 */

const OWNER_EMAIL = 'persianasyenrrollablesgirardot@gmail.com';
const FIREBASE_API_KEY = 'AIzaSyAyQFHSfPKDBbGfKuSzPXA3wXXfsAS5jbk';

interface Peticion {
  idToken: string;
  para: string[];
  copia?: string[];
  asunto: string;
  cuerpo: string;
}

/** Devuelve el correo del dueño del token, o null si el token no sirve. */
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
    const datos = (await r.json()) as { users?: { email?: string; emailVerified?: boolean }[] };
    return datos.users?.[0]?.email ?? null;
  } catch {
    return null;
  }
}

const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Solo POST' });
    return;
  }

  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.CORREO_REMITENTE;
  if (!clave || !remitente) {
    // Falla CERRADA y lo dice: sin esto configurado no se manda nada, pero que quede claro
    // que el problema es la configuracion y no el pedido.
    res.status(503).json({ error: 'Falta configurar RESEND_API_KEY o CORREO_REMITENTE en Vercel.' });
    return;
  }

  const cuerpo: Peticion = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { idToken, para, copia, asunto, cuerpo: texto } = cuerpo ?? {};

  if (!idToken || !asunto || !texto || !Array.isArray(para) || para.length === 0) {
    res.status(400).json({ error: 'Faltan datos del correo.' });
    return;
  }

  const quien = await correoDelToken(idToken);
  if (!quien) {
    res.status(401).json({ error: 'Sesion no valida. Volve a entrar a la app.' });
    return;
  }
  if (quien.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Solo el dueño puede enviar pedidos por correo.' });
    return;
  }

  const destinos = para.filter(correoValido);
  const copias = (copia ?? []).filter(correoValido);
  if (destinos.length === 0) {
    res.status(400).json({ error: 'Ninguna direccion de destino es valida.' });
    return;
  }

  try {
    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remitente,
        to: destinos,
        ...(copias.length ? { cc: copias } : {}),
        // `reply_to` para que el proveedor conteste al correo de Jhon y no al remitente
        // tecnico del dominio.
        reply_to: OWNER_EMAIL,
        subject: asunto,
        // Texto plano a proposito: Jhon lo pidio "escrito, en ningun formato". Ademas el
        // texto plano entra en cualquier cliente de correo y nunca se rompe.
        text: texto,
      }),
    });

    const detalle = await envio.text();
    if (!envio.ok) {
      res.status(502).json({ error: `El servicio de correo rechazo el envio (${envio.status})`, detalle: detalle.slice(0, 300) });
      return;
    }

    res.status(200).json({ ok: true, enviadoA: destinos, copiaA: copias });
  } catch (e: any) {
    res.status(500).json({ error: 'No se pudo contactar al servicio de correo.', detalle: String(e?.message || e).slice(0, 200) });
  }
}
