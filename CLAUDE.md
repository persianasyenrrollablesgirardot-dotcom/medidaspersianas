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

2. **NUNCA aconsejar a Jhon "Borrar datos de navegación / Borrar datos de la app / reinstalar la PWA" para arreglar caché.** Eso BORRA IndexedDB = **pierde los proyectos locales del admin** (que NO están respaldados en la nube salvo los enviados). Pasó y casi cuesta datos. **El método SEGURO** para forzar actualización es el botón **"Limpiar Caché y Forzar Actualización"** en Ajustes (admin) → `clearPwaCacheOnly()` que **solo borra el cache del SW/PWA, NO toca IndexedDB**. `resetLocalAppData()` SÍ borra todo (es el botón "Reiniciar app / Borrar todo"). **El PROVEEDOR no tiene Ajustes** (ruta admin-only): su equivalente es el botón **"Actualizar app · <versión>"** en el hero de su Dashboard, que llama al mismo `clearPwaCacheOnly()` y le muestra el sello de versión sin tener que buscarlo en la esquina. Sin ese botón quedaba atrapado en una versión cacheada, sin forma de salir ni de que se lo arreglaran a distancia.

3. **Sello de versión visible** en `src/components/Shell.tsx` (`APP_VERSION`, esquina superior derecha). **Bumpear en cada deploy** (ej: `-e` → `-f`). Sirve para que Jhon confirme de un vistazo si la PWA cargó la versión nueva o quedó cacheada (autoUpdate a veces tarda 1-2 reaperturas).

4. **Firestore rechaza el documento COMPLETO si una propiedad vale `undefined`** (código `invalid-argument`, "Unsupported field value: undefined"). La app crea `undefined` a propósito (`quickQuote` en ProjectEditor/projectStore, `planTemplate` al pasar a modo simple, `manualArea` al vaciarlo). Mientras los proyectos vivían en localStorage no molestaba porque cada lectura era un `JSON.parse`, que borra esas claves; al pasarlos a IndexedDB dejaron de borrarse y rompió a la vez "Enviar a Proveedor" y el respaldo automático. **Está resuelto con `ignoreUndefinedProperties: true` en `src/lib/firebase.ts` — NO quitar esa opción.**

5. **Pantalla NEGRA después de un deploy = archivo con hash que ya no existe.** Cada deploy cambia `index-<hash>.js`; si la PWA guardó un `index.html` viejo pide el `.js` viejo, que ya no está. El comodín de `vercel.json` reescribía TODO a `/index.html`, así que ese pedido devolvía **HTML con 200 en vez de 404** → el navegador esperaba un módulo JS, recibió HTML y abortó → React nunca monta. **Dos defensas puestas (no quitar):** (a) `vercel.json` excluye `/assets` del comodín (`"source": "/((?!assets/).*)"`) — `vercel.json` NO admite comentarios ni `$comment`, el schema lo rechaza; (b) `index.html` tiene una **pantalla de rescate** en HTML+JS clásico (corre aunque el bundle falle): a los 9s sin montar ofrece "Reparar y volver a abrir", que desregistra los SW y borra **solo Cache Storage**, nunca IndexedDB → ver gotcha 2.

6. **Facturación IA usa Claude** (`src/lib/facturador/claude.ts`, modelo `claude-haiku-4-5` que SÍ lee PDF). Key en `localStorage.CUSTOM_CLAUDE_API_KEY` o `VITE_CLAUDE_API_KEY`. El `.env.local` tiene `VITE_GEMINI_API_KEY` que NO se usa (histórico).

## Facturas Safra — el archivo lo escribe un MODELO, no un sistema (09-sep-2026)

El 8 y el 9 de septiembre no entró nada a la nube. Causa: **Gemini le cambió el nombre a la
clave que trae los pedidos, y le pone el número del día adentro** — o sea que cambia todos los
días:

```
07-sep  { pedidos: [ ...7 con detalle completo... ] }
08-sep  { novedades_dia_08_septiembre: { pedidos_recientes: [...] },
          pedidos_facturados_anteriores_septiembre: [...resumidos...] }
09-sep  { novedad_dia_09_septiembre: { ...UN pedido, no una lista... },
          pedidos_anteriores_septiembre: [...resumidos...] }
```

Y además cambió QUÉ manda: hoy solo los del día vienen con detalle; los anteriores llegan
resumidos (id, fecha, total y nada más).

