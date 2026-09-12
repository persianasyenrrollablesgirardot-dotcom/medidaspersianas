import { auth } from './firebase';
import type { Publicacion } from './publicarPedido';

/**
 * MANDA LA PUBLICACION AL BACKEND DE JUNO.
 *
 * La `service_role` del Supabase del Gerente vive SOLO en Vercel
 * (`api/campo/publicar.ts`). Desde el navegador se llama a esa funcion con el token de
 * Firebase y el servidor comprueba que quien pide sea el dueno. Si la llave viviera aca
 * estaria en el bundle publico, que lee cualquiera que abra la PWA — incluido el
 * proveedor, que tiene login.
 *
 * Si tira, quien llama decide: en la practica llama la cola (`syncQueue`), que reintenta
 * con espera creciente. Sin senal no se pierde nada, que es la unica forma de que esto
 * sirva mandando pedidos desde la obra.
 */
export async function mandarPublicacionPendiente(publicacion: Publicacion): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Sin sesión iniciada');
  const idToken = await usuario.getIdToken();

  const r = await fetch('/api/campo/publicar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ pedido: publicacion }),
  });

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`No se pudo publicar el pedido (${r.status}) ${detalle.slice(0, 200)}`);
  }
}
