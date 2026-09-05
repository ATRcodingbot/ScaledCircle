# Social Publish Resilience V1

Local candidate only; no deployment or provider action. Frozen X v4 and production
connection certification remain authoritative. Customer flow: Connected → Needs
attention → Reconnect → Verified → Continue approved work. Reconnect never approves content.

| Discovery | Provider-neutral responsibility | Adapter / UI boundary |
| --- | --- | --- |
| Expired auth, stale pending attempt | Expiring tenant-owned attempt; conditional cleanup; preserve healthy connection | Existing X expiry/PKCE implementation tested; Meta must map its own expiry/errors. Customer sees Reconnect. |
| Fresh authorization | Supersede an attempt, never an approval or job | State/PKCE and provider scope selection stay server-side. |
| Read/write capability | Health, verified identity, actual scopes and server-confirmed grant | X scope policy remains X-specific. Meta Page/professional-account grants require a separate reviewed policy. |
| Rotation and races | Lease, generation compare-and-set, persist before reads, reject stale writers | X refresh exchange stays in X adapter. Meta token lifecycle is not X refresh-token behavior. |
| Deleted post | Keep immutable historical publication and observed deletion evidence | Existing X reconciliation retained. Never automatically delete or regenerate. |
| Short URLs and images | Adapter returns verified normalized receipt, keeps original evidence | X t.co/entities/media matching is X-specific. Meta container/permalink normalization remains future work. |
| Unknown/partial outcome | Reconcile before retry; terminal jobs cannot reopen | No generic assumption that an absent response means no post. Partial carousel creation needs Meta container reconciliation. |
| Duplicate prevention | Stable job, approved version, atomic claim, terminal receipt | Pure helper is not an atomic executor or exactly-once network guarantee. Provider-neutral external executor remains gated. |
| Approval preservation | Connection changes do not mutate content, approval hash, schedule or job | Same identity may resume eligible work; changed identity fails closed; uncertain outcome stays paused. |

## Local changes

Shared health projection suppresses stale capabilities and exposes Needs attention.
Refreshing/validating/unknown explicit health cannot advertise healthy X access.
X capabilities use verified scopes and write grant rather than a read/write label
alone; separate publication authority remains off. Job creation rejects a connection
for another provider. Shared transition helpers reject terminal reopening and
unknown/partial outcome relabeling for retries. Customer reconnect recognizes error
and attention states without adding UI controls.

Admin-only: attempt IDs, PKCE, generations, refresh leases, provider receipts, repair
jobs, reconciliation errors and IAM. The existing first-X repair card is a staging
Founder certification surface; do not expose it to production customers.

## Verification

72 focused Node tests and 6 Flutter Social tests pass. Coverage includes healthy
scope composition, expiry, exact identity, refresh rotation, stale-generation races,
deleted historical state, immutable replacement provenance, unknown/terminal jobs,
safe projections, provider secret isolation and customer copy. No provider calls.

OPEN before generic publishing rollout: emulator-backed atomic claim concurrency,
persisted approved-job reconnect integration, adapter-bound account/content receipt
validation and supervised provider failure/reconciliation certification. Shared
unknown outcomes deliberately cannot become retryable without that future protocol.
