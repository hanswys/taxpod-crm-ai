"use server";

import { refresh } from "next/cache";
import { confirm } from "@/lib/notes/confirm";
import { extract, type ExtractResult } from "@/lib/notes/extract";
import type { ConfirmResult } from "@/lib/notes/schema";

/** Notes → draft for review. Writes only the meeting_notes log row, never CRM records. Never throws. */
export async function extractNotes(notes: string, meetingAt: string): Promise<ExtractResult> {
  return extract({ notes, meetingAt });
}

/** The reviewed draft → contacts, opportunities and activities, in one transaction. */
export async function confirmNotes(payload: unknown): Promise<ConfirmResult> {
  const result = await confirm(payload);
  if (result.ok) refresh();
  return result;
}
