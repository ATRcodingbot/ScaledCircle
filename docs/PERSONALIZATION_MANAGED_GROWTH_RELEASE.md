# Personalization and Managed Growth initial release

## Available now

- Saved Business service areas personalize Weather opportunities, Property entry points, and Managed Growth context.
- Saved Scaler work areas, work types, travel choices, Crew preference, and explicit outreach consent personalize proactive job notifications and the **For You** feed.
- **Explore Anywhere** and **Search All Jobs** remain unrestricted manual discovery tools.
- Managed Growth provides Business Profile-grounded plans and content with View, Copy, Export, and bounded Regenerate actions.

## Initial limitations

- Proactive Property-opportunity alerts are not yet available. Property Intelligence remains available through manual discovery.
- Managed Growth reminder notifications are not yet available.
- Image generation remains **Coming Soon / Beta**; operational creative briefs are available now.
- Advertising execution is not connected. Planned budgets are not actual spend.
- Marketing email delivery is not connected. Generated email content is a draft and is not sent.
- Direct-mail fulfillment is not connected. Printing, postage, vendor, and management costs remain separate.
- `ScalerNotificationMatchingCapacityV1` supports 400 saved Scaler preference records for proactive campaign matching. It creates a deduplicated Admin Issue at 320 records and a capacity-reached issue at 400 records.

## Next scaling step

Before exceeding the initial Scaler population, candidate discovery should be partitioned by normalized county/region/geohash, enabled area, job type, and travel eligibility. `OpportunityMatchV1` should then evaluate only the bounded candidate partition. Deterministic distance and preference rules remain authoritative; AI ranking is not used for geographic eligibility.

## Read-only production preflight

Before deployment, use trusted read-only operator credentials to record:

1. the count of approved Scaler profiles (`users.role == scaler` and the approved/active fields used by production); and
2. the count of saved Scaler preference records (`discoveryPreferences.role == scaler`).

If the saved preference count is 400 or greater, stop deployment review and implement geographic partitioning first. Do not write documents, change roles, or modify preferences during this check.
