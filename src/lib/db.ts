import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { readdir, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { defaultSettings } from "./domain";
export interface DB {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
}
function localAdapter(
  pg: PGlite | Parameters<Parameters<PGlite["transaction"]>[0]>[0],
): DB {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },
    async transaction<T>(fn: (db: DB) => Promise<T>) {
      if ("transaction" in pg)
        return pg.transaction((tx) => fn(localAdapter(tx)));
      return fn(localAdapter(pg));
    },
  };
}
function remoteAdapter(pg: postgres.Sql | postgres.TransactionSql): DB {
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pg.unsafe(
        sql,
        params as postgres.ParameterOrJSON<never>[],
      )) as unknown as T[];
    },
    async transaction<T>(fn: (db: DB) => Promise<T>) {
      if ("begin" in pg)
        return (await pg.begin((tx) => fn(remoteAdapter(tx)))) as T;
      return fn(remoteAdapter(pg));
    },
  };
}
const globalDB = globalThis as typeof globalThis & { ssaDB?: Promise<DB> };
export async function migrate(db: DB) {
  await db.query("create schema if not exists ssa");
  await db.query(
    "create table if not exists ssa.schema_migrations(name text primary key,created_at timestamptz not null default now())",
  );
  for (const file of (
    await readdir(path.join(process.cwd(), "supabase/migrations"))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      (
        await db.query("select name from ssa.schema_migrations where name=$1", [
          file,
        ])
      ).length
    )
      continue;
    const sql = await readFile(
      path.join(process.cwd(), "supabase/migrations", file),
      "utf8",
    );
    await db.transaction(async (tx) => {
      // migration file has no interpolated user content
      // PGlite prepared queries require one statement; split with dollar-quote awareness.
      for (const statement of splitSQL(sql)) await tx.query(statement);
      await tx.query("insert into ssa.schema_migrations(name) values($1)", [
        file,
      ]);
    });
  }
  await db.query(
    "insert into ssa.settings(id,data) values(1,$1::jsonb) on conflict do nothing",
    [JSON.stringify(defaultSettings)],
  );
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH)
    await db.query(
      "insert into ssa.users(email,password_hash) values($1,$2) on conflict(email) do nothing",
      [process.env.ADMIN_EMAIL.toLowerCase(), process.env.ADMIN_PASSWORD_HASH],
    );
}
export function splitSQL(sql: string) {
  const statements: string[] = [];
  let start = 0,
    quote = false,
    dollar = false;
  for (let i = 0; i < sql.length; i++) {
    if (!quote && sql.slice(i, i + 2) === "$$") {
      dollar = !dollar;
      i++;
    } else if (!dollar && sql[i] === "'") {
      if (quote && sql[i + 1] === "'") {
        i++;
        continue;
      }
      quote = !quote;
    } else if (sql[i] === ";" && !quote && !dollar) {
      const s = sql.slice(start, i).trim();
      if (s) statements.push(s);
      start = i + 1;
    }
  }
  const rest = sql.slice(start).trim();
  if (rest) statements.push(rest);
  return statements;
}
export function getDB(): Promise<DB> {
  return (globalDB.ssaDB ??= (async () => {
    let db: DB;
    if (process.env.DATABASE_URL)
      db = remoteAdapter(
        postgres(process.env.DATABASE_URL, {
          max: 4,
          prepare: false,
          ssl: process.env.APP_ENV === "production" ? "require" : undefined,
        }),
      );
    else {
      if (process.env.VERCEL || process.env.APP_ENV === "production")
        throw new Error("DATABASE_URL es obligatoria en cloud.");
      const directory = process.env.LOCAL_DATABASE_PATH || ".data/postgres";
      if (directory !== ":memory:") await mkdir(directory, { recursive: true });
      db = localAdapter(
        new PGlite(directory === ":memory:" ? undefined : directory),
      );
      await migrate(db);
    }
    return db;
  })());
}
export async function settings(db?: DB) {
  const rows = await (db || (await getDB())).query<{
    data: typeof defaultSettings;
  }>("select data from ssa.settings where id=1");
  if (!rows[0]) throw new Error("Ejecuta db:migrate antes de iniciar.");
  return rows[0].data;
}
export async function audit(
  action: string,
  entityId?: string,
  detail: Record<string, unknown> = {},
  db?: DB,
) {
  await (db || (await getDB())).query(
    "insert into ssa.audit_logs(action,entity_id,detail) values($1,$2,$3::jsonb)",
    [action, entityId || null, JSON.stringify(detail)],
  );
}
