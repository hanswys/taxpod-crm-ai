// Single source for CRM enums. Values match the CHECK constraints in db/schema.sql.

export const CONTACT_STATUSES = ["lead", "prospect", "customer"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  prospect: "Prospect",
  customer: "Customer",
};

export const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};
/** "Open" = not closed. Used by the dashboard and Kanban. */
export const CLOSED_STAGES: readonly Stage[] = ["won", "lost"];

export const ACTIVITY_TYPES = ["call", "email", "meeting", "note"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
};

// Row shapes, as returned by the queries in lib/crm/* (snake_case, same as SQL).

export type Contact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: ContactStatus;
  created_at: Date;
  updated_at: Date;
};

export type Opportunity = {
  id: number;
  contact_id: number;
  contact_name: string;
  title: string;
  value_rm: number;
  stage: Stage;
  created_at: Date;
  updated_at: Date;
};

export type Activity = {
  id: number;
  contact_id: number | null;
  contact_name: string | null;
  opportunity_id: number | null;
  opportunity_title: string | null;
  type: ActivityType;
  occurred_at: Date;
  description: string;
  created_at: Date;
};
