// Demo CRM data: npm run seed
// Replaces all contacts, opportunities and activities. Never touches documents/chunks (RAG).
import { sql } from "@/lib/db";
import type { ActivityType, ContactStatus, Stage } from "@/lib/crm/types";

type SeedContact = { key: string; name: string; email: string; phone: string; company: string; role: string; status: ContactStatus };
type SeedOpportunity = { key: string; contact: string; title: string; value_rm: number; stage: Stage };
// daysAgo / hour (Malaysia time) keep the feed looking recent whenever the seed runs.
type SeedActivity = { contact: string; opportunity?: string; type: ActivityType; daysAgo: number; hour: number; description: string };

const contacts: SeedContact[] = [
  { key: "aisyah", name: "Nur Aisyah Rahman", email: "aisyah@serimutiara.com.my", phone: "+60 12-345 6789", company: "Kedai Runcit Seri Mutiara Sdn Bhd", role: "Finance Manager", status: "customer" },
  { key: "jason", name: "Jason Lim Wei Jie", email: "jason.lim@limpartners.my", phone: "+60 16-221 8840", company: "Lim & Partners Chartered Accountants", role: "Managing Partner", status: "customer" },
  { key: "priya", name: "Priya Nair", email: "priya@kinetaxadvisory.com", phone: "+60 17-882 1023", company: "Kineta Tax Advisory", role: "Founder", status: "prospect" },
  { key: "hafiz", name: "Muhammad Hafiz Ismail", email: "hafiz@borneotimber.com.my", phone: "+60 19-554 2101", company: "Borneo Timber Exports Sdn Bhd", role: "CFO", status: "prospect" },
  { key: "mei", name: "Tan Mei Ling", email: "meiling.tan@klfoodhall.my", phone: "+60 12-908 7765", company: "KL Food Hall Group", role: "Operations Director", status: "lead" },
  { key: "ravi", name: "Ravi Chandran", email: "ravi@penangmfg.com", phone: "+60 4-262 1188", company: "Penang Precision Manufacturing", role: "Head of Tax", status: "prospect" },
  { key: "siti", name: "Siti Nurhaliza Abdullah", email: "siti.a@majuedu.edu.my", phone: "+60 13-410 2290", company: "Maju Education Centre", role: "Principal", status: "lead" },
  { key: "kenneth", name: "Kenneth Wong", email: "kenneth@wongtradinghq.com", phone: "+60 11-2345 6677", company: "Wong Trading Co.", role: "Owner", status: "customer" },
  { key: "farah", name: "Farah Diyana Yusof", email: "farah@greenleafhotels.my", phone: "+60 14-776 3321", company: "Greenleaf Hotels Malaysia", role: "Group Financial Controller", status: "lead" },
  { key: "arjun", name: "Arjun Singh Gill", email: "arjun@gilllogistics.com.my", phone: "+60 12-660 4410", company: "Gill Logistics Sdn Bhd", role: "Finance Director", status: "prospect" },
  { key: "chloe", name: "Chloe Ng", email: "chloe.ng@ngauditpractice.my", phone: "+60 16-330 9087", company: "Ng Audit Practice", role: "Audit Partner", status: "lead" },
  { key: "azman", name: "Azman Hashim", email: "azman@tiarasteel.com.my", phone: "+60 3-7781 2200", company: "Tiara Steel Industries Bhd", role: "CFO", status: "customer" },
  { key: "grace", name: "Grace Tan", email: "grace@bloombakery.my", phone: "+60 17-212 5566", company: "Bloom Bakery Sdn Bhd", role: "Owner", status: "lead" },
  { key: "daniel", name: "Daniel Ho", email: "daniel.ho@hoco-secretarial.com", phone: "+60 18-990 1122", company: "HoCo Secretarial Services", role: "Director", status: "prospect" },
  { key: "zul", name: "Zulkifli Omar", email: "zul@omarcontractors.my", phone: "+60 19-871 4433", company: "Omar Contractors Sdn Bhd", role: "Managing Director", status: "lead" },
];

