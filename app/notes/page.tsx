import { connection } from "next/server";
import { PageHeader } from "@/components/crm/page-header";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import samples from "@/eval/notes.json";
import { toDateTimeLocal } from "@/lib/format";
import { loadReviewOptions } from "@/lib/notes/match";

export default async function NotesPage() {
  await connection(); // query at request time, not during the build
  const { contacts, openOpportunities } = await loadReviewOptions();

  return (
    <>
      <PageHeader
        title="Meeting Notes"
        description="Paste notes from a meeting or call. The AI drafts the contacts, action items and opportunities it finds; you review and edit them before anything is saved."
      />
      <NotesWorkspace
        contacts={contacts}
        openOpportunities={openOpportunities}
        samples={samples.map(({ id, title, meetingAt, notes }) => ({ id, title, meetingAt, notes }))}
        now={toDateTimeLocal(new Date())}
      />
    </>
  );
}
