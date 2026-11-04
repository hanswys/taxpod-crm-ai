import { PageHeader } from "@/components/crm/page-header";
import { AskPanel } from "@/components/rag/ask-panel";

export default function AskPage() {
  return (
    <>
      <PageHeader
        title="Tax Q&A"
        description="Answers come only from the LHDN and RMCD documents in the knowledge base, with a citation for every statement."
      />
      <AskPanel />
    </>
  );
}
