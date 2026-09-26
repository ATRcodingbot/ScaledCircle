# Contact CSV and campaign map records — implementation checkpoint

## Web routes and storage

Customers & Schedule → Customers: Import CSV, Export CSV (all/current search and status filter), import receipts/resume, and review saved Email/agent sources. Existing manual contact editor now includes optional customer category, service/interest, project details, budget/value, attribution, contact preference, tags and lifecycle dates. Data remains businessOperations/{businessId}/customers; no parallel customer database.

businessOperationsV1 operations: inspectContactCsv, previewContactImport, commitContactImport, listContactImports, exportContacts, listContactSources, importContactSource, campaignMapRecord. Import previews/receipts are contactImports, export receipts contactExports and per-row history the maintained timeline. Existing landing-page and reviewed Email bridges remain canonical. Saved Email candidates and agentProspects can be explicitly reviewed/linked into the same customer. Email campaign UI can select canonical CRM contacts through businessEmailOperationsV1 listCampaignCrmContacts/importCampaignCrmContact; selection grants no outreach permission.

CSV: UTF-8 BOM, CRLF, quoted fields, embedded quotes/newlines, reversible spreadsheet-formula protection, stable human-readable headers and same-workspace Contact IDs. Owner labels plus provenance references and read-only outreach restrictions accompany records. Imported consent/suppression fields are rejected/ignored, never authority. Existing matches default Skip; updating requires an explicit reviewed decision. A root revision serializes CSV writes with maintained manual/Email/lead writes. Each transaction rechecks workspace/write authority and current assignments. Partial batches retain audit counts and resume the identical decisions; changed/expired previews require a new preview.

Current bounded limits: CSV 256 KB, 1000 rows and 40 columns; preview must fit 800 KB; canonical inventory 1000 contacts. Larger files must be split, never silently truncated. An unusually large all-contact export can exceed the import-file limit: that exported file must be split before reimport. This is a remaining limitation for unconditional same-file portability, not a successful unlimited round trip. Selected-contact export is not implemented; all and filtered are supported. Invalid rows are shown in preview/receipt, not a separate downloadable error CSV. Source-history export contains references, not every one-to-many event.

## Map record

Campaign zones → Download / Print Map; protected route /business/map-record?campaign=ID. One authorized read returns saved campaign.serviceArea and campaignZones.serviceArea coordinates without approximation. Multiple zones retain exact points. PNG is 1800 pixels wide; clean print tab contains only the record. Includes Business/campaign, reference, export date, status and OpenStreetMap attribution. Background readiness gates export. Planning record does not claim work completion.

Map operation requires workspace/campaign viewing authority and matching ownership for every zone. It does not require a subscription, Managed Growth, Email, funding, assignment or Stripe. No campaign/payment/work mutation; absent or inconsistent saved geometry fails safely. Bound: 100 zones, 5000 points per polygon, supported map latitude range. Current map output excludes marketing history by default.

## Verification

104 backend tests passed across maintained CRM, rules, Email and CSV suites. After adding receipt listing/readback and correcting campaignName mapping, 8 focused backend tests passed. 38 Flutter UI tests passed. Production Flutter web compilation passed. The map fixture verifies exact coordinates, multiple zones, image dimensions, Download/Print handlers, and a single read with no mutation. Browser production acceptance and actual customer CSV import remain separate; no fabricated customer records created.

## Separate unfinished campaign requirements

Campaign → Area → Materials ordering, explicit own-team scheduling, type-aware material recommendations and geographic completion history/12-month overlap warning are not certified by this checkpoint. No campaign execution-mode or financial gate change is bundled here.

Native frozen checkout/source, existing internal binaries, financial controls and provider sending remain unchanged. No production email send is authorized.

## Production promotion and readback

Application/web implementation commit: d999fee. Narrow overlays were compared against the actual deployed source before replacement; changed base files matched the retained git parent. Only businessOperationsV1 and businessEmailOperationsV1 were updated. Active revisions: businessoperationsv1-00009-xel and businessemailoperationsv1-00032-tiy. Environment variables, secret bindings, service accounts, memory, ingress and timeouts matched the prior revisions. Callback was not redeployed. Firebase Hosting promotion completed.

Mike's actual authenticated Customers tab showed Import CSV, Export all contacts CSV, Export filtered CSV, source review and receipt controls. Export all downloaded C:/Users/Greg/Downloads/scaledcircle-contacts-2026-09-26.csv: 526 bytes, UTF-8 BOM, 29 expected columns, zero contact rows matching the truthful empty workspace. Python CSV reader opened it successfully. This proves production download, not production import of a real customer list; that remains held for the intended CSV. Browser's download-event waiter timed out even though the actual file was saved; local file verification and UI Downloaded 0 contacts resolved that tooling discrepancy.

Final focused analyzer: clean. No native compile, release upload, email send, OAuth initiation, campaign creation or money movement performed.
