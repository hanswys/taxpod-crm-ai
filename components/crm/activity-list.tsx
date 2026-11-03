import { MailIcon, PhoneIcon, StickyNoteIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { DeleteActivityButton } from "@/components/crm/delete-activity-button";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ACTIVITY_TYPE_LABELS, type Activity, type ActivityType } from "@/lib/crm/types";

const ICONS: Record<ActivityType, typeof PhoneIcon> = {
  call: PhoneIcon,
  email: MailIcon,
  meeting: UsersIcon,
  note: StickyNoteIcon,
};

/**
 * Activity timeline, newest first. `show` picks which links to print next to each item:
 * the dashboard shows both, a contact page shows the opportunity, an opportunity page neither.
 */
export function ActivityList({
  activities,
  show,
  deletable = false,
  empty = "No activity yet.",
}: {
  activities: Activity[];
  show: { contact?: boolean; opportunity?: boolean };
  deletable?: boolean;
  empty?: string;
}) {
  if (activities.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  const now = new Date();
  return (
    <ol className="grid gap-4">
      {activities.map((a) => {
        const Icon = ICONS[a.type];
        return (
          <li key={a.id} className="group flex gap-3">
            <span
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              title={ACTIVITY_TYPE_LABELS[a.type]}
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="sr-only">{ACTIVITY_TYPE_LABELS[a.type]}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{a.description}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <time dateTime={a.occurred_at.toISOString()} title={formatDateTime(a.occurred_at)}>
                  {formatRelative(a.occurred_at, now)}
                </time>
                {show.contact && a.contact_id && (
                  <>
                    {" · "}
                    <Link href={`/leads/${a.contact_id}`} className="hover:underline">
                      {a.contact_name}
                    </Link>
                  </>
                )}
                {show.opportunity && a.opportunity_id && (
                  <>
                    {" · "}
                    <Link href={`/opportunities/${a.opportunity_id}`} className="hover:underline">
                      {a.opportunity_title}
                    </Link>
                  </>
                )}
              </p>
            </div>
            {deletable && <DeleteActivityButton id={a.id} />}
          </li>
        );
      })}
    </ol>
  );
}
