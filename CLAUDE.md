# App_Tecnica_Campo_Juno — contexto del proyecto

PWA de **levantamiento técnico de campo** para Fábrica de Cortinas Girardot (persianas/cortinas, Girardot, Colombia). Captura datos técnicos de terreno (proyectos → espacios → ventanas → soluciones técnicas), cotización rápida opcional, y **envío de órdenes de producción a un proveedor/fábrica**. Incluye un módulo de **Facturación con IA** (Claude) y **Contabilidad**.

- Stack: **React + TypeScript + Vite + Dexie (IndexedDB) + Firebase (Auth + Firestore)**. PWA con `vite-plugin-pwa` (`registerType: 'autoUpdate'`, `skipWaiting`, `clientsClaim`).
- **Es repo git.** Remoto: `github.com/persianasyenrrollablesgirardot-dotcom/medidaspersianas.git` (rama `main`).
- **Despliegue:** `npx vercel --prod --yes` (proyecto Vercel `gestordecampo`, org `persianasyenrrollablesgirardot-dotcoms-projects`). NO usar `--prebuilt`. URL: https://gestordecampo.vercel.app
- Moneda SIEMPRE COP. Idioma español (Colombia).

## Arquitectura de datos (CLAVE — origen de muchos malentendidos)

- **Datos del ADMIN = LOCALES por dispositivo.** Los proyectos se guardan en **Dexie/IndexedDB del navegador** (`saveProject` → `db.projects.put`). Lo que creás en el celular vive en el celular; lo que creás en el PC vive en el PC. **NO hay backup en la nube de todos los proyectos.**
- **La NUBE (Firestore `cloud_projects`) solo tiene los proyectos ENVIADOS al proveedor.** El admin marca `sentToSupplier=true` (botón "Enviar a Proveedor" en ProjectDetail) → `cloudSync.syncProjectToCloud` sube el proyecto completo a Firestore. "Retirar del Proveedor" → lo borra de la nube.
- El **proveedor** (`role: 'proveedor'`) lee `cloud_projects` desde su Dashboard (`getDocs`), lo cachea en `localStorage 'cloud_projects_cache'`, y `useFallbackProject` lo lee de ahí.
- `cloudSync` sube TODOS los datos técnicos; **solo quita las imágenes de evidencia** (`evidence[].dataUrl = ''`) por el límite de 1MB de Firestore. Las fotos de evidencia NO llegan al proveedor.

## Roles (Auth) — `src/components/AuthContext.tsx`

- Dos roles: **`admin`** (el dueño) y **`proveedor`**. El rol se lee del doc Firestore `users/{uid}`.
- **El email del DUEÑO `persianasyenrrollablesgirardot@gmail.com` SIEMPRE es admin** (hardcodeado, no depende de Firestore ni de la red). Los demás emails por defecto `proveedor`.
- Rutas: **todas las pantallas de edición del proyecto son admin-only** (`ProtectedRoute allowedRoles={['admin']}` en `App.tsx`). El proveedor SOLO ve: Dashboard (`/`) + Orden de Producción (`/project/:id/supplier-view`) + PDF de Fabricación.

## Qué ve el PROVEEDOR (spec DEFINITIVO — NO reducir)

Vista: **`src/pages/SupplierProjectView.tsx`** — "Orden de Producción" plana, agrupada por espacio, con botón "Marcar como Gestionado" (tiempo real vía Firestore `supplier_statuses`).

**El proveedor DEBE ver TODOS los datos técnicos**, organizados por secciones: tipo de persiana, medidas, tela, color, instalación, operación, lado del mando, montaje, superficie, apertura, forma, **campos personalizados**, **detalles de fabricación** (tubo/soporte/bandó/cadena/perfil inferior), **tramos/divisiones**, accesorios, motorización, **mantenimientos/servicios** (sin precio), observaciones, alertas técnicas. Incluye ítems de mantenimiento.

**El proveedor NO debe ver:** datos personales del cliente (dirección, teléfono, documento) — **solo el NOMBRE como referencia** — ni **precios/valores en pesos** (ni por ítem, ni mantenimientos, ni totales).

> ⚠️ Ojo: en junio-2026 se intentó "restaurar una vista reducida" y fue un ERROR — el proveedor sí necesita todos los datos técnicos. El único filtro es: sin datos personales (menos el nombre) y sin precios.

## GOTCHAS CRÍTICOS (leer antes de tocar nube o de dar instrucciones a Jhon)

1. **Reglas de Firestore en MODO PRUEBA EXPIRAN a los 30 días.** El proyecto Firebase (`gestor-de-campo`) se creó el 17-jun-2026; ~17-jul las reglas vencieron y Firebase bloqueó TODA la nube → síntoma: "nube vacía" + "los datos no se pueden cargar" + error `permission-denied`. **Los datos NO se borran, quedan bloqueados.** Fix: Firebase Console → Firestore → Rules → publicar reglas que permitan acceso autenticado (`allow read, write: if request.auth != null;`). El error de nube ahora muestra el motivo real (`e.code`) en el toast del Dashboard.

