# Configurar Supabase Storage para las fotos

Las **fotos de evidencia** se suben a Supabase Storage. Los **datos técnicos**
(medidas, clientes, cotizaciones) siguen yendo a Firestore, donde ya está el
Auth y el flujo del proveedor.

Sin estos pasos la app **funciona igual**: las fotos se guardan en el celular y
quedan en cola esperando. Cuando el bucket exista, suben solas.

---

## 1. Crear el bucket

Panel de Supabase → proyecto `dnsyyvtznkllneyuopoa` → **Storage** → **New bucket**

- **Name:** `evidencias`
- **Public bucket:** ✅ **activado**

> Se usa bucket público a propósito: la app arma la URL de la foto directamente
> (`/storage/v1/object/public/evidencias/...`) sin pedir firma. Las fotos son de
> ventanas y paredes, no datos sensibles. Si más adelante querés cerrarlo, hay
> que cambiar `urlPublica()` en `src/lib/supabasePhotos.ts` por URLs firmadas.

## 2. Permitir que la app escriba

Panel → **SQL Editor** → pegar y ejecutar:

```sql
-- Subir fotos con la clave anónima (la que usa la app en el celular).
create policy "app_campo_juno_sube_evidencias"
on storage.objects for insert
to anon
with check (bucket_id = 'evidencias');

-- Reemplazar una foto ya subida (la app manda x-upsert).
create policy "app_campo_juno_actualiza_evidencias"
on storage.objects for update
to anon
using (bucket_id = 'evidencias')
with check (bucket_id = 'evidencias');

-- Leer las fotos.
create policy "app_campo_juno_lee_evidencias"
on storage.objects for select
to anon
using (bucket_id = 'evidencias');
```

## 3. Variables de entorno

Ya están en `.env.local` para desarrollo local:

```
VITE_SUPABASE_URL=https://dnsyyvtznkllneyuopoa.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_BUCKET=evidencias
```

**Falta cargarlas en Vercel** (proyecto `gestordecampo`), o en producción las
fotos no van a subir:

```bash
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel env add VITE_SUPABASE_BUCKET production
```

## 4. Comprobar

Abrí la app → **Ajustes → 🛡️ Respaldos y nube**. Con el bucket creado y las
variables cargadas, "Copia en la nube" debería quedar en **Al día** y el
contador de pendientes bajar a cero.

Si algo falla, el semáforo arriba a la izquierda se pone rojo y se puede tocar
para reintentar. Nada se descarta: una subida fallida queda en cola.

---

## Reglas de Firestore

El respaldo de proyectos usa la colección nueva `admin_projects`. Las reglas
actuales (`allow read, write: if request.auth != null`) ya la cubren.

> ⚠️ Si el proyecto Firebase se creó en **modo prueba**, esas reglas **vencen a
> los 30 días** y Firebase bloquea toda la nube (`permission-denied`). Ya pasó
> en julio de 2026. Los datos no se borran, quedan bloqueados. Revisá que las
> reglas estén publicadas sin fecha de vencimiento.
