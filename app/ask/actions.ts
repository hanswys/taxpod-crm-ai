"use server";

import { ask, type AskResult } from "@/lib/rag/answer";

/** Answer one tax question from the documents. Never throws: failures come back as { kind: "error" }. */
export async function askQuestion(question: string, docType: string): Promise<AskResult> {
  return ask({ question, docType });
}