const opportunities: SeedOpportunity[] = [
  { key: "aisyah-einv", contact: "aisyah", title: "e-Invoice readiness workshop (5 staff)", value_rm: 4500, stage: "won" },
  { key: "aisyah-renew", contact: "aisyah", title: "taxPOD subscription renewal 2027", value_rm: 2400, stage: "proposal" },
  { key: "jason-corp", contact: "jason", title: "taxPOD corporate licence, 20 seats", value_rm: 36000, stage: "won" },
  { key: "jason-sst", contact: "jason", title: "SST compliance training for audit team", value_rm: 12000, stage: "qualified" },
  { key: "priya-licence", contact: "priya", title: "taxPOD professional licence, 8 seats", value_rm: 14400, stage: "proposal" },
  { key: "hafiz-tp", contact: "hafiz", title: "Transfer pricing advisory webinar series", value_rm: 18500, stage: "contacted" },
  { key: "hafiz-einv", contact: "hafiz", title: "e-Invoice MyInvois integration briefing", value_rm: 6000, stage: "new" },
  { key: "mei-sst", contact: "mei", title: "SST registration walkthrough", value_rm: 1500, stage: "new" },
  { key: "ravi-corp", contact: "ravi", title: "In-house tax team upskilling (12 seats)", value_rm: 21600, stage: "qualified" },
  { key: "ravi-einv", contact: "ravi", title: "e-Invoice phase 2 rollout support", value_rm: 9800, stage: "contacted" },
  { key: "siti-edu", contact: "siti", title: "Tax basics module for students", value_rm: 3200, stage: "new" },
  { key: "kenneth-renew", contact: "kenneth", title: "taxPOD subscription upgrade to Pro", value_rm: 5400, stage: "won" },
  { key: "farah-group", contact: "farah", title: "Group-wide SST on services training", value_rm: 27000, stage: "contacted" },
  { key: "arjun-einv", contact: "arjun", title: "e-Invoice compliance package", value_rm: 15000, stage: "proposal" },
  { key: "arjun-old", contact: "arjun", title: "Customs duty course (cancelled budget)", value_rm: 4800, stage: "lost" },
  { key: "chloe-cpe", contact: "chloe", title: "CPE hours bundle for audit staff", value_rm: 7200, stage: "qualified" },
  { key: "azman-enterprise", contact: "azman", title: "Enterprise licence, 50 seats", value_rm: 60000, stage: "won" },
  { key: "azman-tp", contact: "azman", title: "Transfer pricing documentation clinic", value_rm: 22000, stage: "proposal" },
  { key: "grace-starter", contact: "grace", title: "taxPOD starter plan", value_rm: 1800, stage: "lost" },
  { key: "daniel-partner", contact: "daniel", title: "Referral partnership: secretarial clients", value_rm: 30000, stage: "qualified" },
];

const activities: SeedActivity[] = [
  { contact: "azman", opportunity: "azman-tp", type: "meeting", daysAgo: 0, hour: 10, description: "Walked CFO through the TP clinic outline. Wants a quote split by subsidiary." },
  { contact: "priya", opportunity: "priya-licence", type: "email", daysAgo: 0, hour: 9, description: "Sent revised proposal with 8 seats and annual billing." },
  { contact: "farah", opportunity: "farah-group", type: "call", daysAgo: 1, hour: 15, description: "Discussed SST on services scope across 4 hotels. Needs headcount from HR." },
  { contact: "jason", opportunity: "jason-sst", type: "meeting", daysAgo: 1, hour: 11, description: "Qualification call with audit partners. Budget confirmed for Q1." },
  { contact: "arjun", opportunity: "arjun-einv", type: "email", daysAgo: 2, hour: 16, description: "Shared e-Invoice compliance package brochure and pricing." },
  { contact: "mei", type: "call", daysAgo: 2, hour: 14, description: "Intro call. Runs 3 outlets, unsure if SST registration threshold applies." },
  { contact: "ravi", opportunity: "ravi-corp", type: "meeting", daysAgo: 3, hour: 10, description: "On-site at Bayan Lepas. Tax team of 12, wants hands-on case studies." },
  { contact: "daniel", opportunity: "daniel-partner", type: "call", daysAgo: 3, hour: 17, description: "Agreed referral terms in principle: 15% on first-year subscriptions." },
  { contact: "kenneth", opportunity: "kenneth-renew", type: "note", daysAgo: 4, hour: 12, description: "Upgrade invoiced. Kenneth asked about e-Invoice content in the Pro plan." },
  { contact: "hafiz", opportunity: "hafiz-tp", type: "email", daysAgo: 4, hour: 9, description: "Followed up after the trade fair. Sent webinar series outline." },
  { contact: "siti", type: "note", daysAgo: 5, hour: 13, description: "Inbound via website form. Interested in a student-friendly tax module." },
  { contact: "azman", opportunity: "azman-enterprise", type: "note", daysAgo: 6, hour: 11, description: "Enterprise licence signed. Onboarding scheduled for next month." },
  { contact: "chloe", opportunity: "chloe-cpe", type: "call", daysAgo: 6, hour: 15, description: "Needs 20 CPE hours per staff before year end. Checking budget." },
  { contact: "aisyah", opportunity: "aisyah-renew", type: "email", daysAgo: 7, hour: 10, description: "Renewal reminder with 10% loyalty discount." },
  { contact: "grace", opportunity: "grace-starter", type: "call", daysAgo: 8, hour: 16, description: "Decided to postpone; will revisit after Chinese New Year." },
  { contact: "farah", type: "email", daysAgo: 9, hour: 10, description: "Replied to LinkedIn message with taxPOD overview deck." },
  { contact: "ravi", opportunity: "ravi-einv", type: "call", daysAgo: 9, hour: 11, description: "Asked about phase 2 timelines and MyInvois API vs portal." },
  { contact: "jason", opportunity: "jason-corp", type: "meeting", daysAgo: 10, hour: 14, description: "Corporate licence kickoff. 20 seats provisioned." },
  { contact: "zul", type: "call", daysAgo: 11, hour: 9, description: "Cold call. Interested in construction-sector SST treatment, call back later." },
  { contact: "arjun", opportunity: "arjun-old", type: "note", daysAgo: 12, hour: 17, description: "Customs course cancelled: budget moved to e-Invoice compliance." },
  { contact: "hafiz", opportunity: "hafiz-einv", type: "note", daysAgo: 13, hour: 12, description: "Logged interest in MyInvois integration briefing from webinar Q&A." },
  { contact: "priya", type: "meeting", daysAgo: 14, hour: 15, description: "Coffee meeting at Bangsar. Firm growing to 8 advisors next year." },
  { contact: "aisyah", opportunity: "aisyah-einv", type: "meeting", daysAgo: 16, hour: 10, description: "Delivered e-Invoice readiness workshop to 5 staff." },
  { contact: "daniel", type: "email", daysAgo: 17, hour: 11, description: "Sent partner programme details." },
  { contact: "kenneth", type: "call", daysAgo: 19, hour: 16, description: "Quarterly check-in. Happy with current plan, open to upgrade." },
  { contact: "mei", opportunity: "mei-sst", type: "note", daysAgo: 20, hour: 9, description: "Created opportunity after trade show lead scan." },
];

