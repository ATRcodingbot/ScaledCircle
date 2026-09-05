# Growth product requirements

Design proposal; this document does not claim that external discovery or sending
is implemented or available. Provider selection is independent of the product model.

## Workflow

Discover prospects, enrich supported facts, assess fit, create or update a CRM
record, draft outreach, request approval, send within the approved scope, manage
follow-ups, classify replies, hand off to a person, and report attributable outcomes.
Business prospecting and Scaler recruitment are distinct purposes.

## Provider-neutral information contracts

| Concept | Information to preserve |
| --- | --- |
| Source observation | Source reference, observation time, supported facts and permitted use |
| Enrichment result | Field value, supporting source, confidence and freshness |
| Qualification | Relevant fit criteria, reason and uncertainty |
| Contact | Channel, contact-confidence level and separate contact authorization |
| Outreach draft | Intended recipient, purpose, channel and exact proposed message |
| Outcome | Observed result, time, source and attribution limitations |

Contact confidence distinguishes unknown, inferred, source-published,
provider-verified and owner-confirmed details. Confidence in an address does not
establish permission to contact it. Unsupported claims remain unknown.

## Product behavior

- Preserve source provenance when records are updated or combined.
- Avoid duplicate CRM records and repeated outreach.
- Honor opt-outs and do-not-contact preferences, including follow-ups.
- Keep research, drafting and permission to send distinct.
- Require approval of the intended audience, message and channel before outreach.
- Keep follow-ups within the approved purpose and limits; stop when requested.
- Route uncertain replies and commercial commitments to a person.
- Never describe delivery as proof that someone read or accepted a message.
- Report verified conversions separately from attributed visits or replies.
- Treat missing evidence as missing; do not manufacture personalization or outcomes.

These requirements do not establish permission to collect data or contact anyone.
No provider integration, credential configuration or deployment procedure is defined.
