# Business operations V1

Customers & Schedule combines customer records, pipeline stages, estimates,
internal jobs, tasks and crew assignment. It belongs to every active paid
workspace plan. Total login seats remain 1 / 3 / 5 / 10, including the owner.
Crew resources never create a login or entitlement.

## Authority and history

`businessOperationsV1` reads and changes server-owned `businessOperations`
records. Existing Firestore Rules deny all direct client access to this tree,
including Admin clients. Membership, seat capacity, responsibility and current
consent are rechecked for writes. An expired owner can read history; new work
requires reactivation. Removed members lose authority without erasing actor
attribution.

The existing internal Admin workspace is a separate, verified namespace. It
does not create a fake customer Business or subscription. Private invitation
configuration stays outside source control.

Assigned-job users receive only their assigned internal jobs and minimal
customer context. They do not receive customer contact details, office notes,
quotes, unrelated jobs or customer timelines. Notification preferences never
grant action permissions. The client clears loaded data on account changes or
failed access checks and does not persist this view offline.

Each mutation has a request identifier and content fingerprint. Transactions
serialize workspace revisions and enforce record versions, contact deduplication
and assignment overlaps. Linked crew/user identities count as one person for
conflict detection. Only the owner can override an overlap, with a recorded
reason. Archived resource names and previous assignments remain in history.

An estimate quote or Won stage is an owner-recorded outcome, not collected
revenue. Rescheduling preserves the quote and outcome. Internal job completion
does not touch Scaler tracking, contracts, earnings, Wallets or payments.

## User experience

- Today, Week and Month show a dated agenda with local device times.
- Estimates, jobs, follow-ups, meetings and tasks support customer, duration,
  location, assigned people, notes and linked work.
- Customers support contact search, optional pipeline stages and a chronological
  history. Existing landing-page inquiries can be linked once without duplicating
  their source or customer identity.
- The People tab distinguishes seated users from crew resources. Normal Team
  invitations precede linking a crew member to an accepted account.
- Estimate reminders and assignment updates use deterministic in-app records.
  They do not send customer email. The supported notification choices are
  assignment updates, schedule changes and estimate reminders; existing account
  and Growth preferences remain on their existing surfaces.
- Private, entitled agent scheduling prepares a bounded proposal. An ambiguous
  date or name returns to the form. Nothing is saved until the normal reviewed
  form is submitted. General conversational edits and external calendar sync
  are not advertised as implemented.

## Business Email and learning

Google/Gmail remains an invited private beta, independent of transactional
account email. Read and Send are separate provider grants. A server deployment
hold can disable all sending even after Send permission is granted.

Only exact workspace/customer matches can link confirmed sent threads. Recorded
appointments, estimates and win/loss outcomes feed that workspace's local
learning evidence. They do not prove collected revenue. Certification traffic
is excluded, insufficient samples remain low confidence, and no mailbox content
or customer lists are shared with another Business.

A configured OAuth client is not mailbox authorization or delivery proof. Real
owner authorization and a separately permitted controlled send/reply remain
required before enabling prospect outreach.

## Boundaries and verification

V1 does not include external calendar synchronization, recurring scheduling,
advanced dispatch, file upload, invoicing, accounting or an autonomous agent.
Reads fail closed above the bounded inventory rather than displaying partial
totals as complete.

Use the isolated `firebase.business-operations.json` and
`firebase.business-email.json` configs with an explicit project and exact
function selectors. Team permission changes additionally require the selected
maintained Team endpoints. Do not deploy the shared Functions index broadly.

Relevant checks:

```text
functions/business_operations_backend.test.js
functions/business_operations_rules.test.js
functions/business_workspace_backend.test.js
functions/business_email_backend.test.js
apps/mobile/test/business_schedule_test.dart
tools/test_prepare_marketing_delivery.py
```

The emulator tests cover tenant isolation, concurrent conflicts/deduplication,
seat limits, removal, consent, field-user privacy, history preservation, request
replay, reminders and absence of marketplace money effects. Flutter checks
cover narrow layout, large text, customer creation and field-user visibility.

Staging deployment is not production promotion. New mobile presentation needs
a subsequent artifact build; no native GPS bridge or physical-walk authority
was changed by this feature.