/** `hour`:00 Malaysia time, `daysAgo` days before today. Pushed back a day if that is still in the future. */
function malaysiaTime(daysAgo: number, hour: number): Date {
  const todayMyt = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const time = new Date(`${todayMyt}T00:00:00+08:00`).getTime() - daysAgo * 86400_000 + hour * 3600_000;
  return new Date(time > Date.now() ? time - 86400_000 : time);
}

async function main() {
  await sql.begin(async (tx) => {
    await tx`truncate activities, opportunities, contacts restart identity`;

    const contactIds = new Map<string, number>();
    for (const c of contacts) {
      const [{ id }] = await tx<{ id: number }[]>`
        insert into contacts ${tx(c, "name", "email", "phone", "company", "role", "status")} returning id
      `;
      contactIds.set(c.key, id);
    }

    const opportunityIds = new Map<string, number>();
    for (const o of opportunities) {
      const row = { contact_id: contactIds.get(o.contact)!, title: o.title, value_rm: o.value_rm, stage: o.stage };
      const [{ id }] = await tx<{ id: number }[]>`insert into opportunities ${tx(row)} returning id`;
      opportunityIds.set(o.key, id);
    }

    const activityRows = activities.map((a) => ({
      contact_id: contactIds.get(a.contact)!,
      opportunity_id: a.opportunity ? opportunityIds.get(a.opportunity)! : null,
      type: a.type,
      occurred_at: malaysiaTime(a.daysAgo, a.hour),
      description: a.description,
    }));
    await tx`insert into activities ${tx(activityRows)}`;

    // Backdate timestamps so lists and the Kanban order look lived-in: each record was
    // created a few days before its first activity and last updated at its latest one.
    await tx`
      update contacts c set
        created_at = coalesce(a.first, now() - interval '30 days') - interval '3 days',
        updated_at = coalesce(a.last, now() - interval '30 days')
      from contacts c2
      left join lateral (
        select min(occurred_at) as first, max(occurred_at) as last from activities where contact_id = c2.id
      ) a on true
      where c.id = c2.id
    `;
    await tx`
      update opportunities o set
        created_at = coalesce(a.first, now() - interval '25 days') - interval '2 days',
        updated_at = coalesce(a.last, now() - interval '25 days')
      from opportunities o2
      left join lateral (
        select min(occurred_at) as first, max(occurred_at) as last from activities where opportunity_id = o2.id
      ) a on true
      where o.id = o2.id
    `;
  });

  console.log(`Seeded ${contacts.length} contacts, ${opportunities.length} opportunities, ${activities.length} activities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
