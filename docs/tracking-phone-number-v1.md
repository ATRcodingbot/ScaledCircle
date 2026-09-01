# Tracking Phone Number V1

Status: provider-free foundation; Twilio onboarding and live telephony remain blocked pending Founder approval.

## Product contract

Tracking numbers are server-owned campaign assets. They do not replace the Business's real phone number. The V1 customer flow is intended to be:

1. choose a campaign;
2. select a verified forwarding destination;
3. request a local tracking number;
4. place the number on a Landing Page or immutable physical-material version;
5. receive inbound forwarded calls;
6. review call activity separately from qualified leads and conversions.

The hosted provider-free surface is marked Beta and exposes no provisioning action. Existing campaigns, Landing Pages, Response Assets, and physical materials remain usable when tracking setup is unavailable.

## Canonical authority

The server-owned collections are:

- `trackingPhoneAssets`: immutable number identity plus lifecycle projection;
- `phoneForwardingDestinations`: normalized and masked destination with verification state;
- `phoneForwardingDestinationVersions`: immutable verified routing snapshots;
- `trackingPhoneBindings`: immutable campaign-first attribution binding, with bounded future material/channel scopes;
- `callSessions`: canonical call state and frozen attribution snapshot;
- `callWebhookEvents`: replay/idempotency receipts;
- `phoneProvisioningJobs`: provider dispatch and unknown-outcome reconciliation;
- `phoneUsageLedger`: append-only provider expense and usage evidence;
- `trackingPhoneConfigurations`: server operational policy;
- `releasedTrackingPhoneTombstones`: prevents deliberate reassignment of previously distributed numbers.

Normal Business and Admin clients cannot read or write these collections directly. Two secret-free callable read models expose only bounded Business workspace and Admin operations projections. Provisioning and webhook authorities are deliberately absent until provider certification.

## Lifecycle and retry safety

