-- ============================================================================
-- Modulo Facturas Safra — tablas en `dnsyyvtznkllneyuopoa`
--
-- Pegar TAL CUAL en: panel de Supabase -> SQL Editor -> Run.
-- Es idempotente: se puede correr dos veces sin romper nada.
--
-- CONTEXTO IMPORTANTE PARA QUIEN TOQUE ESTO DESPUES:
-- El JSON de origen lo genera GEMINI, no un sistema. O sea que el mismo pedido
-- puede volver manana con un campo menos o con un numero distinto porque el
-- modelo lo leyo diferente. Todo el diseno de abajo esta pensado para eso:
--   1. el archivo crudo se guarda ENTERO antes de interpretarlo,
--   2. la identidad es `pedido_id` (no la factura),
--   3. nunca se borra nada — a `anon` ni siquiera se le da permiso de DELETE,
--   4. los cambios de plata quedan registrados en `safra_cambios`.
-- ============================================================================

-- ── 1. El archivo tal cual llego ────────────────────────────────────────────
-- La red de seguridad real: si manana la interpretacion resulta estar mal, los
-- datos originales de cada dia siguen intactos y se puede reprocesar todo.
create table if not exists public.safra_reportes (
  id                bigserial primary key,
  archivo           text        not null,
  fecha_reporte     date,
  generado_en       timestamptz,
  -- Huella del contenido. Si el archivo de hoy es identico al de ayer, el
  -- unique lo rebota y no se procesa de nuevo. Idempotencia en la puerta.
  hash              text        not null unique,
  json_crudo        jsonb       not null,
  pedidos_en_archivo integer,
  subido_en         timestamptz not null default now(),
  -- null = llego pero todavia no se volco a pedidos/productos.
  procesado_en      timestamptz
);
create index if not exists safra_reportes_pendientes
  on public.safra_reportes (subido_en) where procesado_en is null;

-- ── 2. Pedidos ──────────────────────────────────────────────────────────────
-- La clave es `pedido_id`, NO `factura_numero`. El pedido es lo que no se
-- puede perder; la factura es un dato suyo. Si algun dia una factura cubre dos
-- pedidos, o un pedido se re-factura, no se pisan entre si.
create table if not exists public.safra_pedidos (
  pedido_id                text primary key,
  referencia_personalizada text,
  factura_numero           text,
  factura_fecha            date,
  forma_pago               text,
  subtotal                 numeric(14,2),
  iva                      numeric(14,2),
  total                    numeric(14,2),
  visto_primera_vez        timestamptz not null default now(),
  visto_ultima_vez         timestamptz not null default now(),
  -- El pedido crudo del ultimo reporte donde aparecio, por si hace falta algo
  -- que todavia no tiene columna propia.
  datos                    jsonb
);
create index if not exists safra_pedidos_factura on public.safra_pedidos (factura_numero);
create index if not exists safra_pedidos_fecha   on public.safra_pedidos (factura_fecha desc);

-- ── 3. Piezas ───────────────────────────────────────────────────────────────
-- Los 11 campos que trae TODA pieza van en columnas. El resto cambia segun el
-- sistema de persiana (una Vertical trae cantidad_lamas y pesa_lama; un Panel
-- Japones trae cenefa y color_cordon; una Enrollable Premium trae cover_light)
-- y va entero en `extra`. Asi, un campo NUEVO de Safra entra solo, sin
-- migracion y sin perderse.
create table if not exists public.safra_productos (
  pedido_id     text    not null references public.safra_pedidos(pedido_id) on delete cascade,
  item          integer not null,
  tipo          text,
  tela          text,
  cantidad      numeric(10,2),
  ancho_m       numeric(10,3),
  alto_m        numeric(10,3),
  mando         text,
  coordinado    text,
  encajonada    boolean,
  ubicacion     text,
  precio_final  numeric(14,2),
  extra         jsonb   not null default '{}'::jsonb,
  primary key (pedido_id, item)
);
create index if not exists safra_productos_tipo on public.safra_productos (tipo);

-- ── 4. Auditoria ────────────────────────────────────────────────────────────
-- Si un pedido ya guardado vuelve con OTRO precio o OTRO numero de factura, se
-- guarda el nuevo pero queda anotado aca y la app lo muestra para confirmar.
-- Nunca se pisa un dato de plata en silencio.
create table if not exists public.safra_cambios (
  id              bigserial primary key,
  pedido_id       text not null,
  campo           text not null,
  valor_anterior  text,
  valor_nuevo     text,
  archivo         text,
  detectado_en    timestamptz not null default now(),
  revisado        boolean not null default false
);
create index if not exists safra_cambios_pendientes
  on public.safra_cambios (detectado_en desc) where revisado = false;

-- ── 5. Permisos ─────────────────────────────────────────────────────────────
-- La app y el script de Google entran con la clave anonima. Se les da leer,
-- insertar y actualizar. NO se les da DELETE: "nunca se borra nada" queda
-- garantizado por la base de datos, no por que el codigo se porte bien.
alter table public.safra_reportes  enable row level security;
alter table public.safra_pedidos   enable row level security;
alter table public.safra_productos enable row level security;
alter table public.safra_cambios   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['safra_reportes','safra_pedidos','safra_productos','safra_cambios'] loop
    execute format('drop policy if exists %I on public.%I', 'safra_lee_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'safra_inserta_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'safra_actualiza_' || t, t);

    execute format('create policy %I on public.%I for select to anon using (true)', 'safra_lee_' || t, t);
    execute format('create policy %I on public.%I for insert to anon with check (true)', 'safra_inserta_' || t, t);
    execute format('create policy %I on public.%I for update to anon using (true) with check (true)', 'safra_actualiza_' || t, t);
  end loop;
end $$;

-- Sin DELETE, ni siquiera por accidente.
revoke delete on public.safra_reportes, public.safra_pedidos,
                 public.safra_productos, public.safra_cambios from anon;
