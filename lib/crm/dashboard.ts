import { sql } from "@/lib/db";

export type DashboardStats = {
  total_contacts: number;
  leads: number;
  prospects: number;
  customers: number;
  open_opportunities: number;
  open_value: number;
  total_opportunities: number;
  total_value: number;
  won_value: number;
};

/** All dashboard numbers in one round trip. "Open" = stage not won/lost. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const [stats] = await sql<DashboardStats[]>`
    select
      (select count(*) from contacts)                                 as total_contacts,
      (select count(*) from contacts where status = 'lead')           as leads,
      (select count(*) from contacts where status = 'prospect')       as prospects,
      (select count(*) from contacts where status = 'customer')       as customers,
      count(*) filter (where o.stage not in ('won', 'lost'))          as open_opportunities,
      coalesce(sum(o.value_rm) filter (where o.stage not in ('won', 'lost')), 0) as open_value,
      count(*)                                                        as total_opportunities,
      coalesce(sum(o.value_rm), 0)                                    as total_value,
      coalesce(sum(o.value_rm) filter (where o.stage = 'won'), 0)     as won_value
    from opportunities o
  `;
  return stats;
}
