// Which existing contact is this person? Deterministic rules in code; the LLM never decides
// which CRM record gets updated, and the user confirms or changes every match.
import { sql, type Db } from "@/lib/db";
import { CLOSED_STAGES, type Stage } from "@/lib/crm/types";
import type { ContactFields, DraftContact } from "@/lib/notes/schema";

type Candidate = { id: number; name: string; company: string | null };

const words = (s: string) => s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];

// "Greenleaf Hotels Malaysia Sdn. Bhd." → greenleaf, hotels, malaysia
const COMPANY_SUFFIXES = new Set(["sdn", "bhd", "berhad", "plt", "co", "ltd", "the", "group"]);
const companyWords = (s: string) => words(s).filter((w) => !COMPANY_SUFFIXES.has(w));

/**
 * null = one or both unknown. Otherwise: do at least half of the shorter name's words appear in
 * the other? "Greenleaf Hotels" ~ "Greenleaf Hotels Malaysia"; "Penang Precision Mfg" ~
 * "Penang Precision Manufacturing"; "Bloom Bakery" ≁ "Kampung Baru Bakeries".
 */
function sameCompany(a: string | null, b: string | null): boolean | null {
  const [x, y] = [a ? companyWords(a) : [], b ? companyWords(b) : []];
  if (x.length === 0 || y.length === 0) return null;
  const [shorter, longer] = x.length <= y.length ? [x, new Set(y)] : [y, new Set(x)];
  const shared = shorter.filter((w) => longer.has(w)).length;
  return shared >= Math.ceil(shorter.length / 2);
}

/**
 * 1. Same email (case-insensitive; emails are unique in the DB) → match.
 * 2. Every word of the extracted name is a word of the contact's name ("Farah" or "Farah Yusof"
 *    ~ "Farah Diyana Yusof"), and the companies don't conflict → suggested match. A single-word
 *    name also needs the company to agree, since first names alone collide too often.
 * 3. Otherwise no match: the review offers "Create new".
 */
export async function matchContacts(people: ContactFields[], db: Db = sql): Promise<DraftContact["match"][]> {
  const candidates = await db<Candidate[]>`select id, name, company from contacts order by updated_at desc, id desc`;
  const emails = people.map((p) => p.email?.toLowerCase()).filter((e): e is string => !!e);
  const byEmail = new Map(
    emails.length
      ? (await db<{ id: number; email: string }[]>`select id, lower(email) as email from contacts where lower(email) in ${db(emails)}`).map(
          (r) => [r.email, r.id],
        )
      : [],
  );

  return people.map((person) => {
    const emailMatch = person.email ? byEmail.get(person.email.toLowerCase()) : undefined;
    if (emailMatch) return { kind: "email", contactId: emailMatch };

    const nameWords = words(person.name);
    if (nameWords.length === 0) return null;
    const match = candidates.find((c) => {
      const contactWords = new Set(words(c.name));
      if (!nameWords.every((w) => contactWords.has(w))) return false;
      const company = sameCompany(person.company, c.company);
      return nameWords.length === 1 ? company === true : company !== false;
    });
    return match ? { kind: "name", contactId: match.id } : null;
  });
}

export type ContactOption = { id: number; name: string; email: string | null; phone: string | null; company: string | null; role: string | null };
export type OpenOpportunity = { id: number; contact_id: number; title: string; stage: Stage; value_rm: number };

/** For the review form: every contact (to choose a different match) and every open opportunity (to link to). */
export async function loadReviewOptions(): Promise<{ contacts: ContactOption[]; openOpportunities: OpenOpportunity[] }> {
  const [contacts, openOpportunities] = await Promise.all([
    sql<ContactOption[]>`select id, name, email, phone, company, role from contacts order by name`,
    sql<OpenOpportunity[]>`
      select id, contact_id, title, stage, value_rm from opportunities
      where stage not in ${sql(CLOSED_STAGES)}
      order by updated_at desc, id desc
    `,
  ]);
  return { contacts, openOpportunities };
}
