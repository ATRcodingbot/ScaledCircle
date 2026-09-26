# Marketing contact portability audit — 2026-09-26

Verdict: NOT END-TO-END / NOT PASS. No customer-contact CSV export or compatible CSV file importer was found. No production data was imported, exported or changed. No deployment or native build occurred. Audit base b19cda9; runtime feature behavior is established from maintained code and local tests, not a successful production CSV round trip. The referenced applicant workbook was not supplied with this request; field coverage is compared with the explicit requirements, not its unseen contents.

## A. Implemented

### Core CRM

UI: Business Home → Customers & Schedule (`/#/business/schedule`) → Customers → add/edit customer; Schedule contains customer-linked estimates/jobs/follow-ups; customer timeline contains history. UI files: `apps/mobile/lib/screens/business/business_schedule_screen.dart`, `services/business_operations_service.dart`.

Backend: authenticated `businessOperationsV1` in us-east1; `functions-business-operations/{index,authority,service,model}.js`. Operations include load, saveCustomer, timeline, importLead and customer-linked work. Canonical records: `businessOperations/{businessId}/customers/{id}`, sibling `items`, `timeline`, `requests`, `contactAuthority`; workspace membership comes from `businessWorkspaces/{businessId}/members`. Request receipts and optimistic versions protect normal CRM writes; timeline includes actor, timestamp, event and source details. These are not batch CSV import receipts.

Current customer writable fields: name, company, phone, email, location, source, stage, notes, assignedPeople. Stored records add businessId, version, createdAtMs, updatedAtMs, updatedBy; selected source paths add sourceRef, linkedLeadIds, relationshipType, campaignMembership, emailOperationIds and inbound/outbound contact dates. Estimates hold quotedAmountCents/outcome on related work items, not a general contact budget column. Scheduled follow-ups are work items, not a general nextFollowUpDate contact field.

Customer creation checks normalized email, punctuation-stripped phone, and normalized name+location against the tenant inventory in a transaction. Concurrent duplicate creation is tested. Exact matched identity may be reused by selected source adapters; ambiguous matches fail closed. Name/location matching can be over-conservative; phone normalization is not a country-aware E.164 identity system. Existing duplicate detection is not an import row-resolution UI.

Authority validates current user/workspace membership and permissions; customersView/customersEdit and assignPeople govern relevant actions. Writes require active maintained membership and current terms/privacy consent. Expired membership retains authorized read history. Admin dogfood is separately pinned; it does not grant blanket Business access. Firestore rules reject direct CRM reads/writes, including owner/Admin; functions are authoritative. Current load cap is 1000 and fails rather than silently truncating; it is not an all-record export paginator.

### Limited spreadsheet import

UI: Business Email (`/#/business/email-connection`) → Email Campaigns → Review spreadsheet contacts. This is invited Email Campaigns private beta, not general Core portability. `business_email_campaign_screen.dart::campaignImportRows` parses pasted TAB-separated rows, no header, exactly name/email/inquiry date/context, 1–25 rows. No CSV file chooser or header mapping. Dialog confirmation submits immediately; no row-by-row preview/diff step.

Backend: `businessEmailOperationsV1` → `importCampaignWorkbook`, implemented in `functions-business-email/campaigns.js`. Validates allowed keys, bounded fields/email, batch size and duplicate normalized emails in the batch. Stores `businessMailboxes/{businessId}/campaignCandidates/{sha256(normalizedEmail)}`. Existing names/status are retained; distinct provenance is appended; sourceName/source hash/hashBasis, inquiryDate/context and created/updated timestamps are saved. Reimport of identical source is deduplicated. Per-row transactions mean a later capacity/provenance failure may leave earlier rows committed; no complete batch receipt/resume contract exists. Result is imported count and sent:0, not created/updated/skipped/duplicate/failed counts.

Private-beta permission gate, existing suppression, unsubscribe and do-not-contact controls remain. Import sets reviewedForSend=false and roleReviewRequired=true. This explicitly does not grant email permission. Campaign inventory cap100; audience cap25; provenance cap20. Import itself does not create the canonical CRM customer.

### Sources and outreach history

Authorized Gmail history review can place bounded, source-backed evidence into campaignCandidates; mailbox ownership/generation/read permission and private-beta authority are checked. It does not automatically turn every sender into a customer. `contact_relationship.js` resolves/creates a canonical customer during reviewed outreach, checks tenant email identity, suppression and shared contactAuthority, and links campaign membership/operation history. Landing-page inquiries in `salesLeads` have explicit CRM import/link handling in service.js. Growth discovery and recruiting opportunities are separate prospect projections, not proof that every saved prospect already has a canonical customer row. Email campaign contactHistory, suppression, operations and replies retain their distinct authority/history.

A social-content Download CSV exists in `artifact_export_service.dart`/`managed_growth_screen.dart`; it exports a social artifact schedule, NOT the contact database. It does not satisfy this requirement.

## B. Partial / C. Missing

