import { sql } from "@/lib/db";
import type { OpportunityInput } from "@/lib/crm/schemas";
import type { Opportunity, Stage } from "@/lib/crm/types";

// Every opportunity query joins the contact name, since every view shows it.
const selectOpportunity = sql`
  select o.*, c.name as contact_name
  from opportunities o
  join contacts c on c.id = o.contact_id
`;

/** All opportunities for the Kanban. Within a column, recently changed cards come first. */
export async function listOpportunities(): Promise<Opportunity[]> {
  return sql<Opportunity[]>`${selectOpportunity} order by o.updated_at desc, o.id desc`;
}

export async function listOpportunitiesForContact(contactId: number): Promise<Opportunity[]> {
  return sql<Opportunity[]>`${selectOpportunity} where o.contact_id = ${contactId} order by o.updated_at desc, o.id desc`;
}

export async function getOpportunity(id: number): Promise<Opportunity | null> {
  const [opportunity] = await sql<Opportunity[]>`${selectOpportunity} where o.id = ${id}`;
  return opportunity ?? null;
}

export async function createOpportunity(input: OpportunityInput): Promise<{ id: number }> {
  const [row] = await sql<{ id: number }[]>`
    insert into opportunities ${sql(input, "contact_id", "title", "value_rm", "stage")}
    returning id
  `;
  return row;
}

export async function updateOpportunity(id: number, input: OpportunityInput): Promise<boolean> {
  const result = await sql`
    update opportunities
    set ${sql(input, "contact_id", "title", "value_rm", "stage")}, updated_at = now()
    where id = ${id}
  `;
  return result.count > 0;
}

export async function setOpportunityStage(id: number, stage: Stage): Promise<boolean> {
  const result = await sql`
    update opportunities set stage = ${stage}, updated_at = now()
    where id = ${id} and stage <> ${stage}
  `;
  return result.count > 0;
}

export async function getOpportunityDeleteImpact(id: number): Promise<{ activities: number }> {
  const [impact] = await sql<{ activities: number }[]>`
    select count(*) as activities from activities where opportunity_id = ${id}
  `;
  return impact;
}

export async function deleteOpportunity(id: number): Promise<void> {
  await sql`delete from opportunities where id = ${id}`;
}
