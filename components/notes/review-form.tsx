"use client";

import { CircleAlert, Quote, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_STATUS_LABELS, CONTACT_STATUSES, STAGE_LABELS, STAGES, type ContactStatus, type Stage } from "@/lib/crm/types";
import { formatRM } from "@/lib/format";
import type { ContactOption, OpenOpportunity } from "@/lib/notes/match";
import type { ConfirmInput, ContactFields, Draft, DraftActionItem, DraftContact, DraftOpportunity } from "@/lib/notes/schema";
import { cn } from "@/lib/utils";

const FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "role", label: "Role" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];
type Fields = Record<FieldKey, string>;

type ContactRow = { ref: string; action: "create" | "update" | "skip"; targetId: number | null; fields: Fields; status: ContactStatus; draft: DraftContact };
type OpportunityRow = ConfirmInput["opportunities"][number] & { draft: DraftOpportunity };
type ItemRow = ConfirmInput["actionItems"][number] & { draft: DraftActionItem };

const text = (v: string | null | undefined) => v ?? "";
const toFields = (f: ContactFields): Fields => ({ name: f.name, email: text(f.email), phone: text(f.phone), company: text(f.company), role: text(f.role) });
/** The notes' value adds nothing new: same, or a shorter form ("Farah Diyana" of "Farah Diyana Yusof"). */
const covers = (saved: string, noted: string) => saved.trim().toLowerCase().includes(noted.trim().toLowerCase());

/** Update: keep what the CRM has, fill its blanks from the notes (D-d). */
function merge(existing: ContactOption, extracted: Fields): Fields {
  const out = {} as Fields;
  for (const { key } of FIELDS) out[key] = text(existing[key]) || extracted[key];
  return out;
}

/** The open opportunity whose title shares the most words with the extracted one (ties: most recent). */
function bestLink(title: string, options: OpenOpportunity[]): number | null {
  const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const wanted = words(title);
  let best: { id: number; score: number } | null = null;
  for (const o of options) {
    const score = [...words(o.title)].filter((w) => wanted.has(w)).length;
    if (!best || score > best.score) best = { id: o.id, score };
  }
  return best?.id ?? null;
}

