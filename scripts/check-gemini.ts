// Smoke test for the Gemini key and models: npm run check:gemini
import { GoogleGenAI } from "@google/genai";
import { chatModel, embed, embedModel, EMBEDDING_DIMS, generate } from "@/lib/llm";
import { requireEnv } from "@/lib/env";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  console.log(`${label} (${Math.round(performance.now() - start)} ms)`);
  return result;
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });

  console.log("Models available to this key (flash / embedding):");
  for await (const model of await ai.models.list()) {
    const name = model.name ?? "";
    if (/flash|embedding/.test(name)) {
      console.log(`  ${name.replace(/^models\//, "")}  [${(model.supportedActions ?? []).join(", ")}]`);
    }
  }

  console.log(`\nEmbedding model: ${embedModel()}`);
  const [vector] = await timed("  embed 1 query", () =>
    embed(["What is the SST rate for taxable services?"], "RETRIEVAL_QUERY"),
  );
  console.log(`  dims: ${vector.length} (expected ${EMBEDDING_DIMS}), length: ${Math.hypot(...vector).toFixed(4)}`);

  console.log(`\nChat model: ${chatModel()}`);
  const reply = await timed("  generate", () => generate("Reply with exactly: OK"));
  console.log(`  reply: ${reply.trim()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
