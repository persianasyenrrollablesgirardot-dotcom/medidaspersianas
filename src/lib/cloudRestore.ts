import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { db } from '../db';
import { bajarTodo } from './cloudBackup';
import { restoreProjects } from './localFallbackStore';

/**
 * RECUPERACIÓN AUTOMÁTICA AL ENTRAR EN UN DISPOSITIVO VACÍO
 *
 * Si se reinstala la app (o se borran los datos del navegador), IndexedDB
 * arranca en cero y los proyectos "desaparecen", aunque estén en la nube. Antes
 * había que acordarse de ir a Ajustes → "Traer todo desde la nube". Nadie se
 * acuerda de eso justo cuando acaba de perder todo.
 *
 * Ahora, al iniciar sesión, si el dispositivo NO tiene ningún proyecto, se baja
 * lo que haya en la nube y listo. Sin botones.
 *
 * Tres candados:
 *  - Solo si hay CERO proyectos. Con datos locales no se toca nada: bajar y
 *    combinar en cada arranque gastaría datos móviles y podría pisar una
 *    edición hecha sin señal.
 *  - Solo el DUEÑO. `admin_projects` tiene los proyectos del admin con precios
 *    y datos personales; un proveedor con sesión no debe bajárselos al equipo.
 *  - `restoreProjects` combina por código y NUNCA borra.
 */

const OWNER_EMAIL = 'persianasyenrrollablesgirardot@gmail.com';

export function restaurarDeLaNubeSiEstaVacio() {
  const dejarDeEscuchar = onAuthStateChanged(auth, async usuario => {
    if (!usuario) return;
    dejarDeEscuchar();

    if (usuario.email !== OWNER_EMAIL) return;

    try {
      if ((await db.projects.count()) > 0) return;

      const remotos = await bajarTodo();
      if (remotos.length === 0) return;

      const r = await restoreProjects(remotos);
      const { default: toast } = await import('react-hot-toast');
      toast.success(
        `Se recuperaron ${r.added} proyectos desde la nube.`,
        { id: 'restauracion-nube', duration: 9000 },
      );
    } catch (error) {
      console.error('No se pudo recuperar de la nube', error);
      const { default: toast } = await import('react-hot-toast');
      toast.error(
        'Este dispositivo está vacío y no se pudo leer la nube. Revisá la señal y volvé a entrar.',
        { id: 'restauracion-nube', duration: 9000 },
      );
    }
  });
}
