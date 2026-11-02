import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { sql } from "@/lib/db";

// M0 health page: proves the app can reach Postgres and that the schema is loaded.

const TABLES = ["contacts", "opportunities", "activities", "documents", "chunks"] as const;

type DbHealth =
  | { ok: true; pgvector: string; counts: Record<string, string> }
  | { ok: false; error: string };

async function checkDb(): Promise<DbHealth> {
  try {
    const [{ version }] = await sql<{ version: string }[]>`
      select extversion as version from pg_extension where extname = 'vector'
    `;
    const rows = await sql<{ table_name: string; rows: string }[]>`
      select 'contacts' as table_name, count(*) as rows from contacts
      union all select 'opportunities', count(*) from opportunities
      union all select 'activities', count(*) from activities
      union all select 'documents', count(*) from documents
      union all select 'chunks', count(*) from chunks
    `;
    return { ok: true, pgvector: version, counts: Object.fromEntries(rows.map((r) => [r.table_name, r.rows])) };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

// A refused connection is an AggregateError (IPv6 + IPv4 attempts) with an empty message.
function describeError(error: unknown): string {
  if (error instanceof AggregateError) return error.errors.map(describeError).join("; ");
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

async function DbStatus() {
  await connection(); // query at request time, not during the build
  const health = await checkDb();

  if (!health.ok) {
    return (
      <CardContent className="space-y-2">
        <Badge variant="destructive">DB unavailable</Badge>
        <p className="font-mono text-sm">{health.error}</p>
        <p className="text-sm text-muted-foreground">
          Start it with <code>npm run db:up</code>. If tables are missing, run <code>npm run db:reset</code>.
        </p>
      </CardContent>
    );
  }

  return (
    <CardContent className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge>DB connected</Badge>
        <Badge variant="secondary">pgvector {health.pgvector}</Badge>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {TABLES.map((table) => (
            <tr key={table} className="border-b last:border-0">
              <td className="py-1.5 font-mono">{table}</td>
              <td className="py-1.5 text-right tabular-nums">{health.counts[table] ?? "?"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md p-8">
      <Card>
        <CardHeader>
          <CardTitle>taxPOD CRM</CardTitle>
          <CardDescription>System status</CardDescription>
        </CardHeader>
        <Suspense fallback={<CardContent className="text-sm text-muted-foreground">Checking database…</CardContent>}>
          <DbStatus />
        </Suspense>
      </Card>
    </main>
  );
}
