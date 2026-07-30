import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initLocalStore } from './lib/localFallbackStore';
import { respaldoDiarioSiCorresponde } from './lib/autoBackup';
import { restaurarDeLaNubeSiEstaVacio } from './lib/cloudRestore';
import { startSync } from './lib/syncQueue';

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
  if ('caches' in window) {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
  }
}

/**
 * Le pide al navegador que NO desaloje los datos cuando el celular ande
 * justo de espacio. Sin esto, Android puede limpiar el almacenamiento de un
 * sitio web "por su cuenta". En una PWA instalada suele concederse solo.
 */
async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage?.persist) {
      const yaEsPersistente = await navigator.storage.persisted();
      if (!yaEsPersistente) {
        const concedido = await navigator.storage.persist();
        console.info(`Almacenamiento persistente: ${concedido ? 'concedido' : 'denegado'}`);
      }
    }
  } catch {
    /* no es crítico */
  }
}

/**
 * ARRANQUE
 *
 * El store se carga (y migra desde localStorage la primera vez) ANTES de
 * pintar la app. Es a propósito: si React montara primero, las pantallas
 * leerían un espejo vacío y cualquier guardado posterior escribiría sobre esa
 * nada. Justamente la forma en que se perdieron los datos.
 */
async function arrancar() {
  try {
    await initLocalStore();
  } catch (error) {
    console.error('No se pudo abrir el almacenamiento local', error);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  // Lo que no bloquea el primer pintado va después.
  void pedirAlmacenamientoPersistente();
  void respaldoDiarioSiCorresponde();
  // Sube lo que falte (reconciliador) y, si el equipo está vacío, baja lo que
  // haya en la nube. Las dos direcciones sin que haya que tocar un botón.
  startSync();
  restaurarDeLaNubeSiEstaVacio();
}

void arrancar();
