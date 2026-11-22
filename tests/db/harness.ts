// Banco PostgreSQL real em memória (PGlite) com um "esqueleto" do Supabase Auth,
// para executar as migrações e testar RLS de verdade (SET ROLE authenticated + JWT sub).
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STUB_AUTH = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- privilégios padrão equivalentes aos do Supabase (depois restringidos pelas migrações)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

export async function novoBanco(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(STUB_AUTH)
  const dir = join(process.cwd(), 'supabase', 'migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'))
  }
  return db
}

export async function criarUsuario(db: PGlite, email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email])
  return r.rows[0].id
}

/** Executa `fn` como um usuário autenticado (ou anônimo se uid = null), dentro de uma transação desfeita ao final se pedir. */
export async function como<T>(db: PGlite, uid: string | null, fn: (q: (sql: string, p?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(uid ? 'set local role authenticated' : 'set local role anon')
    return fn(async (sql, p) => (await tx.query(sql, p as any[])).rows as any[])
  })
}

/** Espera que a operação falhe (erro de permissão/RLS) e retorna a mensagem. */
export async function falha(db: PGlite, uid: string | null, sql: string, p?: unknown[]): Promise<string> {
  try {
    await como(db, uid, (q) => q(sql, p))
  } catch (e) {
    return (e as Error).message
  }
  throw new Error('Operação deveria ter sido bloqueada: ' + sql)
}
