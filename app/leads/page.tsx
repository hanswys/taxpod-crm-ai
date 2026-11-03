import Link from "next/link";
import { StatusBadge } from "@/components/crm/badges";
import { ContactDialog } from "@/components/crm/contact-dialog";
import { LeadsFilter } from "@/components/crm/leads-filter";
import { PageHeader } from "@/components/crm/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONTACT_LIST_LIMIT, listContacts } from "@/lib/crm/contacts";
import { CONTACT_STATUSES, type ContactStatus } from "@/lib/crm/types";
import { formatRelative } from "@/lib/format";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const params = await searchParams;
  const q = first(params.q)?.trim() || undefined;
  const rawStatus = first(params.status);
  const status = CONTACT_STATUSES.includes(rawStatus as ContactStatus) ? (rawStatus as ContactStatus) : undefined;

  const contacts = await listContacts({ q, status });
  const filtered = Boolean(q || status);
  const now = new Date();

  return (
    <>
      <PageHeader title="Leads" description="Everyone you deal with: leads, prospects and customers.">
        <ContactDialog />
      </PageHeader>
      <LeadsFilter />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="pl-4 font-medium">
                  <Link href={`/leads/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.company}</TableCell>
                <TableCell className="text-muted-foreground">{c.email}</TableCell>
                <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="pr-4 text-right text-muted-foreground">{formatRelative(c.updated_at, now)}</TableCell>
              </TableRow>
            ))}
            {contacts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {filtered ? "No leads match this search or filter." : "No leads yet. Create one, or run npm run seed."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {contacts.length === CONTACT_LIST_LIMIT && (
        <p className="mt-2 text-xs text-muted-foreground">Showing the first {CONTACT_LIST_LIMIT}. Narrow the search to see more.</p>
      )}
    </>
  );
}
