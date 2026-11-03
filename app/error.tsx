"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Unexpected errors (e.g. the database is down). Validation errors are shown in the forms instead.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error && error.message ? error.message : "Unexpected error.";
  return (
    <div className="mx-auto grid max-w-md gap-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        {message} Check that the database is running (<code>npm run db:up</code>), or see{" "}
        <Link href="/status" className="underline">
          system status
        </Link>
        .
      </p>
      <div>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </div>
  );
}
