# Eval results: vector + answers

Run 2026-11-05 08:59 UTC by `npm run eval -- --mode vector --answers`. 497 chunks (chunker v1), embeddings `gemini-embedding-001`, answers `gemini-3.5-flash` (fallback `gemini-3.1-flash-lite`), production k = 10, similarity floor 0.55.

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

## Answers

Answered with a citation to an expected document: **10/10**. Refused when they should be: **3/3**.

| id | Should | Outcome | Cites expected doc | Model | Time | Pass |
|---|---|---|---|---|---|---|
| q01 | answer | answer (3 citations) | yes | gemini-3.5-flash | 8.6 s | ✅ |
| q02 | answer | answer (3 citations) | yes | gemini-3.5-flash | 5.3 s | ✅ |
| q03 | answer | answer (2 citations) | yes | gemini-3.5-flash | 3.4 s | ✅ |
| q04 | answer | answer (6 citations) | yes | gemini-3.5-flash | 17.4 s | ✅ |
| q05 | answer | answer (3 citations) | yes | gemini-3.5-flash | 4.2 s | ✅ |
| q06 | answer | answer (1 citation) | yes | gemini-3.5-flash | 3.5 s | ✅ |
| q07 | answer | answer (6 citations) | yes | gemini-3.5-flash | 3.9 s | ✅ |
| q08 | answer | answer (2 citations) | yes | gemini-3.5-flash | 3.9 s | ✅ |
| q09 | answer | answer (4 citations) | yes | gemini-3.5-flash | 7.9 s | ✅ |
| q10 | answer | answer (3 citations) | yes | gemini-3.5-flash | 5.5 s | ✅ |
| n01 | refuse | not found: low_similarity | – | – | 0.5 s | ✅ |
| n02 | refuse | not found: model_declined | – | gemini-3.5-flash | 3.3 s | ✅ |
| n03 | refuse | not found: model_declined | – | gemini-3.5-flash | 2.6 s | ✅ |

### Answer text (for the faithfulness check)

**q01. Who doesn't have to issue e-Invoices?**

According to the e-Invoice Guideline, the following persons are currently exempted from issuing e-Invoices (including self-billed e-Invoices) [1]:
- Foreign diplomatic offices [1]
- Individuals who are not conducting business [1]
- Statutory bodies, statutory authorities, and local authorities for collecting payments, fees, charges, statutory levies, summons, compounds, and penalties under written law, and for transactions of goods sold/services performed before 1 July 2025 [1]
- International organisations for transactions of goods sold or services performed before 1 July 2025 [1]
- Taxpayers with an annual turnover or revenue of less than RM3,000,000 (excluding taxpayers with non-individual shareholders, subsidiaries, or related companies/joint ventures with annual turnover of at least RM3,000,000) [1][2][3]

- [1] e-Invoice Guideline v4.8 · 1.6 Exemptions from implementing e-Invoice · page 15 (passage 1)
- [2] e-Invoice Guideline v4.8 · 1.6 Exemptions from implementing e-Invoice · page 17 (passage 3)
- [3] e-Invoice Guideline v4.8 · 1.6 Exemptions from implementing e-Invoice · pages 16–17 (passage 4)

**q02. My client sells to individual consumers who don't ask for an e-Invoice. What do they have to do?**

When selling to individual consumers who do not require an e-Invoice, your client should follow these steps:

- Issue a normal receipt to the buyer at the point of sale, just like current business practice [1][2]. This receipt does not need to be submitted for IRBM validation at that time [1].
- Consolidate all receipts issued to buyers who did not request an e-Invoice on a monthly basis [3][2].
- Within seven (7) calendar days after the end of the month, retrieve the details of all those receipts from the previous month and issue a consolidated e-Invoice to IRBM for validation [2].
- Once validated, the consolidated e-Invoice serves as the supplier's proof of income and does not need to be shared with the buyers [2].

- [1] e-Invoice Specific Guideline v4.9 · 3. TRANSACTIONS WITH BUYERS · pages 16–18 (passage 1)
- [2] e-Invoice Specific Guideline v4.9 · 3. TRANSACTIONS WITH BUYERS · pages 24–25 (passage 3)
- [3] e-Invoice Specific Guideline v4.9 · 3. TRANSACTIONS WITH BUYERS · pages 9–10 (passage 2)

**q03. What is the tax rate for an SME company?**

