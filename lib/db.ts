import postgres from "postgres";
import { requireEnv } from "@/lib/env";

// Reuse one pool across dev hot reloads instead of opening a new one per reload.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

export const sql = globalForDb.sql ?? postgres(requireEnv("DATABASE_URL"));

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
