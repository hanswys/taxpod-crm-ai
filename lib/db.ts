import postgres from "postgres";
import { requireEnv } from "@/lib/env";

// postgres.js returns int8 (ids, count(*)) and numeric (value_rm, sum()) as strings.
// Parse both to numbers here so no query can forget. All our values are far below 2^53.
const toNumber = (value: string) => Number(value);
const types = {
  int8: { to: 20, from: [20], serialize: String, parse: toNumber },
  numeric: { to: 1700, from: [1700], serialize: String, parse: toNumber },
};

const connect = () => postgres(requireEnv("DATABASE_URL"), { types });

// Reuse one pool across dev hot reloads instead of opening a new one per reload.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof connect> };

export const sql = globalForDb.sql ?? connect();

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

/** Postgres error code, e.g. "23505" (unique violation) or "23503" (foreign key violation). */
export function pgErrorCode(error: unknown): string | undefined {
  return error instanceof postgres.PostgresError ? error.code : undefined;
}
