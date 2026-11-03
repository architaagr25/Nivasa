import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

// The Supabase transaction pooler supports neither prepared statements nor several queries in
// flight on one connection: pipelined queries can stall there indefinitely. So each connection
// carries one query at a time and parallel queries spread across the pool.
const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, { prepare: false, max: 10, max_pipeline: 1 });
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema, casing: "snake_case" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