**Pero el formato era solo la MITAD.** La otra mitad era el horario: el disparador estaba a
las **7-8 a.m.** y Gemini genera el archivo cerca de las **10** (`corte_hora` lo dice: 10:00 el
08-sep, 10:25 el 09-sep). O sea que el script corria tres horas antes de que existiera el
archivo del dia, y siempre miraba el de ayer. Las dos causas juntas dan "nunca entro nada".

**Regla:** cuando algo automatico "no trae nada", mirar la HORA del disparador contra la hora
en que se genera el dato, antes de culpar al parser. El disparador quedo a las **11 a.m.**

**Reglas que salieron de esto:**

- **Los pedidos se buscan por FORMA, no por nombre de clave.** `normalizarReporte()` recorre el
  JSON entero y junta todo objeto que tenga `pedido_id`, esté donde esté y se llame como se
  llame el contenedor. Buscar `pedidos` por nombre se rompe mañana otra vez.
- **El Apps Script solo comprueba que sea un objeto JSON.** Antes exigía la clave `pedidos` y
  por eso descartó los dos archivos en silencio — hizo lo correcto con una regla equivocada.
  El script mueve bytes; quien decide si sirve es la app, que se puede probar.
- **Un dato ausente es `null`, NUNCA 0.** Fue un bug real y grave: `aNumero()` devolvía 0
  cuando el campo no venía, y como 0 no es "vacío", el resumen del día 9 **pisaba con cero los
  subtotales del día 7** y disparaba 24 avisos de cambio falsos. `FacturacionSafra` ahora tiene
  `subtotal/iva/total: number | null` y `pesos(null)` muestra "—", no "$ 0".
- **"Pendiente de emisión por Safra" no es un número de factura.** Guardarlo como tal haría que
  un pedido facturado de verdad después no se reconociera.
- **El descuadre solo se compara si el resumen habla de lo mismo que el archivo.** Desde el 08
  el resumen es "acumulado de septiembre" y el archivo trae otra cosa: compararlos daría una
  alarma roja permanente, y a la semana Jhon dejaría de mirarla. Peor que no avisar es avisar
  siempre.

Los archivos reales viven en `src/lib/safra/ejemplos/` y `npm run probar:safra` corre contra
ellos (el test los lee por NOMBRE, no recorre la carpeta: agregar uno no rompe las pruebas que
ya están). **Si aparece un formato nuevo, se agrega el archivo ahí y se ve qué se rompe.**

> **Y apareció un cuarto formato el 10-sep** — que ni siquiera trae pedidos. Ver la sección
> siguiente: el script de Google funcionó, el archivo llegó, y aun así no entró nada.

## Facturas Safra — investigacion del 10-sep-2026 (SIN ARREGLAR, a proposito)

Jhon: "no me suben la actualizacion de las facturas y el script de Google se esta ejecutando
correctamente". Tenia razon en las dos mitades: **el script anda bien y aun asi no entro nada.**
Se investigo y NO se toco codigo — se espera al archivo de manana, con pedidos de verdad, para
confirmar cual de los dos problemas de abajo es el que hay que resolver.

### Lo que se verifico (datos reales de Supabase, 10-sep 15:10)

| eslabon | estado |
|---|---|
| Disparador 11 a.m. | OK, corrio |
| Apps Script lee Drive y sube el crudo | OK, subio `id=10` |
| `safra_reportes` guarda el archivo | OK, intacto |
| `validarReporte` / `normalizarReporte` | **FALLA: 0 pedidos** |
| Volcado a `safra_pedidos` | no corrio |
| Aviso a Jhon | **silencio total** |

La fila subida: `id=10`, `reporte_safra_2026-09-10.json`, `fecha_reporte=2026-09-10`,
`subido_en` 16:50 UTC = **11:50 a.m. COT**, `procesado_en=null`, `pedidos_en_archivo=null`.
El archivo dice `corte_hora: "10:55:00-05:00"`. **El arreglo del horario funciono**: Gemini
genero a las 10:55, el script corrio a las 11:50.

> **Como saber quien subio una fila:** `pedidos_en_archivo` en `null` = la puso el **Apps
> Script** (no sabe donde estan los pedidos, ver el comentario en `docs/apps-script-safra.js`).
> Con numero = la puso la **app** (importacion manual). Por eso se sabe que `id=10` es la
> primera fila que el script metio solo, y que las de los dias 7, 8 y 9 (7/12/13) las habia
> metido Jhon a mano. Ese campo es el unico testigo del origen — no quitarlo.

### Causa 1 — el archivo del 10-sep no tiene NI UN `pedido_id`

Gemini volvio a cambiar, pero esta vez **no cambio el nombre de la clave: cambio de que se
trata el informe**. El 10-sep mando otra cosa:

