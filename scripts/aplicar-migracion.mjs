#!/usr/bin/env node
/**
 * Aplica un archivo .sql contra el Postgres de Supabase.
 *
 *   npm run migrar -- supabase/migrations/2026-09-07_facturas_safra.sql
 *
 * POR QUE HACE FALTA ESTO Y NO ALCANZA LA CLAVE ANONIMA:
 * PostgREST (la API REST de Supabase) no expone DDL. Ni la clave anonima ni la
 * service_role pueden hacer CREATE TABLE: eso solo sale por una conexion
 * Postgres directa, con la contrasena de la base.
 *
 * DONDE SACAR LA CONTRASENA:
 * Panel de Supabase -> Project Settings -> Database -> Database password.
 * Se guarda en `.env.local` como `SUPABASE_DB_PASSWORD=...`. Ese archivo esta
 * en .gitignore (`*.local`), asi que no se commitea.
 *
 * El proyecto destino sale de `VITE_SUPABASE_URL` del mismo `.env.local`, para
 * que no se pueda apuntar por accidente al Supabase equivocado — Jhon tiene
 * dos y no comparten nada.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .map(l => l.match(/^([A-Za-z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(m => [m[1], m[2].trim().replace(/^["']|["']$/g, '')]),
);

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: npm run migrar -- <ruta.sql>');
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const password = env.SUPABASE_DB_PASSWORD;
const ref = url?.match(/https:\/\/([^.]+)\./)?.[1];

if (!ref) {
  console.error('Falta VITE_SUPABASE_URL en .env.local.');
  process.exit(1);
}
if (!password) {
  console.error(`
Falta SUPABASE_DB_PASSWORD en .env.local.

  Panel de Supabase -> proyecto ${ref} -> Project Settings -> Database
  -> Database password  (si no la recordas, "Reset database password").

  Despues agregar al .env.local de este proyecto:
      SUPABASE_DB_PASSWORD=la-contrasena

  Ese archivo no se commitea (.gitignore tiene *.local).

  Alternativa sin contrasena: abrir el SQL Editor del panel y pegar el
  contenido del .sql a mano. Hace exactamente lo mismo.
`);
  process.exit(1);
}

const sql = readFileSync(resolve(archivo), 'utf8');
const pwd = encodeURIComponent(password);

// Supabase mueve los hosts del pooler segun la region del proyecto, y el host
// directo no siempre esta habilitado. Se prueban en orden hasta que uno conecte.
const candidatos = [
  ['directo', `postgresql://postgres:${pwd}@db.${ref}.supabase.co:5432/postgres`],
  ['pooler us-east-1', `postgresql://postgres.${ref}:${pwd}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`],
  ['pooler us-east-2', `postgresql://postgres.${ref}:${pwd}@aws-0-us-east-2.pooler.supabase.com:5432/postgres`],
  ['pooler us-west-1', `postgresql://postgres.${ref}:${pwd}@aws-0-us-west-1.pooler.supabase.com:5432/postgres`],
  ['pooler sa-east-1', `postgresql://postgres.${ref}:${pwd}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`],
  ['pooler eu-central-1', `postgresql://postgres.${ref}:${pwd}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`],
];

console.log(`Proyecto: ${ref}`);
console.log(`Archivo:  ${archivo} (${sql.length} bytes)\n`);

let cliente = null;
let ultimoError = null;
for (const [etiqueta, cadena] of candidatos) {
  const c = new pg.Client({ connectionString: cadena, ssl: { rejectUnauthorized: false } });
  try {
    process.stdout.write(`  probando ${etiqueta}... `);
    await c.connect();
    console.log('conectado');
    cliente = c;
    break;
  } catch (e) {
    console.log(String(e.message).slice(0, 70));
    ultimoError = e;
    await c.end().catch(() => {});
  }
}

if (!cliente) {
  console.error('\nNo se pudo conectar por ningun host. Ultimo error:', ultimoError?.message);
  console.error('Si dice "password authentication failed", la contrasena esta mal.');
  process.exit(1);
}

try {
  // Todo en una transaccion: o entra la migracion entera o no entra nada.
  await cliente.query('begin');
  await cliente.query(sql);
  await cliente.query('commit');
  console.log('\nMigracion aplicada.');

  const { rows } = await cliente.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'safra%'
    order by table_name`);
  if (rows.length) console.log('Tablas safra_*:', rows.map(r => r.table_name).join(', '));
} catch (e) {
  await cliente.query('rollback').catch(() => {});
  console.error('\nFALLO, no se aplico nada:', e.message);
  process.exit(1);
} finally {
  await cliente.end().catch(() => {});
}
