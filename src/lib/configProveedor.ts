import { doc, getDoc, setDoc } from 'firebase/firestore';
import { dbFirestore, auth } from './firebase';

/**
 * A QUE CORREOS SE LE MANDA EL PEDIDO AL PROVEEDOR.
 *
 * La primera version los sacaba de los usuarios con rol `proveedor` de la app, y eso estaba
 * MAL: quien recibe el correo no tiene por que tener una cuenta. Sorani necesita el correo,
 * no un login. Atarlo a los usuarios hacia que, si nadie la habia creado como usuaria, el
 * pedido se subiera pero el correo no le llegara a nadie — y en silencio.
 *
 * Se guarda en Firestore y no en el equipo a proposito: Jhon manda pedidos desde el celular
 * y desde el PC, y la lista tiene que ser la misma en los dos. Ademas el localStorage de su
 * PC ya se lleno una vez.
 */

const RUTA = { coleccion: 'config', documento: 'proveedor' };

export interface ConfigProveedor {
  /** A quien se le manda el pedido. Puede haber mas de uno. */
  correos: string[];
  /** Como saludarlo en el correo ("Buenas, Sorani."). Vacio = "Buenas." */
  nombre?: string;
}

export const VACIA: ConfigProveedor = { correos: [], nombre: '' };

export const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());

export async function leerConfigProveedor(): Promise<ConfigProveedor> {
  try {
    const snap = await getDoc(doc(dbFirestore, RUTA.coleccion, RUTA.documento));
    if (!snap.exists()) return VACIA;
    const d = snap.data() as Partial<ConfigProveedor>;
    return {
      correos: (d.correos ?? []).map(c => c.trim()).filter(correoValido),
      nombre: (d.nombre ?? '').trim(),
    };
  } catch {
    // Sin señal o sin permisos: se devuelve vacia y quien llama avisa. Nunca se inventa un
    // destinatario — mandarle un pedido al correo equivocado es peor que no mandarlo.
    return VACIA;
  }
}

export async function guardarConfigProveedor(config: ConfigProveedor): Promise<void> {
  if (!auth.currentUser) throw new Error('Iniciá sesión para guardar');
  await setDoc(
    doc(dbFirestore, RUTA.coleccion, RUTA.documento),
    {
      correos: config.correos.map(c => c.trim()).filter(correoValido),
      nombre: (config.nombre ?? '').trim(),
      actualizado: Date.now(),
    },
    { merge: true },
  );
}