export function ReviewForm({
  draft,
  contacts,
  openOpportunities,
  pending,
  result,
  onBack,
  onConfirm,
}: {
  draft: Draft;
  contacts: ContactOption[];
  openOpportunities: OpenOpportunity[];
  pending: boolean;
  result: { message: string; errors?: Record<string, string> } | null;
  onBack: () => void;
  onConfirm: (payload: ConfirmInput) => void;
}) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const openFor = (contactId: number | null) => openOpportunities.filter((o) => o.contact_id === contactId);

  const [meetingAt, setMeetingAt] = useState(draft.meetingAt);
  const [summary, setSummary] = useState<ConfirmInput["summary"]>({ include: true, type: draft.interaction, text: draft.summary });
  const [people, setPeople] = useState<ContactRow[]>(() =>
    draft.contacts.map((c) => {
      const extracted = toFields(c.fields);
      const existing = c.match ? byId.get(c.match.contactId) : undefined;
      return existing
        ? { ref: c.ref, action: "update", targetId: existing.id, fields: merge(existing, extracted), status: "lead", draft: c }
        : { ref: c.ref, action: "create", targetId: null, fields: extracted, status: "lead", draft: c };
    }),
  );
  const firstRef = draft.contacts[0]?.ref ?? "";
  const [deals, setDeals] = useState<OpportunityRow[]>(() =>
    draft.opportunities.map((o) => {
      const contactRef = o.contactRef ?? firstRef;
      const person = people.find((p) => p.ref === contactRef);
      const options = person?.action === "update" ? openFor(person.targetId) : [];
      // A matched contact with open deals: link by default, so a follow-up meeting doesn't create a duplicate deal.
      const linkId = options.length ? bestLink(o.title, options) : null;
      return {
        action: linkId ? "link" : "create",
        contactRef,
        title: o.title,
        valueRm: o.valueRm === null ? "" : String(o.valueRm),
        stage: o.stage ?? "new",
        linkId,
        linkStage: null,
        draft: o,
      };
    }),
  );
  const [items, setItems] = useState<ItemRow[]>(() =>
    draft.actionItems.map((a) => ({
      include: true,
      contactRef: a.contactRef ?? firstRef,
      description: a.description,
      owner: text(a.owner),
      dueDate: text(a.dueDate),
      dueText: text(a.dueText),
      draft: a,
    })),
  );

  const errors = result?.errors ?? {};
  const update = <T,>(set: React.Dispatch<React.SetStateAction<T[]>>, i: number, patch: Partial<T>) =>
    set((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function setPersonAction(i: number, action: ContactRow["action"]) {
    const row = people[i];
    const extracted = toFields(row.draft.fields);
    if (action === "update") {
      const targetId = row.targetId ?? row.draft.match?.contactId ?? null;
      const existing = targetId ? byId.get(targetId) : undefined;
      update(setPeople, i, { action, targetId, fields: existing ? merge(existing, extracted) : row.fields });
    } else {
      update(setPeople, i, { action, fields: action === "create" ? extracted : row.fields });
    }
  }

  function setPersonTarget(i: number, targetId: number | null) {
    const existing = targetId ? byId.get(targetId) : undefined;
    update(setPeople, i, { targetId, fields: existing ? merge(existing, toFields(people[i].draft.fields)) : people[i].fields });
  }

  const savable = people.filter((p) => p.action !== "skip");
  const contactChoices = (current: string) => people.filter((p) => p.action !== "skip" || p.ref === current);
  const linkOptions = (contactRef: string) => {
    const person = people.find((p) => p.ref === contactRef);
    return person && person.action === "update" ? openFor(person.targetId) : [];
  };

  function submit() {
    onConfirm({
      noteId: draft.noteId!,
      meetingAt,
      summary,
      contacts: people.map(({ ref, action, targetId, fields, status }) => ({ ref, action, targetId, fields, status })),
      opportunities: deals.map((o) => ({
        action: o.action,
        contactRef: o.contactRef,
        title: o.title,
        valueRm: o.valueRm,
        stage: o.stage,
        // Only link to an opportunity of the chosen contact; anything else is a stale choice.
        linkId: o.action === "link" && linkOptions(o.contactRef).some((x) => x.id === o.linkId) ? o.linkId : null,
        linkStage: o.linkStage,
      })),
      actionItems: items.map((a) => ({
        include: a.include,
        contactRef: a.contactRef,
        description: a.description,
        owner: a.owner,
        dueDate: a.dueDate,
        dueText: a.dueText,
      })),
    });
  }

  const empty = draft.contacts.length + draft.actionItems.length + draft.opportunities.length === 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <p>
          <span className="font-medium">Review the draft.</span>{" "}
          <span className="text-muted-foreground">
            Nothing is saved until you confirm. Quotes show where each item came from in the notes. {draft.model} ·{" "}
            {(draft.ms / 1000).toFixed(1)} s
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={onBack} disabled={pending}>
          Edit notes
        </Button>
      </div>

      {empty && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No contacts, action items or opportunities were found in these notes. You can still log the summary below
          once there&apos;s a contact to log it against, or go back and add more detail.
        </p>
      )}

      {/* Meeting summary → one meeting/call activity per saved contact */}
      <Card>
        <CardHeader>
          <CardTitle>Meeting</CardTitle>
          <CardDescription>Logged as an activity on each saved contact (and its opportunity from this meeting).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Checkbox checked={summary.include} onChange={(include) => setSummary({ ...summary, include })} label="Log the meeting" />
            <div className="grid gap-1.5">
              <Label htmlFor="summary-type">Type</Label>
              <NativeSelect id="summary-type" value={summary.type} onChange={(e) => setSummary({ ...summary, type: e.target.value as "meeting" | "call" })}>
                <NativeSelectOption value="meeting">Meeting</NativeSelectOption>
                <NativeSelectOption value="call">Call</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="meeting-at">When</Label>
              <Input id="meeting-at" type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} className="w-56" />
            </div>
          </div>
          <Textarea
            aria-label="Meeting summary"
            value={summary.text}
            onChange={(e) => setSummary({ ...summary, text: e.target.value })}
            disabled={!summary.include}
            rows={3}
          />
          <FieldError message={errors["summary.text"] ?? errors.meetingAt} />
        </CardContent>
      </Card>

      {/* People */}
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            Matched by email, or suggested when the name (and company) match an existing contact. Updates only fill
            empty fields; the contact&apos;s status is never changed.
            {draft.internal.length > 0 && (
              <> taxPOD staff mentioned (not added as contacts): {draft.internal.map((p) => p.name).join(", ")}.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {people.length === 0 && <p className="text-sm text-muted-foreground">No outside contacts found in the notes.</p>}
          {people.map((p, i) => {
            const existing = p.action === "update" && p.targetId ? byId.get(p.targetId) : undefined;
            const extracted = toFields(p.draft.fields);
            const matchedHere = p.draft.match && p.targetId === p.draft.match.contactId;
            return (
              <Row key={p.ref} muted={p.action === "skip"} evidence={p.draft.evidence} check={p.draft}>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label={`What to do with ${p.fields.name || "this person"}`}
                    value={p.action}
                    onChange={(e) => setPersonAction(i, e.target.value as ContactRow["action"])}
                  >
                    <NativeSelectOption value="create">Create new lead</NativeSelectOption>
                    <NativeSelectOption value="update">Update existing</NativeSelectOption>
                    <NativeSelectOption value="skip">Skip</NativeSelectOption>
                  </NativeSelect>
                  {p.action === "update" && (
                    <NativeSelect
                      aria-label="Contact to update"
                      aria-invalid={errors[`contacts.${i}.targetId`] ? true : undefined}
                      value={p.targetId ?? ""}
                      onChange={(e) => setPersonTarget(i, e.target.value ? Number(e.target.value) : null)}
                      className="min-w-64"
                    >
                      <NativeSelectOption value="">Choose a contact…</NativeSelectOption>
                      {contacts.map((c) => (
                        <NativeSelectOption key={c.id} value={c.id}>
                          {c.name}
                          {c.company ? ` (${c.company})` : ""}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                  {matchedHere && p.action === "update" && (
                    <Badge variant={p.draft.match!.kind === "email" ? "secondary" : "outline"}>
                      {p.draft.match!.kind === "email" ? "Matched by email" : "Suggested: same name"}
                    </Badge>
                  )}
                  {p.action === "create" && p.draft.match && (
                    <span className="text-xs text-muted-foreground">Looks like {byId.get(p.draft.match.contactId)?.name}: consider Update existing.</span>
                  )}
                  {p.action === "create" && (
                    <NativeSelect aria-label="Status" value={p.status} onChange={(e) => update(setPeople, i, { status: e.target.value as ContactStatus })}>
                      {CONTACT_STATUSES.map((s) => (
                        <NativeSelectOption key={s} value={s}>
                          {CONTACT_STATUS_LABELS[s]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </div>
                <FieldError message={errors[`contacts.${i}.targetId`]} />
                {p.action !== "skip" && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {FIELDS.map(({ key, label }) => {
                      const conflict = existing && text(existing[key]) && extracted[key] && !covers(text(existing[key]), extracted[key]) && p.fields[key] !== extracted[key];
                      const id = `contacts-${i}-${key}`;
                      const error = errors[`contacts.${i}.${key}`];
                      return (
                        <div key={key} className="grid content-start gap-1">
                          <Label htmlFor={id} className="text-xs text-muted-foreground">
                            {label}
                          </Label>
                          <Input
                            id={id}
                            value={p.fields[key]}
                            aria-invalid={error ? true : undefined}
                            onChange={(e) => update(setPeople, i, { fields: { ...p.fields, [key]: e.target.value } })}
                          />
                          {conflict && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Notes say: {extracted[key]}{" "}
                              <button type="button" className="underline" onClick={() => update(setPeople, i, { fields: { ...p.fields, [key]: extracted[key] } })}>
                                Use
                              </button>
                            </p>
                          )}
                          <FieldError message={error} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Row>
            );
          })}
        </CardContent>
      </Card>

      {/* Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle>Opportunities</CardTitle>
          <CardDescription>Create a new deal, or link to the contact&apos;s open deal so the meeting is logged against it. Blank value = RM 0.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {deals.length === 0 && <p className="text-sm text-muted-foreground">No opportunities found in the notes.</p>}
          {deals.map((o, i) => {
            const options = linkOptions(o.contactRef);
            const linked = options.find((x) => x.id === o.linkId);
            return (
              <Row key={i} muted={o.action === "skip"} evidence={o.draft.evidence} check={o.draft}>
                <div className="flex flex-wrap items-center gap-2">
                  <NativeSelect aria-label="What to do with this opportunity" value={o.action} onChange={(e) => update(setDeals, i, { action: e.target.value as OpportunityRow["action"] })}>
                    <NativeSelectOption value="create">Create new</NativeSelectOption>
                    <NativeSelectOption value="link" disabled={options.length === 0}>
                      Link to an open deal
                    </NativeSelectOption>
                    <NativeSelectOption value="skip">Skip</NativeSelectOption>
                  </NativeSelect>
                  <span className="text-sm text-muted-foreground">with</span>
                  <ContactSelect rows={contactChoices(o.contactRef)} value={o.contactRef} invalid={!!errors[`opportunities.${i}.contactRef`]} onChange={(contactRef) => update(setDeals, i, { contactRef })} />
                </div>
                <FieldError message={errors[`opportunities.${i}.contactRef`]} />
                {o.action === "create" && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem]">
                    <LabeledInput id={`opp-${i}-title`} label="Title" value={o.title} error={errors[`opportunities.${i}.title`]} onChange={(title) => update(setDeals, i, { title })} />
                    <LabeledInput id={`opp-${i}-value`} label="Value (RM)" value={o.valueRm} inputMode="decimal" error={errors[`opportunities.${i}.valueRm`]} onChange={(valueRm) => update(setDeals, i, { valueRm })} />
                    <div className="grid content-start gap-1">
                      <Label htmlFor={`opp-${i}-stage`} className="text-xs text-muted-foreground">
                        Stage
                      </Label>
                      <StageSelect id={`opp-${i}-stage`} value={o.stage} onChange={(stage) => update(setDeals, i, { stage: stage ?? "new" })} />
                    </div>
                  </div>
                )}
                {o.action === "link" && (
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        aria-label="Open opportunity to link to"
                        aria-invalid={errors[`opportunities.${i}.linkId`] ? true : undefined}
                        value={linked?.id ?? ""}
                        onChange={(e) => update(setDeals, i, { linkId: e.target.value ? Number(e.target.value) : null })}
                        className="min-w-64"
                      >
                        <NativeSelectOption value="">Choose an open deal…</NativeSelectOption>
                        {options.map((x) => (
                          <NativeSelectOption key={x.id} value={x.id}>
                            {x.title} · {formatRM(x.value_rm)} · {STAGE_LABELS[x.stage]}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <StageSelect aria-label="Move to stage" value={o.linkStage} keepLabel={linked ? `Keep stage (${STAGE_LABELS[linked.stage]})` : "Keep stage"} className="w-auto" onChange={(linkStage) => update(setDeals, i, { linkStage })} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      From the notes: {o.title}
                      {o.valueRm && ` · ${formatRM(Number(o.valueRm))}`}
                      {o.draft.stage && linked && o.draft.stage !== linked.stage && (
                        <>
                          {" "}· suggests {STAGE_LABELS[o.draft.stage]}{" "}
                          <button type="button" className="underline" onClick={() => update(setDeals, i, { linkStage: o.draft.stage })}>
                            Use
                          </button>
                        </>
                      )}
                    </p>
                    <FieldError message={errors[`opportunities.${i}.linkId`]} />
                  </div>
                )}
              </Row>
            );
          })}
        </CardContent>
      </Card>

      {/* Action items → note activities */}
      <Card>
        <CardHeader>
          <CardTitle>Action items</CardTitle>
          <CardDescription>Each one is logged as a note on its contact, with the owner and due date in the text.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No action items found in the notes.</p>}
          {items.map((a, i) => (
            <Row key={i} muted={!a.include} evidence={a.draft.evidence} check={a.draft}>
              <div className="grid items-start gap-3 lg:grid-cols-[auto_1fr_10rem_10rem_14rem]">
                <div className="pt-6">
                  <Checkbox checked={a.include} onChange={(include) => update(setItems, i, { include })} label="Log" />
                </div>
                <LabeledInput id={`item-${i}-description`} label="Action" value={a.description} error={errors[`actionItems.${i}.description`]} onChange={(description) => update(setItems, i, { description })} />
                <LabeledInput id={`item-${i}-owner`} label="Owner" value={a.owner} onChange={(owner) => update(setItems, i, { owner })} />
                <div className="grid content-start gap-1">
                  <LabeledInput id={`item-${i}-due`} label="Due" type="date" value={a.dueDate} error={errors[`actionItems.${i}.dueDate`]} onChange={(dueDate) => update(setItems, i, { dueDate })} />
                  {a.dueText && <p className="text-xs text-muted-foreground">Notes: &ldquo;{a.dueText}&rdquo;</p>}
                </div>
                <div className="grid content-start gap-1">
                  <Label className="text-xs text-muted-foreground">Log against</Label>
                  <ContactSelect rows={contactChoices(a.contactRef)} value={a.contactRef} invalid={!!errors[`actionItems.${i}.contactRef`]} onChange={(contactRef) => update(setItems, i, { contactRef })} />
                  <FieldError message={errors[`actionItems.${i}.contactRef`]} />
                </div>
              </div>
            </Row>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {result && (
          <p className="mr-auto flex items-center gap-2 text-sm text-destructive">
            <CircleAlert className="size-4 shrink-0" />
            {result.message}
          </p>
        )}
        <span className="text-sm text-muted-foreground">
          {savable.length} {savable.length === 1 ? "contact" : "contacts"} · {deals.filter((d) => d.action !== "skip").length} opportunities ·{" "}
          {items.filter((a) => a.include).length + (summary.include ? savable.length : 0)} activities
        </span>
        <Button variant="outline" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button onClick={submit} disabled={pending || draft.noteId === null}>
          {pending ? "Saving…" : "Confirm and save"}
        </Button>
      </div>
    </div>
  );
}

/** One extracted item: the evidence quote and any warnings from the server's checks, then its controls. */
function Row({ muted, evidence, check, children }: { muted: boolean; evidence: string; check: { evidenceFound: boolean; flags: string[] }; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-3 rounded-lg border p-3", muted && "opacity-60", !check.evidenceFound && "border-amber-500/60")}>
      {children}
      <p className={cn("flex gap-1.5 text-xs text-muted-foreground", !check.evidenceFound && "text-amber-700 dark:text-amber-400")}>
        <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />
        <span className="italic">{evidence || "(no quote given)"}</span>
      </p>
      {check.flags.map((flag) => (
        <p key={flag} className="flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
          {flag}
        </p>
      ))}
    </div>
  );
}

function ContactSelect({ rows, value, invalid, onChange }: { rows: ContactRow[]; value: string; invalid: boolean; onChange: (ref: string) => void }) {
  return (
    <NativeSelect aria-label="Contact" aria-invalid={invalid || undefined} value={value} onChange={(e) => onChange(e.target.value)}>
      <NativeSelectOption value="">Choose…</NativeSelectOption>
      {rows.map((r) => (
        <NativeSelectOption key={r.ref} value={r.ref}>
          {r.fields.name || r.ref}
          {r.action === "skip" ? " (skipped)" : ""}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function StageSelect({
  value,
  onChange,
  keepLabel,
  className = "w-full",
  ...props
}: { value: Stage | null; onChange: (stage: Stage | null) => void; keepLabel?: string; className?: string; id?: string; "aria-label"?: string }) {
  return (
    <NativeSelect {...props} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Stage | null)} className={className}>
      {keepLabel && <NativeSelectOption value="">{keepLabel}</NativeSelectOption>}
      {STAGES.map((s) => (
        <NativeSelectOption key={s} value={s}>
          {keepLabel ? `Move to ${STAGE_LABELS[s]}` : STAGE_LABELS[s]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function LabeledInput({
  id,
  label,
  value,
  error,
  onChange,
  ...props
}: { id: string; label: string; value: string; error?: string; onChange: (value: string) => void } & Omit<React.ComponentProps<"input">, "onChange" | "value" | "id">) {
  return (
    <div className="grid content-start gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)} {...props} />
      <FieldError message={error} />
    </div>
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex h-8 items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}
