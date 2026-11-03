import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteOpportunityAction } from "@/app/opportunities/actions";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityList } from "@/components/crm/activity-list";
import { ConfirmDelete } from "@/components/crm/confirm-delete";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { StageSelect } from "@/components/crm/stage-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listActivitiesForOpportunity } from "@/lib/crm/activities";
import { listContactOptions } from "@/lib/crm/contacts";
import { getOpportunity, getOpportunityDeleteImpact } from "@/lib/crm/opportunities";
import { parseId } from "@/lib/crm/schemas";
import { formatDateTime, formatRM, plural, toDateTimeLocal } from "@/lib/format";

export default async function OpportunityPage({ params }: PageProps<"/opportunities/[id]">) {
  const id = parseId((await params).id);
  const opportunity = id ? await getOpportunity(id) : null;
  if (!opportunity) notFound();

  const [activities, contacts, impact] = await Promise.all([
    listActivitiesForOpportunity(opportunity.id),
    listContactOptions(),
    getOpportunityDeleteImpact(opportunity.id),
  ]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/opportunities" className="text-muted-foreground hover:underline">
          ← Opportunities
        </Link>
      </p>
      <PageHeader
        title={opportunity.title}
        description={
          <Link href={`/leads/${opportunity.contact_id}`} className="hover:underline">
            {opportunity.contact_name}
          </Link>
        }
      >
        <OpportunityDialog opportunity={opportunity} contacts={contacts} />
        <ConfirmDelete
          title="Delete this opportunity?"
          description={`This can't be undone.${
            impact.activities ? ` Its ${plural(impact.activities, "activity", "activities")} will be deleted too.` : ""
          }`}
          action={deleteOpportunityAction.bind(null, opportunity.id)}
        />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[6rem_1fr] items-center gap-y-3 text-sm">
              <dt className="text-muted-foreground">Value</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatRM(opportunity.value_rm)}</dd>
              <dt className="text-muted-foreground">Stage</dt>
              <dd>
                <StageSelect id={opportunity.id} stage={opportunity.stage} />
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(opportunity.created_at)}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatDateTime(opportunity.updated_at)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <ActivityForm target={{ opportunity_id: opportunity.id }} now={toDateTimeLocal(new Date())} />
            <ActivityList activities={activities} show={{}} deletable />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
