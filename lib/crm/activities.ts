import { sql, type Db } from "@/lib/db";
import type { ActivityInput } from "@/lib/crm/schemas";
import type { Activity } from "@/lib/crm/types";

const selectActivity = sql`
  select a.*, c.name as contact_name, o.title as opportunity_title
  from activities a
  left join contacts c on c.id = a.contact_id
  left join opportunities o on o.id = a.opportunity_id
`;
const newestFirst = sql`order by a.occurred_at desc, a.id desc`;

/** Includes activities on the contact's opportunities, even if only opportunity_id was set. */
export async function listActivitiesForContact(contactId: number): Promise<Activity[]> {
  return sql<Activity[]>`
    ${selectActivity}
    where a.contact_id = ${contactId} or o.contact_id = ${contactId}
    ${newestFirst}
  `;
}

export async function listActivitiesForOpportunity(opportunityId: number): Promise<Activity[]> {
  return sql<Activity[]>`${selectActivity} where a.opportunity_id = ${opportunityId} ${newestFirst}`;
}

export async function listRecentActivities(limit = 10): Promise<Activity[]> {
  return sql<Activity[]>`${selectActivity} ${newestFirst} limit ${limit}`;
}

/**
 * Activities logged against an opportunity also store its contact, so they show on the
 * contact's timeline too.
 */
export async function createActivity(input: ActivityInput, db: Db = sql): Promise<{ id: number }> {
  const [row] = await db<{ id: number }[]>`
    insert into activities (contact_id, opportunity_id, type, occurred_at, description)
    select
      coalesce(${input.contact_id}::bigint, (select contact_id from opportunities where id = ${input.opportunity_id}::bigint)),
      ${input.opportunity_id}::bigint,
      ${input.type},
      ${input.occurred_at},
      ${input.description}
    returning id
  `;
  return row;
}

export async function deleteActivity(id: number): Promise<void> {
  await sql`delete from activities where id = ${id}`;
}