```
{ fecha_reporte, corte_hora, cliente, nit_cliente, empresa_proveedor,
  auditoria_abonos_pse:                  { detalle_transacciones: [3 pagos PSE], total 6.800.000 },
  balance_general_septiembre:            { total_facturado, total_abonos, total_pendiente, ... },
  inconsistencias_facturacion_y_pedidos: [ { tipo, descripcion } ] }
```

Cero pedidos. `normalizarReporte()` busca por FORMA (todo objeto con `pedido_id`) y no hay
ninguno, asi que `validarReporte()` devuelve:

```
{"ok":false,"motivo":"No encontre ningun pedido con `pedido_id` en el archivo."}
```

`procesarPendientes()` entonces hace `console.warn` + `continue` y **no lo marca procesado**,
que es lo correcto: el crudo queda intacto y a la vista para reprocesarlo. **Buscar por forma
no fallo — el archivo de verdad no traia pedidos.**

El archivo esta guardado en `src/lib/safra/ejemplos/2026-09-10.json`. **OJO:** es la
reconstruccion desde el `jsonb` de Supabase, no los bytes originales, asi que su `huella()`
NO coincide con el `hash` de la fila (`a6bbe05f-7e7`). Sirve para probar el parser, no para
probar la deduplicacion.

### Causa 2 — la actualizacion de factura SI vino, pero como prosa

Lo que Jhon estaba esperando estaba en el archivo. Adentro de
`inconsistencias_facturacion_y_pedidos[0].descripcion`:

> "Safra emitio hoy 10/09 la factura **PPAL16082682** por $435.055,67 para el pedido
> **P-1156386** ('vanessa BOGOTA'). El pedido identico **P-1156381** quedo pendiente en el
> sistema sin facturar. Requiere anulacion formal para evitar doble produccion."

Y en la base `P-1156386` tiene `factura_numero: null`. O sea: **el dato existe, pero como frase
adentro de un texto libre, no como campo.** Ningun parser que busque por forma lo puede sacar
de ahi — habria que leerlo con un modelo, que es justo lo que este modulo evita a proposito.

### Causa 3 — el fallo es MUDO, y esto es lo que lo hace caro

Esta es la parte que hay que arreglar pase lo que pase manana. `procesarPendientes()` avisa por
`console.warn`, y despues `FacturasSafra` lee `safra_pedidos`, encuentra las 13 filas viejas y
hace `setAviso(null)` → origen "nube", todo verde. **Sin toast, sin banner, sin nada.** Desde
afuera es identico a "hoy Safra no facturo nada".

Por eso Jhon no supo que habia un archivo esperando desde las 11:50 de la manana, y por eso
llego a pensar que el problema era el script de Google. Un reporte rechazado tiene que
**verse en la pantalla**, con el nombre del archivo y el motivo.

**Regla, hermana de la de la hora:** cuando algo automatico "no trae nada", **mirar primero si
llego el dato** (`safra_reportes`) y recien despues por que no se aplico. Las dos veces que
esto fallo, el sintoma fue el mismo — "no entra nada" — y la causa fue distinta.

### Como repetir el diagnostico manana (3 consultas)

