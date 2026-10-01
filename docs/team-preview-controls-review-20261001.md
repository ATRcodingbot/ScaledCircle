# Team comparison: property explanation and local controls

Review package prepared on the accepted `8cf35b8a8b20c5c525a37c9d567bbf4b0d947658` web baseline. **Not deployed.** The frozen native checkout remains clean at `d60920930c81253f9019c19bed47a3eaf184dd3e`.

## Before and after

Before: property diagnostics and several crew accordions were mixed into the main summary. Expanding a crew row was not selection. The preview had no actual crew or mode inputs.

After:

1. **About your selected area**: mapped observations, partial classifications and separate property-record/year denominators.
2. **Plan your team’s time**: requested session length separately; **How many marketers?** number input and 1–4 shortcuts; **How will they cover the area?** radio choices.
3. **Estimated time for N supported targets**: selected crew/mode, calculated field subtotal and adjacent coverage/transfer warnings. Walking/handling components correspond to that selection; absent breakdowns remain unavailable.
4. **Compare crew sizes**: existing server rows and expandable allocation explanation. Accordion expansion never changes the selection.
5. Supporting streets, nearby regional context, supported campaign-fit explanation and execution-route limitation.
6. **About these estimates**: **What is included**, **What is still missing**, **Where the information comes from**, **What to check before starting**. Nested **Technical source details** retains exact source/matching/version/date, geometry and comparison bindings, component assumptions and limitations.

## Exact copy and meaning

The count/date values are read from the response. These retained values are examples, not constants in application code:

- “760 property records fall within this boundary.”
- “760 of 760 property records have a recorded type.”
- “691 of 760 records have a usable construction year; 69 do not.”
- “Largest recorded construction-year group: 1940–1959.”
- “Property records are not verified houses or delivery stops.”
- “16 of 82 mapped observations have a detailed property type.”
- “Local preview only. These choices do not save campaign settings.”
- “Requested session: 4 hr per person — separate from the estimate below.”
- “Split up — cover different properties” / “Stay together — visit the same properties”.
- “Estimated time for 81 supported targets”.
- “Additional travel is not included. The mapped street evidence has 3 disconnected sections, so overall completion time remains unknown.”
- “81 street-supported mapped targets included; changing crew size does not change this scope.”
- “Known-target subset only. Full area completion time: Not established.”
- For an unsupported larger crew: “A calculation for this crew size is not available in this preview. Your selection is retained; no shorter time is assumed.”
- Where the floor changes a result: “Planning duration with the 15-minute minimum: …”. No duplicate primary number when it does not change the duration.

The maintained `predominantEra` implementation selects the largest bucket (including possible ties), not necessarily a majority. Consequently the new copy does not say “Most” or “Predominantly.” Nearby regional context is labeled separately. Property-record years are not attached to individual mapped buildings. Nothing infers roof condition, deck presence, customer interest or lead probability.

Dates use the existing Flutter locale formatting. Timestamp values are shown in device time, labeled as such; source dates and retrieval times are separate. Missing dates remain “Not supplied.” No dependency was added, and retrieval is never described as a record update.

## Implemented interaction

`OwnTeamTimeComparison` owns local selection state within the existing map preview. Its numeric input accepts positive safe integers, matching maintained server authority; the 1–4 shortcuts impose no new maximum. Existing larger settings remain visible and are not clamped. There is no invented allocator or even-division fallback for larger crews.

For valid cached comparisons, selectors choose the current server row without any loader call, provider acquisition or write. Row bindings must agree with the response’s geometry, targets, evidence/model/source version, row headcount and mode. Legacy V2 response compatibility is retained. Response replacement resets the selector against the new projection. Existing preview revisions reject responses from old geometry, team input, campaign or account; identity/revision keys discard prior local controls when authority changes.

These are comparison inputs, not an automatic campaign-settings editor. Existing explicit team-capacity Save and Zone Use/Save permissions remain unchanged. Preview choices do not change campaign workload, plan readiness, people, assignments, completion or payment authority. Cancel discards them; reopening initializes from the original authoritative settings. No server/function/calculator/allocator edits are included.

Retained request `b0e76d02-c849-4ab3-8943-43a56078cb27` remains the evidence checkpoint, not a new request. Its displayed field subtotals remain:

| Marketers | Split up | Stay together |
|---|---|---|
| 1 | 3 hr 5 min | 3 hr 5 min |
| 2 | 1 hr 33 min | 3 hr 5 min |
| 3 | 1 hr 6 min | 3 hr 5 min |
| 4 | 49 min | 3 hr 5 min |

All include only 81 supported targets. They do not establish whole-area completion or transfer travel. No requested four-hour session is claimed fulfilled.

## Visual proofs

Actual local Flutter widget renders using retained aggregate evidence. They are **not authenticated production browser screenshots, physical acceptance or a new calculation/acquisition**. Detailed allocation lanes are omitted from the render fixture rather than invented. No private customer records, credentials or tokens appear.

- [Desktop: original 2-marketer / Stay together setting](review-assets/team-preview-controls-20261001/desktop.png)
- [Desktop: locally selected Split up](review-assets/team-preview-controls-20261001/desktop-split.png)
- [390-pixel narrow summary](review-assets/team-preview-controls-20261001/narrow.png)
- [320-pixel team controls at 2× text](review-assets/team-preview-controls-20261001/narrow-2x-team.png)

Visual inspection found that multi-line ChoiceChip labels could overlap at 2× text. Coverage selectors now use standard RadioGroup/RadioListTile controls. The final renders preserve wrapping, full labels, keyboard operation and adjacent limitations. The requested number-input question appears outside its compact field label so it remains readable at large text.

## Validation

129 focused client tests passed across comparison/property presentation, actual selectors, own-team input/planning, recommendation display, manual map entry, mapping interaction and freehand recovery. This includes 20 new tests: complete/partial/unavailable copy, exact denominators, 1–4 and larger crew handling, both modes, immutable geometry/target scope, binding rejection, account/response changes, zero acquisition for local switching, actual editor Cancel/reopen with zero record calls, selected semantics and keyboard arrows at 320 pixels / 2× text.

Affected analyzer is clean. Production-config local Flutter web build passed (`--dart-define=APP_ENV=production --no-pub`). Local render test passed. Dependency locks and accepted calculator/server authority files are unchanged.

The separately documented Business Operations capacity-copy equality failure is still open and unchanged. This report does not claim a green full repository suite or reconcile that operational allocator.

## Narrow release disposition

Candidate only: two shared Flutter presentation widgets, focused tests, this review and local proof images. Any later approved release is **Hosting only**, reconciled against production freshness at packaging time. No Functions, IAM, data migration, financial setting, new provider query, native merge/build or store action is needed for this web change.

No deployment occurred, no Founder drawing was requested and no real record changed. Previously observed Cancel/data preservation remains accepted. Physical/browser switching of these newly prepared controls is not yet verified and must not be marked PASS from fixtures.

Remaining source limitations stay separate from UI readiness: incomplete whole-area target inventory; unmapped/unclassified observations; uncertain individual-building property details; unknown access and transfers between disconnected sections; unverified execution route and complete practical team session. No acquisition, scoring, calculation limits or authority changes attempt to close them here.
