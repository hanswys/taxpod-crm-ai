import Link from "next/link";
import { connection } from "next/server";
import { ActivityList } from "@/components/crm/activity-list";
import { PageHeader } from "@/components/crm/page-header";
import { StatCard } from "@/components/crm/stat-card";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentActivities } from "@/lib/crm/activities";
import { getDashboardStats } from "@/lib/crm/dashboard";
import { formatRM } from "@/lib/format";

export default async function DashboardPage() {
  await connection(); // query at request time, not during the build
  const [stats, recent] = await Promise.all([getDashboardStats(), listRecentActivities(10)]);

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total contacts"
          value={String(stats.total_contacts)}
          detail={`${stats.leads} leads · ${stats.prospects} prospects · ${stats.customers} customers`}
        />
        <StatCard
          label="Open opportunities"
          value={String(stats.open_opportunities)}
          detail={`${formatRM(stats.open_value)} in the open pipeline`}
        />
        <StatCard
          label="Total opportunities value"
          value={formatRM(stats.total_value)}
          detail={`${stats.total_opportunities} opportunities · ${formatRM(stats.won_value)} won`}
        />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardAction>
            <Link href="/leads" className="text-sm text-muted-foreground hover:underline">
              Log activity from a lead
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ActivityList activities={recent} show={{ contact: true, opportunity: true }} empty="No activity logged yet." />
        </CardContent>
      </Card>
    </>
  );
}
