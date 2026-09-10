import { auth } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import { dbFirestore } from './firebase';
import { db } from '../db';
import type { TechnicalCatalog, TechnicalProject } from '../types';
import { armarCorreoPedido } from './correoProveedor';
import { leerConfigProveedor } from './configProveedor';

/**
 * El correo al proveedor: a quien va, y como se manda sin perderlo.
 *
 * La clave del servicio de correo vive SOLO en Vercel (`api/enviar-pedido.ts`). Desde el
 * navegador se llama a esa funcion con el token de Firebase, y el servidor comprueba que
 * quien pide sea el dueño. Si la clave viviera aca, estaria en el bundle publico.
 */

export interface CorreoEnCola {
  para: string[];
  copia: string[];
  asunto: string;
  cuerpo: string;
}

/**
 * A quien se le manda: a todos los usuarios con rol proveedor, con copia a Jhon.
 *
 * La copia no es cortesia: es su comprobante de QUE mando y CUANDO. Si mañana el proveedor
 * dice que nunca le llego, o que decia otra cosa, el correo esta en su bandeja.
 */
export async function destinatarios(): Promise<{ para: string[]; copia: string[]; nombre?: string }> {
  const yo = auth.currentUser?.email;
  const config = await leerConfigProveedor();

  // 1) La lista que Jhon escribio en Ajustes. Es la buena: quien recibe el pedido no tiene
  //    por que tener cuenta en la app.
  let para = config.correos;

  // 2) Si nunca la lleno, se cae a los usuarios con rol proveedor, que es como funcionaba
  //    antes. Asi nadie se queda sin correo por no haber configurado nada todavia.
  if (para.length === 0) {
    const snapshot = await getDocs(collection(dbFirestore, 'users'));
    para = snapshot.docs
      .map(d => d.data() as { email?: string; role?: string })
      .filter(u => u.role === 'proveedor' && u.email)
      .map(u => u.email!.trim());
  }

  // Que Jhon no se mande el pedido a si mismo como destinatario principal: el va en copia.
  para = para.filter(correo => correo.toLowerCase() !== (yo ?? '').toLowerCase());

  return { para, copia: yo ? [yo] : [], nombre: config.nombre };
}

/** Llama a la funcion de Vercel. Si tira, quien llama decide si reintenta o encola. */
export async function mandarCorreoPendiente(correo: CorreoEnCola): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Sin sesión iniciada');
  const idToken = await usuario.getIdToken();

  const r = await fetch('/api/enviar-pedido', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, ...correo }),
  });

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    let mensaje = `El correo no salió (${r.status})`;
    try {
      const j = JSON.parse(detalle) as { error?: string };
      if (j.error) mensaje = j.error;
    } catch { /* la respuesta no era JSON */ }
    throw new Error(mensaje);
  }
}

/**
 * Prepara el correo del pedido y lo manda. Si falla, queda EN LA COLA y se reintenta solo.
 *
 * Devuelve que paso, para poder decirselo a Jhon con la verdad: "salió" y "quedó esperando
 * señal" son cosas distintas y confundirlas es lo que hace que deje de confiar en el aviso.
 */
export async function enviarPedidoPorCorreo(
  project: TechnicalProject,
  catalog?: TechnicalCatalog,
  opciones: { esReenvio?: boolean } = {},
): Promise<{ estado: 'enviado' | 'en_cola'; para: string[]; motivo?: string }> {
  const { para, copia, nombre } = await destinatarios();
  if (para.length === 0) {
    return {
      estado: 'en_cola',
      para: [],
      motivo: 'No hay ningún correo de proveedor cargado. Ponelo en Ajustes → Correo al proveedor.',
    };
  }

  const { asunto, cuerpo } = armarCorreoPedido(project, catalog, {
    esReenvio: opciones.esReenvio,
    paraQuien: nombre || undefined,
  });
  const correo: CorreoEnCola = { para, copia, asunto, cuerpo };

  try {
    await mandarCorreoPendiente(correo);
    return { estado: 'enviado', para };
  } catch (e) {
    // A la cola, con la misma mecanica que las fotos: reintenta sola al volver la señal.
    await db.syncQueue.add({
      type: 'enviar_correo_proveedor',
      refId: `correo_${project.code}_${Date.now()}`,
      payload: correo,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: Date.now(),
    });
    return { estado: 'en_cola', para, motivo: e instanceof Error ? e.message : String(e) };
  }
}