| Requirement | Current state / exact gap |
|---|---|
| Structured CRM | Exists; richer marketing categories and fields are incomplete |
| CSV file validation / header detection / mapping | Missing; fixed TSV paste only |
| Preview and explicit create/update decisions | Import dialog exists; no parsed row preview or field-diff approval |
| Deduplication | Existing exact-email candidate dedup and CRM matching; no safe cross-source batch resolution, stable export IDs or update policy |
| Invalid-row results | Whole-input validation errors exist; no downloadable row-error report |
| Import audit/counts | Source provenance + CRM request/timeline exist; no batch receipt with all outcome counts |
| Export CSV/local download | Missing for contacts: all, filtered and selected |
| Safe reimport | Identical TSV candidates dedup; no CSV round-trip contract |
| Canonical integration layer | Selected landing/email bridges exist; universal source-neutral contact ingestion missing |
| Consent portability | Enforcement exists separately; no documented read-only export columns or prohibition contract for imported consent fields |
| Record history outside app | Stored source/timeline evidence exists; no portable serialization or audit/history supplement |

Field gaps: no general editable category/customer type, tags, preferred contact method, source date, service/interest, project/request detail, contact budget, conversion date or explicit last-contacted/next-follow-up schema. Some information exists in notes, relationshipType, sourceRef, email events or related estimates/schedule items; that is partial support, not a stable import/export field. Assigned people need stable IDs plus readable names; dates need documented ISO8601/timezone semantics. Source and attribution must distinguish supplied text from verified provider evidence.

## Smallest production-safe implementation plan

1. Extend the EXISTING customer model additively with optional requested fields and stable contact ID/schema version. Keep items, events, source evidence and contactAuthority as their existing authorities. No second contact database and no new entitlement system.
2. Add bounded server operations to businessOperationsV1: previewContactImport, commitContactImport, exportContacts. Reuse current workspace/permission checks. Add explicit export permission policy using maintained permissions; preserve authorized historical reads. Validate file bytes/encoding, BOM, delimiters, duplicate headers, quoted commas/newlines/quotes, UTF-8, file/row/column limits and invalid dates/fields. Use a maintained RFC4180 parser, not split(',').
3. Preview maps detected headers to allowed fields and shows creates, unchanged/duplicate rows, ambiguous identities, invalid rows and explicit proposed update diffs. Default existing matches to SKIP; never overwrite silently. Reject cross-workspace IDs. Imported status/notes/provenance must never change consent, suppression or contactAuthority. No provider sending from preview/commit.
4. Freeze preview/file/mapping digest and expected versions; require explicit commit confirmation. Use idempotent batch/row receipts under existing businessOperations namespace. Transactional identity reservation must serialize with manual, integration and outreach customer creation. Report created/updated/skipped/duplicate/failed rows; allow bounded resumable chunks with honest partial status. Import cannot upgrade a source claim into verified evidence.
5. Export stable human-readable headers with contact ID and schema version, identity, category, requested optional fields, owner ID/name, source/date/reference, attribution and timestamps. Export restrictions as informational columns that cannot clear authority on import. Paginate server-side with explicit consistency/completeness rules, filtered and selected ID authorization, audit counts, short-lived authorized download or streamed response. Neutralize spreadsheet formula injection without irreversible round-trip corruption; document reversible encoding. UTF-8 BOM/CRLF and RFC4180 quoting support Excel/Sheets. Keep private mailbox bodies/tokens out of exports. Optional separate history CSV for one-to-many events rather than flattening them incorrectly.
6. Add Import CSV and Export CSV to Customers & Schedule on isolated web source; mapping/preview/diff/receipt/error-file UI and actual local download. Existing Gmail, landing-page and discovery adapters feed the same reviewed/upsert path with source references; source ingestion remains independent of consent and provider activation. Do not unlock premium integrations for Core users.
7. Acceptance gate: synthetic CSV → preview → confirmed commit → canonical rows visible → all/filtered/selected download → parse/open in Excel-compatible reader → reimport same file → no uncontrolled duplicates; changed rows require explicit diff approval. Test cross-tenant IDs/filter abuse, removed members, expired/write-denied membership, malformed CSV, BOM/Unicode/quoted multiline fields, formula cells, limits, races/retries, suppression/optout preservation, attribution and source-history preservation. Only then certify PASS and propose bounded production rollout. No real customer import or outreach required to test.

## Tests in this audit

Added backend regressions for reimport retaining suppression, malformed batch rejecting before writes, injected consent rejection, unauthorized candidate import, canonical edit preserving restrictions/provenance, and same email isolated across tenants. Added Flutter tests confirming current TSV parsing preserves Unicode/CRLF and rejects ordinary/malformed CSV. Existing CRM concurrency, permission and direct-Firestore-denial tests reused.

Missing CSV export/parser/round-trip implementation has NO passing automated coverage. Do not substitute the TSV rejection tests or social CSV serializer for that acceptance evidence. The tests enumerated in step7 must accompany the implementation; this audit does not claim they exist already.

Validation result: 36 Core/backend/rules tests passed; 14 Email Campaign backend tests passed; 4 Flutter tests passed. The initial combined run could not load html-to-text for Email Campaign tests; rerunning that suite with the existing Business Email dependency path passed all 14. The final doNotContact-preservation regression was rerun separately and passed. No production dependency or lock change was needed. These 54 checks validate existing behavior and identified limits, not the missing CSV round trip.