Number states are `REQUESTED`, `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `GRACE`, `RELEASING`, `RELEASED`, `FAILED`, and `UNKNOWN_PROVIDER_OUTCOME`.

- A definitive failure before provider dispatch is terminal and has zero provider acceptance/cost.
- An unknown result after dispatch is held for reconciliation and cannot be blind-retried.
- Known success and release transitions are idempotent.
- A physical distribution keeps its number for 180 days after the campaign ends; a digital-only campaign keeps it for 60 days.
- A released number is tombstoned and is not deliberately reacquired.
- Plan downgrade moves excess numbers into grace; it does not immediately break printed or published assets.
- An active inbound call is not hard-stopped because an allowance boundary is reached mid-call.

Call states normalize to `RINGING`, `ANSWERED`, `COMPLETED`, `BUSY`, `NO_ANSWER`, `FAILED`, `CANCELED`, or `UNKNOWN`. Provider events are replay-safe and a late event cannot regress a terminal state.

## Plan capacity and economics

V1 server policy is:

| Plan | Active numbers | Included forwarded minutes |
| --- | ---: | ---: |
| Starter | 1 | 100 |
| Growth | 3 | 300 |
| Scale | 6 | 750 |
| Managed Growth | 12 | 1,500 |

The Business UI reports active number and minute usage. It does not show provider rates. Provider cost remains a separate append-only ledger; an answered call is not automatically a qualified lead or conversion. Overage billing is disabled in the foundation.

Current Twilio US list pricing is provider evidence, not a ScaledCircle commercial price: a local number is $1.15/month, inbound local Voice is $0.0085/minute, and a US/Canada outbound leg is $0.0140/minute. Twilio Verify lists $0.05 per successful verification plus channel fees. Pricing must be re-read before onboarding or margin decisions.

## Attribution

The immutable call snapshot binds:

- `businessUid`;
- `trackingPhoneAssetId`;
- binding ID/version;
- campaign ID;
- optional material and material-version IDs;
- optional Landing Page and Response Asset IDs;
- deterministic call interaction ID.

The internal bridge records a deduplicated `phone` interaction in the existing Response Asset attribution authority. It does not fabricate a lead or conversion. Campaign binding is the default; material and channel binding are explicit future-safe scopes.

Physical Marketing may snapshot only an active, same-tenant tracking asset whose current binding matches the material campaign. No client-provided phone string becomes immutable material truth.

## Privacy and safety

- Phone values use E.164 validation.
- Customer/Admin read models expose masked numbers only.
- Caller identity is keyed HMAC, never an unhashed or plain SHA identifier.
- Raw caller number retention target is 90 days.
- Minimized normalized call metadata retention target is 24 months.
- Raw phone values never enter QR URLs, public pages, analytics payloads, or client logs.
- Recording, transcription, outbound calling, marketing SMS, and international forwarding are off.
- Provider credentials and webhook verification material remain server-only.

Recording/transcription require a separate consent, disclosure, retention, access, deletion, state-law, and provider-terms review. Those features are not part of V1.

## Webhook and credential boundary

Future Twilio webhooks must be separate public HTTPS endpoints that validate every request with Twilio's official SDK against the exact configured URL and `X-Twilio-Signature`. Invalid signatures fail before writes. Provider event IDs and call SIDs become deterministic replay receipts. Secrets must never be returned by callables or Flutter.

Recommended staging isolation is a dedicated Twilio subaccount. Twilio documents that subaccounts isolate resources and activity but are billed through the main account. Use a subaccount-scoped Restricted API key, not the main account Auth Token for normal REST operations. The subaccount Auth Token is still required server-side for official webhook signature validation unless Twilio provides and ScaledCircle certifies a narrower signing secret.

The minimum Restricted API key permissions planned for V1 are:

- `twilio/phone-numbers/available-numbers/list`;
- `twilio/phone-numbers/active-numbers/list`;
- `twilio/phone-numbers/active-numbers/create`;
- `twilio/phone-numbers/active-numbers/read`;
- `twilio/phone-numbers/active-numbers/update`;
- `twilio/phone-numbers/active-numbers/delete`;
- `twilio/voice/calls/list` and `twilio/voice/calls/read` for reconciliation only;
- `twilio/verify/service/read` and `twilio/verify/verification/create`, `twilio/verify/verification/read`, and `twilio/verify/verification-check/create` if Twilio Verify is selected for destination ownership;
- `/twilio/billing/usage/read` for authoritative cost reconciliation.

Do not grant Call create/update/delete, recording, transcription, Messaging, SIP, or IAM permissions. Inbound forwarding uses signed webhook/TwiML `<Dial>` and does not require outbound Call creation authority.

Planned server-side secret/config names are:

- `TWILIO_SUBACCOUNT_SID` (non-secret configuration where the runtime supports it);
- `TWILIO_RESTRICTED_API_KEY_SID`;
- `TWILIO_RESTRICTED_API_KEY_SECRET`;
- `TWILIO_SUBACCOUNT_AUTH_TOKEN` for webhook validation;
- `TWILIO_VERIFY_SERVICE_SID` if Verify is used;
- `TRACKING_PHONE_CALLER_HMAC_KEY`, independently generated and not shared with Twilio.

No Twilio value belongs in Flutter or Firebase Hosting.

## Twilio onboarding gate

No account, key, subaccount, number, verification, or call has been created by this foundation.

The next approval should authorize only:

1. a Twilio account under Scaled Circle LLC and acceptance/review of Twilio's current terms and data-processing terms;
2. a dedicated `ScaledCircle Staging — Tracking Phone` subaccount;
3. one subaccount-scoped Restricted API key with only the permissions above;
4. server-side secret binding for the five applicable values above;
5. one Founder-owned forwarding destination verification;
6. at most one Maryland local Voice number and one Founder-owned inbound test call;
7. a $5.00 maximum staging provider spend, no recording, transcription, SMS, outbound campaign calling, or production traffic;
8. immediate reconciliation, then number retention/release decision based on the physical/digital campaign policy.

Twilio's current free trial needs no credit card and includes Voice trial capacity, but permits calls only to verified destinations, expires after 30 days, and does not guarantee the exact local number inventory needed for locality certification. It is sufficient for a provider-auth/webhook prototype if a suitable Voice trial number is supplied; paid pay-as-you-go activation and payment details may be required to certify selection and lifecycle of a specific local number. The known pre-tax budget basis for a paid five-minute forwarding smoke is $1.15 for one number-month plus approximately $0.1125 for inbound and US outbound call legs, plus up to $0.05 and channel cost for a successful Verify event. The $5 ceiling leaves bounded room for taxes and provider rounding; any account-required initial balance above it is a stop condition.

## Legal and policy review still open

- caller/callee disclosure and consent wording;
- whether any jurisdiction requires two-party consent even without recording;
- carrier/provider data retention and deletion handling;
- telephone-number ownership, reassignment, and campaign continuity promises;
- abuse, spam, robocall, and prohibited-use controls;
- emergency calling and international forwarding policy;
- customer-facing minute limits and overage policy;
- call attribution's meaning versus lead/conversion claims;
- privacy notice and subprocessors;
- support access, subpoenas, deletion requests, and audit retention.

## Provider-free certification boundary

The checked-in adapter is either deterministic mock or disabled. Hosted staging may read zero-state projections only. It cannot verify a phone, search inventory, buy or release a number, accept a provider webhook, place a call, record audio, send SMS, or incur Twilio spend.

Official references:

- [Twilio Restricted API keys](https://www.twilio.com/docs/iam/api-keys/restricted-api-keys)
- [Twilio subaccounts](https://www.twilio.com/docs/iam/api/subaccounts)
- [Twilio webhook security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [Twilio free trial](https://www.twilio.com/docs/usage/tutorials/how-to-use-your-free-trial-account)
- [Twilio US Voice pricing](https://www.twilio.com/en-us/voice/pricing/us)
- [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing)
- [IncomingPhoneNumber API](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource)
- [TwiML Dial](https://www.twilio.com/docs/voice/twiml/dial)