Generally, the income tax rate for companies is 24% [1]. However, an eligible resident company incorporated in Malaysia with a paid-up ordinary share capital not exceeding RM2.5 million at the beginning of the basis period, business gross income not exceeding RM50 million, and meeting foreign/non-citizen shareholding restrictions (effective YA 2024) [1][2] enjoys the following special preferential tax rates starting from YA 2023 [2]:

- **For the first RM150,000 of taxable income:** 15% [2]
- **RM150,001 to RM600,000:** 17% [2]
- **Exceeding RM600,000:** 24% [2]

*(Note: For YA 2020 – YA 2022, the special rate was 17% for the first RM600,000 and 24% for the amount exceeding RM600,000 [2].)*

- [1] PR 8/2025 · 6. Special Tax Treatment for Micro, Small and Medium Companies · page 19 (passage 1)
- [2] PR 8/2025 · 6. Special Tax Treatment for Micro, Small and Medium Companies · pages 19–20 (passage 2)

**q04. Can I claim tax relief for my child's education fees?**

The available tax reliefs related to a child's education and care include:

- **Child Care / Kindergarten Fees:** A tax deduction of up to RM3,000 (for YA 2020–2027) is allowed for fees paid to a registered child care centre or kindergarten for a child aged 6 years and below [1].
- **Child Relief for Studying Children:** A parent can claim a child relief deduction of RM8,000 for an unmarried child over 18 years old receiving full-time higher education in approved courses/institutions (or serving under articles/indentures) [2][3]. For a disabled child receiving higher education in or outside Malaysia, an additional deduction of RM8,000 is allowed on top of the RM8,000 disabled child relief (totaling RM16,000) [2][3].
- **Net Savings in NESS:** Parents can claim a deduction of up to RM8,000 for net savings deposited into a National Education Savings Scheme (NESS) account for children [4].
- **Education Insurance Premium:** Premiums paid on an education insurance policy for a child qualify for a deduction of up to RM4,000 starting from YA 2025 [5].

*Note:* The tax relief for higher education course fees under paragraph 46(1)(f) of the ITA applies to the individual's own self-education fees [6]. The documents do not cover a direct deduction for tertiary tuition fees paid on behalf of a child beyond the established child reliefs, NESS savings, and insurance premiums [2][5][4][6].

- [1] PR 7/2025 · 6. Allowable Deduction · pages 39–40 (passage 2)
- [2] PR 7/2025 · 6. Allowable Deduction · pages 53–54 (passage 1)
- [3] PR 7/2025 · 6. Allowable Deduction · page 53 (passage 3)
- [4] PR 7/2025 · 6. Allowable Deduction · pages 31–32 (passage 7)
- [5] PR 7/2025 · 6. Allowable Deduction · pages 64–65 (passage 6)
- [6] PR 7/2025 · 6. Allowable Deduction · pages 17–18 (passage 10)

**q05. If an employer pays the employee's income tax, is that taxable to the employee?**

Yes. When an employer pays an employee's income tax liability (whether fully or partially), that benefit falls within the definition of a perquisite and forms part of the employee's gross income from employment under paragraph 13(1)(a) of the ITA [1][2]. The income tax borne by the employer is treated as income of the employee in the basis year when the actual tax amount for that YA can be determined, which is in the following basis year [3].

- [1] PR 3/2024 · 5. Income Tax of the Employee Borne by the Employer - A Perquisite to the Employee · page 6 (passage 1)
- [2] PR 3/2024 · 6. Tax Treatment of Employee’s Income Tax Borne by the Employer · pages 12–13 (passage 2)
- [3] PR 3/2024 · 6. Tax Treatment of Employee’s Income Tax Borne by the Employer · page 6 (passage 6)

**q06. My client bought a laptop on hire purchase. Can they claim the small value asset allowance?**

No, special allowances for small value assets under paragraph 19A of Schedule 3 of the ITA are not applicable to assets acquired on hire purchase [1]. Instead, a person can claim normal capital allowances under paragraphs 10 and 15 of Schedule 3 of the ITA for such small value assets [1].

- [1] PR 4/2026 · 13. Hire Purchase of Small Value Assets · page 13 (passage 1)

**q07. Is service tax charged on legal services?**

Yes, legal services provided by an advocate and solicitor registered under relevant laws—including legal advice, consultancy on legal matters, and connection charges—are subject to service tax at the rate of 6% [1][2][3][4]. This treatment also applies to Syarie lawyers providing legal services on Islamic matters [1].

