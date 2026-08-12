# Optional group work and zone worker-pay pools

ScaledCircle keeps one Scaler per map as the default. Existing zones without a
group assignment continue to use `assignedScalerId`,
`assignmentCompensations/{zoneId}`, the existing tracking lifecycle, one zone
completion/review, and one settlement path.

For an optional group, `zoneGroupAssignments/{zoneId}` is the parent work and
financial contract. It stores one immutable `workerPoolCents`, the requested
Scaler count, deterministic initial shares, the existing 2,000-basis-point
platform-fee contract, compensation version, and settlement policy. It does not
multiply the worker pool by the participant count. The server rejects a count
whose initial share is below `WorkloadAwareParticipantMinimumV1` or exceeds 12
slots. The rule uses the greater of an absolute $25 floor and the slot's
proportional share of the existing geometry-derived worker-pay recommendation.
It is a reasonableness guard, not an hourly wage or earnings guarantee. Because
current zones are intentionally valid for one Scaler, the normal recommendation
remains one; extra Scalers are optional.

Examples: $400/1 is $400; $400/4 is $100 each; $300/12 is $25 each for a valid
six-hour zone; $100/4 is $25 each for a four-hour zone; and $100/12 is rejected.

`zoneScalerParticipations/{participantId}` stores one slot per Scaler and zone.
IDs derive from zone and authenticated UID. Clients cannot create or modify
group, participant, contribution, attendance, or settlement records. Reopened
pre-window cancellations reuse the unoccupied slot and its locked allocation.
An application identifies the Scaler authoritatively; neither a Business nor a
Scaler can substitute an arbitrary UID while filling a slot. Each accepted
participant is added to the same private Job Room while retaining their own
material handoff and scheduled share.

Each participant uses an independent tracking session and the existing
`activeTrackingSessions/{uid}` singleton. Sessions link back to participant and
group IDs. Cutoff, pause, resume, completion, and cancellation update only that
participant's active evidence; another participant's collection remains open.
The zone remains the singular long-lived work/review unit.

Group attendance cannot be supplied by the client. Trusted support may confirm
a no-show only after the 15-minute grace period and only when no tracking
session, finalized route, start timestamp, or other authoritative work evidence
exists. Support holds fail closed.

## Contribution and settlement

`VerifiedUniqueRouteCellsV1` derives contribution from trusted finalized route
points. Coordinates are rounded to five decimal places and mapped to
deterministic cells. A cell visited by more
than one participant counts once at group level and is shared in deterministic
micro-units, avoiding simple overlap double-counting. This is an MVP coverage
proxy, not a claim that every property was contacted.

`GroupSettlementPolicyV1` unlocks confirmed no-show share reallocation at 7,500
basis points of server-authoritative zone completion. Reallocation is
proportional to verified contribution. Whole cents use largest remainder, then
participant-ID order for ties, so every authorized cent is allocated exactly
once. Insufficient completion or a support hold remains in support review.
Business fault, cancellation, dispute, and settlement blocks take precedence.

The trusted settlement transaction re-reads the group, participants, immutable
routes, zone state, and funded `campaignPayment`; reserves the deterministic
group-settlement operation and worker allocation; and writes participant final
pay. Stripe execution remains downstream and is not part of this policy.
Platform-fee cents never enter participant allocation.

The 75% consequence is intentional: between 75% and 99% verified completion,
the entire worker pool may be allocated when a confirmed no-show share is
redistributed. Settlement never changes the evidence-based completion value or
labels it 100% complete. At 78%, three equal contributors may receive
$133.34/$133.33/$133.33 from a $400 pool while review still shows 78%
substantial verified completion. At 74%, the $100 no-show share remains
unresolved in support review.

Business disclosure before locking:

> Group jobs reserve one total worker-pay amount. If an assigned Scaler does
> not participate and the remaining team substantially completes at least 75%
> of the verified area, the absent Scaler's reserved share may be redistributed
> to the Scalers who performed the work. This does not increase your funded
> worker-pay amount.

The Scaler disclosure distinguishes scheduled share from conditional final pay,
states that no-show pay is not guaranteed, and identifies the funded worker pool
as the upper bound.

The immutable group contract snapshots worker pool, requested count, initial
slot shares, settlement policy/version and threshold, contribution algorithm,
minimum-participant policy, and platform-fee contract version. Later code
changes cannot retroactively alter those economics.

`submitZoneGroupCompletion` creates or recovers one deterministic
`group_completion_{zoneId}` record and aggregates eligible finalized route
evidence across participants. It opens one zone-level review. The owning
Business (or trusted admin/support) reserves the one deterministic group
settlement after review; the legacy single-Scaler review and transfer paths
explicitly reject group zones, preventing the same worker cents from entering
both settlement systems.

Material-required group work creates a participant-level handoff because the
current material authority is Scaler-specific. A future explicitly shared team
handoff can be added as a separate authoritative mode; it is not assumed.

Property Intelligence may suggest a Scaler count and group pool as advisory
planning information. It cannot configure, fund, assign, or settle the group.
