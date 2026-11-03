import { sql } from "@/lib/db";
import type { ContactInput } from "@/lib/crm/schemas";
import type { Contact, ContactStatus } from "@/lib/crm/types";

// No pagination: the list is capped instead (see ARCHITECTURE.md, "What I would do differently").
export const CONTACT_LIST_LIMIT = 200;

/** Escape % and _ so user input is matched literally by ILIKE. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}

export async function listContacts(filter: { q?: string; status?: ContactStatus } = {}): Promise<Contact[]> {
  const q = filter.q?.trim();
  const pattern = q ? likePattern(q) : null;
  return sql<Contact[]>`
    select * from contacts
    where true
      ${filter.status ? sql`and status = ${filter.status}` : sql``}
      ${pattern ? sql`and (name ilike ${pattern} or email ilike ${pattern} or company ilike ${pattern} or phone ilike ${pattern})` : sql``}
    order by updated_at desc, id desc
    limit ${CONTACT_LIST_LIMIT}
  `;
}

/** For the contact picker on the opportunity form. */
export async function listContactOptions(): Promise<Pick<Contact, "id" | "name" | "company">[]> {
  return sql`select id, name, company from contacts order by name`;
}

export async function getContact(id: number): Promise<Contact | null> {
  const [contact] = await sql<Contact[]>`select * from contacts where id = ${id}`;
  return contact ?? null;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const [contact] = await sql<Contact[]>`
    insert into contacts ${sql(input, "name", "email", "phone", "company", "status")}
    returning *
  `;
  return contact;
}

export async function updateContact(id: number, input: ContactInput): Promise<Contact | null> {
  const [contact] = await sql<Contact[]>`
    update contacts
    set ${sql(input, "name", "email", "phone", "company", "status")}, updated_at = now()
    where id = ${id}
    returning *
  `;
  return contact ?? null;
}

/** What a delete takes with it (ON DELETE CASCADE), shown in the confirm dialog. */
export async function getContactDeleteImpact(id: number) {
  const [impact] = await sql<{ opportunities: number; opportunities_value: number; activities: number }[]>`
    select
      (select count(*) from opportunities where contact_id = ${id}) as opportunities,
      (select coalesce(sum(value_rm), 0) from opportunities where contact_id = ${id}) as opportunities_value,
      (select count(*) from activities
        where contact_id = ${id}
           or opportunity_id in (select id from opportunities where contact_id = ${id})) as activities
  `;
  return impact;
}

export async function deleteContact(id: number): Promise<void> {
  await sql`delete from contacts where id = ${id}`;
}
