// Test harness: replays the real supabase/migrations on PGlite (Postgres compiled to WASM) with
// minimal stand-ins for the Supabase-managed pieces (roles, auth, storage, pg_cron). Used to
// verify RLS, column privileges and SQL functions against an actual database engine.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const SUPABASE_STUBS = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA cron; CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name,'/') $$;
CREATE TABLE cron.job (jobname text);
CREATE FUNCTION cron.schedule(a text, b text, c text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE FUNCTION cron.unschedule(a text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE PUBLICATION supabase_realtime;
`;

export type DbRole = "authenticated" | "service_role" | "anon";

export interface TestDb {
  pg: PGlite;
  /** Run SQL as the superuser (setup and assertions that bypass privileges). */
  admin<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as a Supabase role; for `authenticated` the JWT subject is `userId`. Rolls back nothing. */
  as<T = Record<string, unknown>>(
    role: DbRole,
    userId: string | null,
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Insert an auth user (the handle_new_user trigger creates the profile). */
  createUser(email: string): Promise<string>;
}

export interface CreateTestDbOptions {
  /**
   * Only apply migrations whose file name sorts at or before this prefix, so a test can prove a
   * vulnerability exists in the schema as it was before a fix.
   */
  upTo?: string;
  /** Seed legacy data right after the given migration prefix, before the remaining migrations run. */
  seedAfter?: { migration: string; run: (db: TestDb) => Promise<void> };
}

export async function createTestDb(options: CreateTestDbOptions = {}): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUBS);

  const admin: TestDb["admin"] = async (sql, params) =>
    (await pg.query(sql, params)).rows as never[];

  const as: TestDb["as"] = (role, userId, sql, params) =>
    pg.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role}`);
      if (userId) await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      return (await tx.query(sql, params)).rows as never[];
    });

  const createUser: TestDb["createUser"] = async (email) => {
    const [row] = await admin<{ id: string }>(
      `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,
      [email],
    );
    return row.id;
  };

  const db: TestDb = { pg, admin, as, createUser };

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => !options.upTo || name <= `${options.upTo}\uffff`)
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(
      /CREATE EXTENSION[^;]*;/gi,
      "",
    );
    try {
      await pg.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
    if (options.seedAfter && file.startsWith(options.seedAfter.migration)) {
      await options.seedAfter.run(db);
    }
  }
  return db;
}