However, service tax is not charged in certain situations, including:
- Legal services supplied in connection with goods or land situated outside Malaysia, or where the subject matter relates to a country outside Malaysia [5][1].
- Statutory fees imposed by any government department or statutory body [1].
- Legal services provided within or between Designated Areas (Langkawi, Tioman, Labuan) by a provider whose principal place of business is located in a Designated Area [6].
- Legal services provided exclusively to a company within the same group of companies [3].

- [1] SST Guide: Professional Services · Legal Services · pages 5–6 (passage 2)
- [2] SST Guide: Professional Services · PROFESSIONAL SERVICES · pages 4–5 (passage 4)
- [3] SST Guide: Professional Services · SERVICE TAX TREATMENT ON PROFESSIONAL SERVICES IN GROUP G · pages 21–22 (passage 6)
- [4] SST Guide: Professional Services · REGISTRATION AND RESPONSIBILITY OF A REGISTERED PERSON · pages 33–34 (passage 7)
- [5] SST Guide: Professional Services · REGISTRATION AND RESPONSIBILITY OF A REGISTERED PERSON · pages 36–37 (passage 1)
- [6] SST Guide: Professional Services · REGISTRATION AND RESPONSIBILITY OF A REGISTERED PERSON · page 37 (passage 3)

**q08. Do intra-group management fees attract service tax?**

Management services provided by a company to another company within the same group of companies (intra-group) are generally not taxable under the "group relief" facility if they comply with the conditions specified in paragraphs 3 to 9, First Schedule, STR 2018 [1]. 

However, there are specific exceptions based on services provided to third parties:
- **1 September 2018 to 31 December 2019:** Providing management services to any person outside the group makes management services provided within the group taxable [2].
- **Effective 1 January 2020:** Group relief remains eligible when providing services to third parties, provided the total value of services to third parties within a 12-month period does not exceed 5% of the total value of those services [2]. If it exceeds 5%, service tax must be charged to group members as well [2].

- [1] SST Guide: Management Services v5 · GROUP RELIEF · pages 10–11 (passage 1)
- [2] SST Guide: Management Services v5 · GROUP RELIEF · page 13 (passage 4)

**q09. When does a foreign digital service provider have to register for service tax?**

A Foreign Service Provider (FSP) must register for service tax when the total value of digital services provided to consumers in Malaysia exceeds the threshold of RM500,000 in a period of 12 months or less [1][2][3]. The value can be calculated using either the historical method (past 11 months plus the current month) or the future method (current month plus expected next 11 months) [3].

Once the threshold is exceeded, the FSP must apply for registration no later than the last day of the month following the month in which the threshold was exceeded [4].

- [1] SST Guide: Digital Services by FSP · IMPLEMENTATION OF SERVICE TAX ON DIGITAL SERVICE · pages 6–7 (passage 1)
- [2] SST Guide: Digital Services by FSP · FREQUENTLY ASKED QUESTIONS (FAQs) · page 35 (passage 3)
- [3] SST Guide: Digital Services by FSP · REGISTRATION · page 15 (passage 8)
- [4] SST Guide: Digital Services by FSP · Mandatory Registration · pages 17–18 (passage 2)

**q10. What is the current service tax rate on legal services?**

As of 21 September 2021, legal services were subject to service tax at the rate of 6% [1][2]. However, effective 1 March 2024, the service tax rate increased from 6% to 8% on all taxable services, except for specific services listed in the First and Second Schedule of the Service Tax (Rate of Tax) Order 2018 [3]. The provided documents do not explicitly specify whether legal services are included in those exceptions [3].

- [1] SST Guide: Professional Services · SERVICE TAX TREATMENT ON PROFESSIONAL SERVICES IN GROUP G · pages 21–22 (passage 4)
- [2] SST Guide: Professional Services · REGISTRATION AND RESPONSIBILITY OF A REGISTERED PERSON · pages 33–34 (passage 6)
- [3] SST Guide: Management Services v5 · IMPLICATION AND SCOPE OF TAX · page 5 (passage 9)

**n01. What is the capital of France?**

_Not found (low_similarity)_: The documents in the knowledge base don't cover this question.

**n02. What is the corporate income tax rate in Singapore?**

_Not found (model_declined)_: The provided documents do not cover the corporate income tax rate in Singapore.

**n03. What is the real property gains tax rate when selling a house after 5 years?**

_Not found (model_declined)_: The provided documents do not contain information regarding real property gains tax rates.
