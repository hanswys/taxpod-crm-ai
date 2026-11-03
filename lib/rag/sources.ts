// The knowledge base: every document `npm run ingest` loads.
// PDFs are committed under public/documents/ (official URLs move often), so
// ingestion is reproducible and citations can link to /documents/<file>#page=N.

export type DocType = "public_ruling" | "e_invoice" | "sst";

export type Source = {
  slug: string; // stable ID: documents.slug, and the "expected source" in the M4 eval
  file: string; // under public/documents/
  title: string; // full title, used in citations and embedded with every chunk
  shortTitle: string; // compact citation label
  docType: DocType;
  issuer: "LHDN" | "RMCD";
  publishedOn: string; // YYYY-MM-DD, from the document's cover
  sourceUrl: string; // where it was downloaded from (2026-11-04)
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  public_ruling: "Public Ruling",
  e_invoice: "e-Invoice",
  sst: "SST",
};

// Bump when cleaning or chunking changes: every document is then re-ingested.
export const CHUNKER_VERSION = 1;

const LHDN = "https://www.hasil.gov.my/wp-content/uploads";
const RMCD = "https://pub-359af8e1f79c472292a7e44ec60f3027.r2.dev/Industry%20Guides/EN";

export const SOURCES: Source[] = [
  {
    slug: "einvoice-guideline",
    file: "einvoice-guideline.pdf",
    title: "e-Invoice Guideline (Version 4.8)",
    shortTitle: "e-Invoice Guideline v4.8",
    docType: "e_invoice",
    issuer: "LHDN",
    publishedOn: "2026-08-30",
    sourceUrl: `${LHDN}/IRBM-e-Invoice-Guideline.pdf`,
  },
  {
    slug: "einvoice-specific-guideline",
    file: "einvoice-specific-guideline.pdf",
    title: "e-Invoice Specific Guideline (Version 4.9)",
    shortTitle: "e-Invoice Specific Guideline v4.9",
    docType: "e_invoice",
    issuer: "LHDN",
    publishedOn: "2026-09-07",
    sourceUrl: `${LHDN}/IRBM-e-Invoice-Specific-Guideline.pdf`,
  },
  {
    slug: "pr-8-2025",
    file: "pr-8-2025.pdf",
    title: "Public Ruling No. 8/2025: Tax Treatment for Micro, Small and Medium Companies",
    shortTitle: "PR 8/2025",
    docType: "public_ruling",
    issuer: "LHDN",
    publishedOn: "2025-12-22",
    sourceUrl: `${LHDN}/pr-8-2025-tax-treatment-for-micro-small-and-medium-companies.pdf`,
  },
  {
    slug: "pr-7-2025",
    file: "pr-7-2025.pdf",
    title:
      "Public Ruling No. 7/2025: Taxation of a Resident Individual Part I – Gifts or Contributions and Allowable Deductions",
    shortTitle: "PR 7/2025",
    docType: "public_ruling",
    issuer: "LHDN",
    publishedOn: "2025-12-05",
    sourceUrl: `${LHDN}/pr-7-2025.pdf`,
  },
  {
    slug: "pr-3-2024",
    file: "pr-3-2024.pdf",
    title: "Public Ruling No. 3/2024: Tax Borne by Employers",
    shortTitle: "PR 3/2024",
    docType: "public_ruling",
    issuer: "LHDN",
    publishedOn: "2024-12-10",
    sourceUrl: `${LHDN}/public-ruling-no-3_2024-tax-borne-by-employers.pdf`,
  },
  {
    slug: "pr-4-2026",
    file: "pr-4-2026.pdf",
    title: "Public Ruling No. 4/2026: Special Allowances for Small Value Assets",
    shortTitle: "PR 4/2026",
    docType: "public_ruling",
    issuer: "LHDN",
    publishedOn: "2026-09-30",
    sourceUrl: `${LHDN}/PR-No.4_2026-Special-Allowances-For-Small-Value-Assets.pdf`,
  },
  {
    slug: "sst-professional-services",
    file: "sst-professional-services.pdf",
    title: "Service Tax Guide on Professional Services",
    shortTitle: "SST Guide: Professional Services",
    docType: "sst",
    issuer: "RMCD",
    publishedOn: "2021-09-21",
    sourceUrl: `${RMCD}/Guide%20on%20Professional%20Services%2020210921.pdf`,
  },
  {
    slug: "sst-management-services",
    file: "sst-management-services.pdf",
    title: "Service Tax Guide on Management Services (Version 5)",
    shortTitle: "SST Guide: Management Services v5",
    docType: "sst",
    issuer: "RMCD",
    publishedOn: "2026-05-06",
    sourceUrl: `${RMCD}/Guide%20on%20Management%20Services%20%20V5%206.5.2026.pdf`,
  },
  {
    slug: "sst-digital-services-fsp",
    file: "sst-digital-services-fsp.pdf",
    title: "Service Tax Guide on Digital Services by Foreign Service Providers (Version 2)",
    shortTitle: "SST Guide: Digital Services by FSP",
    docType: "sst",
    issuer: "RMCD",
    publishedOn: "2021-02-01",
    sourceUrl: `${RMCD}/Guide%20on%20Digital%20Service%20by%20FSP_V2_01022021.pdf`,
  },
];
