"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CONTACT_STATUS_LABELS, CONTACT_STATUSES } from "@/lib/crm/types";

/** Search box + status filter. Both live in the URL (?q=&status=), so the server does the filtering. */
export function LeadsFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const status = searchParams.get("status") ?? "";

  useEffect(() => () => clearTimeout(timer.current), []);

  function update(name: "q" | "status", value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(name, value);
    else params.delete(name);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search leads"
          placeholder="Search name, email, company, phone"
          defaultValue={searchParams.get("q") ?? ""}
          className="pl-8"
          onChange={(e) => {
            const value = e.target.value.trim();
            clearTimeout(timer.current);
            timer.current = setTimeout(() => update("q", value), 250);
          }}
        />
      </div>
      <div role="group" aria-label="Filter by status" className="flex rounded-lg border p-0.5">
        {[["", "All"] as const, ...CONTACT_STATUSES.map((s) => [s, CONTACT_STATUS_LABELS[s]] as const)].map(
          ([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => update("status", value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
                status === value && "bg-muted font-medium text-foreground",
              )}
            >
              {label}
            </button>
          ),
        )}
      </div>
      {pending && <span className="text-xs text-muted-foreground">Updating…</span>}
    </div>
  );
}
