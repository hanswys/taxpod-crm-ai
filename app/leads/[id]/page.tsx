import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteContactAction } from "@/app/leads/actions";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityList } from "@/components/crm/activity-list";
import { StageBadge, StatusBadge } from "@/components/crm/badges";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { ContactDialog } from "@/components/crm/contact-dialog";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActivitiesForContact } from "@/lib/crm/activities";
import { getContact, getContactDeleteImpact } from "@/lib/crm/contacts";
import { listOpportunitiesForContact } from "@/lib/crm/opportunities";
import { parseId } from "@/lib/crm/schemas";
import { formatRM, plural, toDateTimeLocal } from "@/lib/format";

export default async function ContactPage({ params }: PageProps<"/leads/[id]">) {
  const id = parseId((await params).id);
  const contact = id ? await getContact(id) : null;
  if (!contact) notFound();

  const [opportunities, activities, impact] = await Promise.all([
    listOpportunitiesForContact(contact.id),
    listActivitiesForContact(contact.id),
    getContactDeleteImpact(contact.id),
  ]);

  const cascade =
    impact.opportunities + impact.activities > 0
      ? ` This also deletes ${plural(impact.opportunities, "opportunity", "opportunities")}${
          impact.opportunities ? ` (${formatRM(impact.opportunities_value)})` : ""
        } and ${plural(impact.activities, "activity", "activities")}.`
      : "";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/leads" className="text-muted-foreground hover:underline">
          ← Leads
        </Link>
      </p>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {contact.name} <StatusBadge status={contact.status} />
          </span>
        }
        description={contact.company}
      >
        <ContactDialog contact={contact} />
        <ConfirmDelete
          title={`Delete ${contact.name}?`}
          description={`This can't be undone.${cascade}`}
          action={deleteContactAction.bind(null, contact.id)}
        />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{contact.email ? <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a> : "—"}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{contact.phone ?? "—"}</dd>
                <dt className="text-muted-foreground">Company</dt>
                <dd>{contact.company ?? "—"}</dd>
                <dt className="text-muted-foreground">Role</dt>
                <dd>{contact.role ?? "—"}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Opportunities</CardTitle>
              <CardAction>
                <OpportunityDialog contact={{ id: contact.id, name: contact.name }} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No opportunities yet.</p>
              ) : (
                <ul className="grid gap-3">
                  {opportunities.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/opportunities/${o.id}`} className="min-w-0 truncate font-medium hover:underline">
                        {o.title}
                      </Link>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="tabular-nums">{formatRM(o.value_rm)}</span>
                        <StageBadge stage={o.stage} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <ActivityForm target={{ contact_id: contact.id }} now={toDateTimeLocal(new Date())} />
            <ActivityList activities={activities} show={{ opportunity: true }} deletable />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
