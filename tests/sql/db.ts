import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'

/**
 * Banco de teste: um Postgres de verdade em memória (PGlite) com TODAS as migrations da Folyo.
 *
 * As migrations antigas saíram da pasta supabase/migrations (já estão aplicadas no Supabase); elas
 * são lidas do histórico do git, do commit anterior à limpeza. Sem o git (ou num clone raso, como o
 * do CI), `loadMigrations()` devolve null e os testes de SQL são pulados.
 *
 * O que o Supabase tem e o Postgres puro não tem é simulado aqui, do jeito mais parecido possível:
 * papéis anon/authenticated/service_role, os privilégios padrão do schema public (tudo liberado, por
 * isso as migrations fazem "revoke"), auth.users, auth.uid(), auth.jwt() e o básico do Storage.
 */

const PRUNED_AT = '4d16785'
const ROOT = join(__dirname, '..', '..')

function git(args: string[]) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

export function loadMigrations(): { name: string; sql: string }[] | null {
  let historic: { name: string; sql: string }[]
  try {
    const names = git(['ls-tree', '--name-only', `${PRUNED_AT}^`, 'supabase/migrations/']).split('\n').filter((n) => n.endsWith('.sql'))
    historic = names.map((path) => ({ name: path.split('/').pop()!, sql: git(['show', `${PRUNED_AT}^:${path}`]) }))
  } catch {
    return null
  }
  if (!historic.length) return null
  const dir = join(ROOT, 'supabase', 'migrations')
  const current = readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }))
  const byName = new Map([...historic, ...current].map((m) => [m.name, m]))
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Supabase libera tudo do schema public para os papéis da API (as migrations fazem "revoke").
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid,
  metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
`

export type Db = PGlite

/** Cria o banco com todas as migrations. Lança erro dizendo qual migration falhou. */
export async function createDb(migrations: { name: string; sql: string }[]): Promise<Db> {
  const db = await PGlite.create()
  await db.exec(SUPABASE_STUB)
  for (const m of migrations) {
    try {
      await db.exec(m.sql)
    } catch (error) {
      throw new Error(`Migration ${m.name} falhou: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return db
}

/** Cria uma conta (o gatilho do banco cria o perfil junto). */
export async function createUser(db: Db, email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])
  return r.rows[0].id
}

/** Dá um papel da equipe (como o SQL Editor faria). */
export async function setRole(db: Db, userId: string, role: 'editor' | 'admin' | 'proprietario') {
  await db.query('insert into private.staff_roles (user_id, role) values ($1, $2) on conflict (user_id) do update set role = excluded.role', [userId, role])
}

type Session = { uid: string | null; aal?: 'aal1' | 'aal2' }

/**
 * Roda `fn` como um pedido da API do Supabase: papel authenticated (ou anon), com o token da
 * pessoa. Tudo dentro de uma transação que é DESFEITA no fim se `keep` for false.
 */
export async function as<T>(db: Db, session: Session, fn: (tx: Transaction) => Promise<T>, keep = true): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = session.uid ? { sub: session.uid, role: 'authenticated', aal: session.aal ?? 'aal1' } : { role: 'anon' }
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`, [
      session.uid ?? '',
      JSON.stringify(claims),
    ])
    await tx.exec(session.uid ? 'set local role authenticated' : 'set local role anon')
    const out = await fn(tx)
    if (!keep) await tx.rollback()
    return out
  })
}

/** Chama uma função do banco como a pessoa e devolve o resultado (ou o erro, com código e mensagem). */
export async function rpc<T = unknown>(
  db: Db,
  session: Session,
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  try {
    const data = await as(db, session, async (tx) => (await tx.query<{ r: T }>(sql, params)).rows[0]?.r as T)
    return { ok: true, data }
  } catch (error) {
    const e = error as { code?: string; message?: string }
    return { ok: false, code: e.code ?? '', message: e.message ?? String(error) }
  }
}