2. **NUNCA aconsejar a Jhon "Borrar datos de navegación / Borrar datos de la app / reinstalar la PWA" para arreglar caché.** Eso BORRA IndexedDB = **pierde los proyectos locales del admin** (que NO están respaldados en la nube salvo los enviados). Pasó y casi cuesta datos. **El método SEGURO** para forzar actualización es el botón **"Limpiar Caché y Forzar Actualización"** en Ajustes (admin) → `clearPwaCacheOnly()` que **solo borra el cache del SW/PWA, NO toca IndexedDB**. `resetLocalAppData()` SÍ borra todo (es el botón "Reiniciar app / Borrar todo").

3. **Sello de versión visible** en `src/components/Shell.tsx` (`APP_VERSION`, esquina superior derecha). **Bumpear en cada deploy** (ej: `-e` → `-f`). Sirve para que Jhon confirme de un vistazo si la PWA cargó la versión nueva o quedó cacheada (autoUpdate a veces tarda 1-2 reaperturas).

4. **Firestore rechaza el documento COMPLETO si una propiedad vale `undefined`** (código `invalid-argument`, "Unsupported field value: undefined"). La app crea `undefined` a propósito (`quickQuote` en ProjectEditor/projectStore, `planTemplate` al pasar a modo simple, `manualArea` al vaciarlo). Mientras los proyectos vivían en localStorage no molestaba porque cada lectura era un `JSON.parse`, que borra esas claves; al pasarlos a IndexedDB dejaron de borrarse y rompió a la vez "Enviar a Proveedor" y el respaldo automático. **Está resuelto con `ignoreUndefinedProperties: true` en `src/lib/firebase.ts` — NO quitar esa opción.**

5. **Pantalla NEGRA después de un deploy = archivo con hash que ya no existe.** Cada deploy cambia `index-<hash>.js`; si la PWA guardó un `index.html` viejo pide el `.js` viejo, que ya no está. El comodín de `vercel.json` reescribía TODO a `/index.html`, así que ese pedido devolvía **HTML con 200 en vez de 404** → el navegador esperaba un módulo JS, recibió HTML y abortó → React nunca monta. **Dos defensas puestas (no quitar):** (a) `vercel.json` excluye `/assets` del comodín (`"source": "/((?!assets/).*)"`) — `vercel.json` NO admite comentarios ni `$comment`, el schema lo rechaza; (b) `index.html` tiene una **pantalla de rescate** en HTML+JS clásico (corre aunque el bundle falle): a los 9s sin montar ofrece "Reparar y volver a abrir", que desregistra los SW y borra **solo Cache Storage**, nunca IndexedDB → ver gotcha 2.

6. **Facturación IA usa Claude** (`src/lib/facturador/claude.ts`, modelo `claude-haiku-4-5` que SÍ lee PDF). Key en `localStorage.CUSTOM_CLAUDE_API_KEY` o `VITE_CLAUDE_API_KEY`. El `.env.local` tiene `VITE_GEMINI_API_KEY` que NO se usa (histórico).

## Cómo trabajar acá (aprendizajes de sesión)

- Cuando Jhon diga "esto funcionaba y se rompió / qué hiciste": **análisis forense de git PRIMERO** (`git log --follow`, `git show <commit>`, recuperar versión vieja con `git show <commit>~1:<ruta>`), y verificar despliegues con `vercel ls` antes de afirmar. NO interrogar para diagnosticar; solo preguntar decisiones de NEGOCIO (qué debe ver el proveedor, precios, garantías).
- Auditar el flujo COMPLETO antes de dar por cerrado un cambio (no parchar una pantalla y dejar otras). Ej: la vista del proveedor tiene varias superficies (Dashboard, Orden de Producción, PDF de Fabricación, y las rutas de edición que había que bloquear).
- No puedo recibir fotos/capturas por la consola — diagnosticar desde el código.

## Mapa de archivos clave

- `src/components/AuthContext.tsx` — roles (dueño siempre admin).
- `src/App.tsx` — rutas + guardias de rol.
- `src/lib/cloudSync.ts` — sube proyecto enviado a Firestore (quita evidencia).
- `src/lib/supplierStatus.ts` — "gestionado" por solución (Firestore `supplier_statuses`, tiempo real).
- `src/pages/SupplierProjectView.tsx` — lo que ve el proveedor (todos los datos técnicos, sin personales ni precios).
- `src/pages/Dashboard.tsx` — lista admin (local) vs proveedor (nube).
- `src/pages/ProjectDetail.tsx` — enviar/retirar del proveedor.
- `src/lib/firebase.ts` — config Firebase (proyecto `gestor-de-campo`).
- `src/db.ts` — Dexie + `resetLocalAppData` (destructivo) / `clearPwaCacheOnly` (seguro).
- `src/types.ts` — modelo de datos (TechnicalProject/Solution/Window, etc.).
- `src/lib/facturador/claude.ts` — IA de facturación (Claude).
