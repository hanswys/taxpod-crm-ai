# Eval results: vector

Run 2026-11-05 09:01 UTC by `npm run eval -- --mode vector`. 497 chunks (chunker v1), embeddings `gemini-embedding-001`, production k = 10, similarity floor 0.55.

## Retrieval

10 answerable questions. A **doc hit @k** means a passage from an expected document is in the top k; a **section hit @k** means it also overlaps the expected pages.

| | @1 | @3 | @6 | @10 |
|---|---|---|---|---|
| Doc hit | 9/10 | 9/10 | 9/10 | 10/10 |
| Section hit | 7/10 | 9/10 | 9/10 | 10/10 |

**MRR** (mean of 1 / doc rank, 0 if not in the top 10): 0.911

**Best similarity**: answerable questions 0.705–0.761; refusal questions 0.504–0.603.

| id | Question | Expected | Doc rank | Section rank | Best sim. | Top passage |
|---|---|---|---|---|---|---|
| q01 | Who doesn't have to issue e-Invoices? | einvoice-guideline p. 15–17 | 1 | 1 | 0.753 | e-Invoice Guideline v4.8 · 1.6 Exemptions from implementing e-Invoice · page 15 |
| q02 | My client sells to individual consumers who don't ask for an e-Invoice. What do they have to do? | einvoice-specific-guideline p. 18–32 | 1 | 1 | 0.733 | e-Invoice Specific Guideline v4.9 · 3. TRANSACTIONS WITH BUYERS · pages 16–18 |
| q03 | What is the tax rate for an SME company? | pr-8-2025 p. 19–20 | 1 | 1 | 0.712 | PR 8/2025 · 6. Special Tax Treatment for Micro, Small and Medium Companies · page 19 |
| q04 | Can I claim tax relief for my child's education fees? | pr-7-2025 p. 53–57 | 1 | 1 | 0.705 | PR 7/2025 · 6. Allowable Deduction · pages 53–54 |
| q05 | If an employer pays the employee's income tax, is that taxable to the employee? | pr-3-2024 p. 6–6 | 1 | 1 | 0.730 | PR 3/2024 · 5. Income Tax of the Employee Borne by the Employer - A Perquisite to the Employee · page 6 |
| q06 | My client bought a laptop on hire purchase. Can they claim the small value asset allowance? | pr-4-2026 p. 13–13 | 1 | 1 | 0.761 | PR 4/2026 · 13. Hire Purchase of Small Value Assets · page 13 |
| q07 | Is service tax charged on legal services? | sst-professional-services p. 5–6 | 1 | 2 | 0.730 | SST Guide: Professional Services · REGISTRATION AND RESPONSIBILITY OF A REGISTERED PERSON · pages 36–37 |
| q08 | Do intra-group management fees attract service tax? | sst-management-services p. 10–15 | 1 | 1 | 0.706 | SST Guide: Management Services v5 · GROUP RELIEF · pages 10–11 |
| q09 | When does a foreign digital service provider have to register for service tax? | sst-digital-services-fsp p. 15–18 | 1 | 2 | 0.742 | SST Guide: Digital Services by FSP · IMPLEMENTATION OF SERVICE TAX ON DIGITAL SERVICE · pages 6–7 |
| q10 | What is the current service tax rate on legal services? | sst-management-services p. 5–5 | 9 | 9 | 0.718 | SST Guide: Professional Services · REGISTRATION AND RESPONSIBILITY OF A REGISTERED PERSON · pages 36–37 |
| n01 | What is the capital of France? | _refuse_ | – | – | 0.504 | PR 7/2025 · 7. Updates and Amendments · pages 66–67 |
| n02 | What is the corporate income tax rate in Singapore? | _refuse_ | – | – | 0.603 | PR 7/2025 · 1. Objective · page 4 |
| n03 | What is the real property gains tax rate when selling a house after 5 years? | _refuse_ | – | – | 0.601 | PR 7/2025 · 6. Allowable Deduction · pages 47–48 |