```bash
KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2- | tr -d '\r')
URL=$(grep '^VITE_SUPABASE_URL='      .env.local | cut -d= -f2- | tr -d '\r')

# 1. Llego el archivo? Quien lo subio? Se proceso?
curl -s "$URL/rest/v1/safra_reportes?select=id,archivo,fecha_reporte,pedidos_en_archivo,subido_en,procesado_en&order=subido_en.desc&limit=10" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# 2. Que trae adentro (cambiar el id)
curl -s "$URL/rest/v1/safra_reportes?id=eq.10&select=json_crudo" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# 3. Que hay guardado hoy
curl -s "$URL/rest/v1/safra_pedidos?select=pedido_id,factura_numero,factura_fecha,total&order=factura_fecha.desc" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Y para correr el validador real contra un crudo, sin levantar la app (`tsx` lee `.ts` directo,
pero **el archivo tiene que estar en la raiz del repo** o el import relativo no resuelve):

```js
// probar.tmp.mjs en la raiz  ->  npx tsx probar.tmp.mjs
import fs from 'fs';
import { validarReporte } from './src/lib/safra/ingesta.ts';
const v = validarReporte(JSON.parse(fs.readFileSync('src/lib/safra/ejemplos/2026-09-10.json', 'utf8')));
console.log(v.ok ? v.reporte.pedidos.length + ' pedidos' : v.motivo);
```

### Lo que falta decidir (es de Jhon, no de Claude)

1. Este informe de abonos/inconsistencias **reemplazo** al de pedidos, o Gemini ahora genera
   **dos archivos distintos** y el de pedidos no se genero / esta en otro lado? Eso decide si
   se le ensena a la app este formato nuevo o si se arregla el prompt de Gemini.
2. Los abonos PSE y las inconsistencias, entran al modulo como informacion propia (plata que
   se pago, pedidos duplicados que hay que anular) o eso se mira aparte?

## Correo al proveedor al enviar un pedido (09-sep-2026)

Al tocar "Enviar a Proveedor" sale un correo **escrito**, no un adjunto ni una tabla, con
todos los datos técnicos del pedido. Con copia a Jhon.

- **Lo escribe código, no la IA.** `src/lib/correoProveedor.ts`. Jhon lo pidió "sin omitir
  ninguna información", y en una orden de producción un dato que falta es una persiana mal
  fabricada. Un modelo redacta más lindo pero a veces se saltea una línea; un generador
  determinista recorre todo y siempre dice lo mismo. **No cambiarlo por IA.**
- **Qué entra y qué no** es el mismo criterio que `SupplierProjectView`: todo el dato técnico,
  y NINGÚN precio ni dato personal del cliente salvo el nombre. Lo `isExcluded` tampoco viaja.
- **Lo que falta se dice.** Si una persiana no tiene ancho, el correo escribe
  "ANCHO SIN REGISTRAR". Callarlo sería peor: la fabricaría con lo que le parezca.
- `npm run probar:correo` comprueba **campo por campo** que cada valor aparece, y que la
  dirección, el teléfono, el documento y todos los precios NO aparecen. Esa promesa hay que
  poder demostrarla, no prometerla.
- **El correo va DESPUÉS de subir a la nube y en su propio `try`.** Lo que hace que el
  proveedor pueda trabajar es el pedido en la nube; si el correo falla, el pedido ya está y
  lo ve al entrar. Y un problema de correo nunca se muestra como "error al enviar el pedido":
  confundirlos hace que Jhon vuelva a apretar el botón creyendo que no se envió.
- **Sin señal no es un error.** El correo entra en la MISMA cola que las fotos
  (`syncQueue`, tipo `enviar_correo_proveedor`) y sale solo cuando vuelve internet. Jhon manda
  pedidos desde la obra.
- **La clave del correo vive SOLO en Vercel** (`api/enviar-pedido.ts`). Solo el DUEÑO puede
  llamar al endpoint: se verifica el token de Firebase contra `accounts:lookup` y se compara
  con `OWNER_EMAIL`. Sin eso, cualquiera con la URL mandaría correos desde la dirección del
  negocio. Falla CERRADA si faltan las variables.
- ⚠️ **`vercel.json` ahora excluye `/api` del comodín** (`/((?!assets/|api/).*)`). Sin eso
  Vercel le devuelve a `/api/...` el HTML de la app en vez de ejecutar la función, y no se
  entiende por qué. Es la misma trampa que causó la pantalla negra con `/assets`.

**Falta para encenderlo:** `RESEND_API_KEY` y `CORREO_REMITENTE` en Vercel (Production).
Mientras no estén, el endpoint responde 503 diciendo exactamente eso.

## Papelera — proyectos vs. SUB-elementos (dos mecanismos distintos, a propósito)

- **Proyectos:** soft-delete en su propia tabla. `trashFallbackProject` pone `deletedAt` y las listas filtran por `deletedAt === 0`. Restaurar = poner `deletedAt: 0`.
- **Sub-elementos (espacio / ventana / persiana / foto):** el elemento **SALE** del proyecto (igual que antes) y su **copia completa** va a la tabla Dexie **`trash`** (v5), con el contexto para reinsertarlo: `projectId`, `spaceId`, `windowId` e `index` original. `src/lib/trashStore.ts`.
- **Por qué NO se marcan con `deletedAt` como los proyectos:** un espacio marcado seguiría dentro de `project.spaces` y habría que filtrarlo en las ~30 rutas que recorren el proyecto (totales, m², cotización, factura, PDF de fabricación, orden del proveedor, `cloudSync`, respaldos). Con que UNA se olvide, el cliente paga un espacio borrado o la fábrica lo produce. **No cambiar a soft-delete in-place.**
- **Regla del flujo de borrado (respetarla en cualquier borrado nuevo):** `confirm()` que diga QUÉ se lleva → `trashX(...)` → si devuelve `false`, **no borrar nada** y avisar → recién ahí sacar el elemento del proyecto.
- **Fotos:** el Blob de `photos` NO se borra al mandar algo a la papelera. Se borra recién en el borrado definitivo y **solo si ninguna otra copia lo usa** (`photoIdsEnUso`) — los proyectos duplicados comparten `photoId` a propósito.
- **La purga automática a los 40 días está DESACTIVADA** (`cleanupExpiredProjects` no hace nada, ver la nota en `db.ts`). La Papelera decía "se elimina automaticamente en N dias" y era mentira: ese texto ya no está.
- Caso borde ya cubierto: en **Cotización rápida**, borrar la última persiana de una ventana se lleva la ventana entera. Pasaba en silencio; ahora se avisa y lo que se guarda en la papelera es la **ventana completa**.
- `src/pages/ProjectEditor.tsx` **no está ruteado** (código muerto). Sus botones de borrar siguen sin aviso ni papelera. Si alguna vez se vuelve a rutear, hay que wirearlo igual que las demás pantallas.

## Dashboard del PROVEEDOR (qué es suyo y qué es del admin)

- El proveedor lee `cloud_projects` y esos docs son **`TechnicalProject` crudos**, NO `ProjectSummary`: **no traen** `spacesCount`, `windowsCount`, `solutionsCount`, `totalAreaM2`, `systemTotals`, `totalEstimate`. Cualquier cosa del Dashboard que use esos campos sale vacía para él. Por eso existe `projectCounts()`, que los calcula del árbol cuando no vienen.
- **Firestore devuelve los documentos ordenados por su ID (el `code`)** — un orden sin sentido para el proveedor. `Dashboard` los ordena por `updatedAt` desc al recibirlos. **No quitar ese `.sort()`**, o los pedidos nuevos vuelven a aparecer mezclados entre los viejos.
- **El `status` del proyecto (`ready_for_fabrication`) es del ADMIN, no del proveedor.** Para él "pendiente/completado" se calcula de `supplier_statuses` (`supplierProgress()`). Las estadísticas y el filtro de avance del proveedor usan eso.
- `supplierProgress()` **debe ignorar espacios/ventanas excluidos**, con el mismo criterio que `SupplierProjectView`: lo excluido no se le muestra al proveedor, así que no lo puede marcar. Si se cuenta, el pedido queda "3/5 gestionadas" para siempre y clavado en el filtro "Pendientes" sin nada que marcar.
- `useAllSupplierStatuses(enabled)` abre **un** listener para toda la colección `supplier_statuses`. Antes se abría uno por tarjeta (`useSupplierStatuses` dentro del badge) y solo servía para pintar el badge — no se podía ordenar ni filtrar por avance. `useSupplierStatuses` sigue existiendo para la vista de un pedido.
- **Búsqueda:** al proveedor NO se le busca por teléfono ni dirección (datos personales; del cliente solo ve el nombre). Se le busca por cliente, código, nombre de espacio, ventana y sistema.
- ⚠️ **`styles.css` apaga TODOS los `input`/`select`/`textarea` bajo `.role-proveedor`** (`pointer-events: none` + fondo/borde transparentes, línea ~810). Es el "modo solo lectura" que impide que el proveedor edite el proyecto, y viene de cuando su pantalla era la del admin disfrazada. **Esa regla se llevó puestos los filtros de su Dashboard** (búsqueda + los tres selects): quedaban visibles pero MUERTOS al toque — se veían bien, se tocaban y no pasaba nada. Arreglado con una excepción acotada a `.filters-panel` (que solo existe en el Dashboard) que les devuelve `pointer-events: auto` y su aspecto. **Si alguna vez se le agrega al proveedor otro control de consulta fuera de `.filters-panel`, hay que acordarse de esta regla o va a nacer muerto.**
- **PENDIENTE / decisión de Jhon:** `cloudSync` sube el proyecto entero, así que el documento de `cloud_projects` **sí contiene** `address`, `contactPhone` y `clientDocument`, y el Dashboard del proveedor lo cachea completo en `localStorage 'cloud_projects_cache'`. No se muestran en pantalla, pero están en su dispositivo. **No se limpió** porque `rescue.ts::scanNube()` usa `cloud_projects` como fuente de rescate del admin y perdería esos campos. Si se decide limpiarlo, hay que mover el rescate a `admin_projects` primero.

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
- `src/lib/trashStore.ts` — papelera de sub-elementos (espacio/ventana/persiana/foto).
- `src/pages/ProjectTrash.tsx` — Papelera con dos pestañas: Proyectos / Elementos.
