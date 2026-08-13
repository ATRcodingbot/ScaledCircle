# Managed Growth (limited beta)

Managed Growth is the premium tier above Scale. It inherits Scale's operating
software and AI Property/Weather Intelligence, then adds a generated marketing
planning and campaign-coordination layer. The initial target is 3–5 concierge
beta Businesses.

The $999 monthly subscription does not include media spend, printing, postage,
or third-party fulfillment. It also does not promise unlimited agency labor or
revisions. Those boundaries must remain visible before approval.

## Authority and generation

`BusinessGrowthIntelligenceContextV1` accepts only Business-provided claims and
authorized Property, Weather, and campaign-performance summaries. Generated
plans are drafts. They cannot publish or fund campaigns, spend on advertising,
send email, assign Scalers, or submit direct-mail orders. Every executable action
requires a separate authoritative Business approval path.

`ManagedGrowth30DayPlanV1` defines a cohesive four-week plan with 30 structured
social posts, advertising creative/strategy, an SEO action plan, a consented-
audience email sequence, and Property/Weather-informed field and postcard
opportunities. Identical inputs share a deterministic cache identity. Full-plan
generation is limited separately from ordinary intelligence questions, with no
more than three full generations per day and two regenerations per plan under
`ManagedGrowthGenerationLimitV1`.

## Physical-channel selection

Direct mail, Scaler distribution, and door-to-door outreach are separate
channels. A standard Scaler job is `distribution_only`: approved material is
distributed over a mapped route and resident conversation is not required.
`door_to_door_outreach` is optional and requires explicit Business selection,
clear conversation expectations, explicit Scaler consent, and its own
compensation contract.

`PhysicalChannelSaturationPolicyV1` checks authoritative geometry overlap,
status, and timing before recommending physical delivery. A postcard campaign
and Scaler distribution are not automatically recommended over the same area in
the same window. A delayed coordinated follow-up may be proposed only with its
overlap, timing, volume, and rationale disclosed and with Business approval.
Plans are rewarded for selecting the right channel, area, and time—not for using
every ScaledCircle service.

Analytics remain channel-specific: direct-mail pieces and responses, Scaler
materials and verified route coverage, and separately consented outreach units
are never collapsed into one misleading physical-delivery total.

## Direct mail

`PostcardCampaignV1` is provider-neutral and approval-gated. It separates vendor
printing, postage, and fulfillment from ScaledCircle's disclosed management fee.
`DirectMailFulfillmentFeePolicyV1` is currently 2,000 basis points (20%). The
estimate is not billing authority and no provider order can be submitted until a
real provider is configured and the approved payment/fulfillment workflow exists.

The supported lifecycle is draft, awaiting Business approval, approved, awaiting
vendor quote, quoted, awaiting payment, submitted to vendor, in production,
mailed, completed, cancelled, or support review. The current beta stops before
vendor submission.

## Launch boundary

Operational now: entitlement inheritance, schemas, validation, cache identities,
rate policy, fee estimates, provider boundary, pricing/marketing surfaces, and a
Managed Growth beta dashboard.

Beta/concierge: production model-driven full-plan generation, Business editing and
export, performance ingestion, and approval workflows.

Coming later: Google/Meta account connections, bulk email delivery, and print/mail
vendor fulfillment. None of these integrations is simulated as live today.
