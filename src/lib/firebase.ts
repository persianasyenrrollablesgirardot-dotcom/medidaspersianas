import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAyQFHSfPKDBbGfKuSzPXA3wXXfsAS5jbk",
  authDomain: "gestor-de-campo.firebaseapp.com",
  projectId: "gestor-de-campo",
  storageBucket: "gestor-de-campo.firebasestorage.app",
  messagingSenderId: "272743486881",
  appId: "1:272743486881:web:ceb457bac6f85de5e167e0",
  measurementId: "G-33EPF0PRD4"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/**
 * `ignoreUndefinedProperties` NO es un detalle: es lo que arregló el
 * "Error al enviar: invalid-argument" al mandar un proyecto al proveedor.
 *
 * Firestore rechaza el documento COMPLETO si alguna propiedad vale
 * `undefined` ("Unsupported field value: undefined", código
 * `invalid-argument`). Y la app crea `undefined` a propósito en varios lados:
 * `quickQuote: … : undefined` (ProjectEditor / projectStore), `planTemplate:
 * undefined` al pasar una ventana a modo simple, `manualArea: undefined` al
 * vaciar el m² manual.
 *
 * Antes no molestaba porque los proyectos del admin vivían en localStorage y
 * cada LECTURA era un `JSON.parse`, que borra las claves con `undefined`. Al
 * pasar los proyectos a IndexedDB (commit "almacenamiento blindado") las
 * lecturas salen del espejo en memoria / structured clone, que SÍ conservan
 * esas claves, y desde entonces el objeto llegaba a Firestore con `undefined`
 * adentro. Rompía las dos escrituras: `cloud_projects` (enviar a proveedor) y
 * `admin_projects` (respaldo automático, que quedaba fallando en la cola).
 *
 * Con este ajuste Firestore descarta esas claves — exactamente lo que hacía
 * `JSON.stringify` cuando esto funcionaba.
 */
export const dbFirestore = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});

// Create a secondary app instance for creating users without logging out the admin
export const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
export const secondaryAuth = getAuth(secondaryApp);
