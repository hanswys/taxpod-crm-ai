"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/ask", label: "Tax Q&A" },
  { href: "/notes", label: "Meeting Notes" },
];

/** Highlights the current section. usePathname() is runtime data, so render inside <Suspense>. */
export function NavLinks() {
  return <NavLinksView pathname={usePathname()} />;
}

/** Same links with nothing highlighted: the Suspense fallback while the path is unknown. */
export function NavLinksView({ pathname }: { pathname?: string }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname !== undefined && (href === "/" ? pathname === "/" : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
