import { connection } from "next/server";
import { KanbanBoard } from "@/components/crm/kanban-board";
import { OpportunityDialog } from "@/components/crm/opportunity-dialog";
import { PageHeader } from "@/components/crm/page-header";
import { listContactOptions } from "@/lib/crm/contacts";
import { listOpportunities } from "@/lib/crm/opportunities";

export default async function OpportunitiesPage() {
  await connection(); // query at request time, not during the build
  const [opportunities, contacts] = await Promise.all([listOpportunities(), listContactOptions()]);

  return (
    <>
      <PageHeader title="Opportunities" description="Drag a card to another column to change its stage.">
        <OpportunityDialog contacts={contacts} />
      </PageHeader>
      <KanbanBoard opportunities={opportunities} />
    </>
  );
}
