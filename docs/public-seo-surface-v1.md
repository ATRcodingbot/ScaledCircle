# Public SEO surface V1 — implementation decision and page plan

Status: repository plan only. No DNS, Squarespace, Firebase Hosting, or production route change is authorized by this document.

## Finding

Firebase Hosting currently rewrites every unmatched path to one Flutter `index.html`. The document publishes one title, description, canonical URL, Open Graph set, and JSON-LD payload. `/businesses` and `/scalers` render distinct Flutter screens after JavaScript starts, but crawlers initially receive the same root metadata. `/how-it-works` and `/pricing` are not maintained routes. The sitemap lists only `/` and `/i`.

Hash destinations such as `/#/businesses` are not independent indexable documents and should remain attribution destinations only during migration. They are not the long-term canonical SEO architecture.

## Recommendation

Keep authenticated product routes on Firebase/Flutter. Put five server-rendered or static marketing documents at `/`, `/businesses`, `/scalers`, `/how-it-works`, and `/pricing`. Squarespace is suitable only if DNS/proxy ownership can preserve those exact paths while moving the application to a stable app host such as `app.scaledcircle.com`. Until that routing decision is approved, the safer repository implementation is Firebase-hosted static/prerendered marketing pages with explicit rewrites before the Flutter catch-all.

Do not ship placeholder shell pages. Each route must return useful HTML, its own canonical metadata, headings, links, and accessible images before Flutter loads.

## Exact metadata

| Route | SEO title | Meta description | Canonical |
| --- | --- | --- | --- |
| `/` | ScaledCircle | Local Marketing Campaigns and Verified Field Work | Plan focused local campaigns, create tracked marketing assets, and coordinate verified field work with Scalers. Built for local growth in Maryland. | `https://scaledcircle.com/` |
| `/businesses` | ScaledCircle for Businesses | Plan, Launch, and Measure Local Campaigns | Use Smart Mapping, tracked landing pages and QR assets, physical-marketing tools, and verified field workflows to operate local campaigns. | `https://scaledcircle.com/businesses` |
| `/scalers` | Become a Scaler | Find Flexible Local Campaign Work | Discover fixed-price local campaign opportunities, review the work and pay before applying, submit required proof, and track approved earnings. | `https://scaledcircle.com/scalers` |
| `/how-it-works` | How ScaledCircle Works | From Local Campaign Plan to Measurable Response | See how a Business chooses an area, creates a campaign, coordinates approved Scalers, verifies work, and reviews attributed responses. | `https://scaledcircle.com/how-it-works` |
| `/pricing` | ScaledCircle Pricing | Plans for Local Campaign Operations | Compare ScaledCircle plans for campaign planning, attribution, marketing creation, and managed growth. Variable campaign and provider costs remain separate. | `https://scaledcircle.com/pricing` |

Open Graph and X metadata must mirror each route's title, description, canonical URL, and route-appropriate 1200×630 image. Do not point to an image URL until it returns the actual image MIME type rather than Flutter HTML.

## Exact page copy map

### Home

H1: **Run local marketing with a clearer map and a measurable next step.**

Lead: ScaledCircle helps a Business choose where a campaign should operate, create the assets that carry it, coordinate approved field work, and connect responses back to the campaign.

Primary CTA: **Explore ScaledCircle for Businesses** → `/businesses`

Secondary CTA: **Find out how Scaler work operates** → `/scalers`

H2s: **Choose the area that matters**; **Build a campaign people can respond to**; **Coordinate field work with proof**; **Learn from real response evidence**.

### Businesses

H1: **Turn a local service area into an operating campaign.**

Lead: Use Smart Mapping to focus a campaign, create landing pages and tracked QR or response assets, prepare physical marketing, and review what happened without stitching together unrelated tools.

Proof points: Smart Mapping; Landing Pages; tracked Response Assets; Physical Marketing creation/download; Brand Assets; campaign attribution; Business/Scaler workflow.

Boundary copy: Integrated printing, mailing, tracking phone, full ad management, and automated social publishing are available only when their current provider and product status says they are ready.

CTA: **Create a Business account** → `/create-account`

### Scalers

H1: **Do clearly defined local campaign work with the terms visible up front.**

Lead: Review the location, workload, proof requirements, fixed campaign pay, and estimated effective compensation before applying. Start tracking only after an assignment begins, submit evidence, and follow completion and earnings in the Job Room.

Compensation copy: ScaledCircle recommends base campaign pay equivalent to at least $20 per estimated workload hour, rounded to the next $5. Campaign pay remains fixed-price; workload time is an estimate, not an employment classification or guaranteed duration.

CTA: **Create a Scaler account** → `/create-account`

### How it works

H1: **One campaign authority from plan to proof.**

Steps: 1. A Business defines the goal and service area. 2. Smart Mapping turns the area into bounded campaign geography. 3. The Business approves the campaign, assets, compensation, and response path. 4. Approved Scalers can apply to defined field work. 5. Assigned work records bounded evidence. 6. The Business reviews completion. 7. ScaledCircle preserves attribution, completion, and earning evidence without inventing unavailable results.

CTA: **See Business capabilities** → `/businesses`

### Pricing

H1: **Choose the operating support your local campaigns need.**

Lead: Plans cover ScaledCircle software and managed operating support. Campaign compensation, printing, postage, phone, advertising, and other provider costs remain separately disclosed and approved.

The page must read prices and allowances from the server-authoritative plan catalog. Do not hardcode stale plan economics into static HTML. If the catalog is unavailable, show **Pricing is temporarily unavailable** rather than guessed values.

CTA: **Compare current plans** → the server-backed pricing component; **Create a Business account** → `/create-account`.

## Structured data

Root: `Organization` for Scaled Circle LLC plus `WebSite`. Businesses/how-it-works: `Service` describing campaign operations, not guaranteed results. Product routes may use `SoftwareApplication` only with truthful supported platforms and no fabricated rating or offer. Pricing may use `Offer` only when generated from the authoritative catalog. Scalers must not use `JobPosting` for generic recruitment copy; emit it only for a real open campaign with required fields.

## Internal linking and local intent

Every page links to the other four marketing pages and the appropriate account CTA. Natural copy may reference Maryland, Baltimore-area Businesses, Howard County, and Columbia where the actual service/campaign context supports it. Do not create doorway pages or imply statewide availability for unfinished provider services. YouTube walkthroughs should link to the matching canonical page; pages should embed or link only approved demonstrations with transcripts and descriptive titles.

## Images and alt text

- Smart Mapping: `Smart Mapping view showing privacy-safe Maryland campaign zones`
- Response workflow: `ScaledCircle landing page and tracked QR response workflow`
- Business workflow: `Business campaign review from planning through completion evidence`
- Scaler workflow: `Scaler Job Room showing assigned work, proof, and completion status`
- Physical marketing: `ScaledCircle physical-marketing design prepared for download`

Alt text describes the meaningful UI state, not decorative branding or keyword lists. Screenshots must contain no private addresses, customer PII, internal IDs, or fake results.

## Sitemap, robots, and Search Console

The release sitemap must list the five canonical marketing URLs and omit hash routes. `robots.txt` already allows crawling and identifies the sitemap. Verify both return HTTP 200 and XML/text MIME types after deployment. Search Console ownership/index state cannot be inferred from source; the Founder must verify the domain property, submit the sitemap, inspect each canonical URL, and review indexing/Core Web Vitals after routing is live.

## Stale copy inventory

- `waitlist_screen.dart`: “Maryland Early Access” must be reconciled with the actual launch state before public use.
- `scaler_funnel_screen.dart`: Push is marked “Coming Soon”; retain only while push is genuinely unavailable.
- `public_landing_screen.dart`: Lead and response tracking is marked “Coming Soon” even though attribution foundations exist; replace only after the customer-visible capability is certified.

## Smallest implementation batch

1. Approve Firebase static/prerendered ownership or a Squarespace/app-subdomain split.
2. Build the five route-specific HTML documents and route-specific preview images.
3. Add exact-path Hosting rewrites before the Flutter catch-all; keep authenticated routes unchanged.
4. Add sitemap entries and per-route structured data.
5. Test raw HTML, JavaScript-disabled content, canonical headers, 404s, desktop/mobile layout, accessibility, and Flutter authentication routes on staging.
6. Deploy staging, run crawler and social-preview validation, then request a separate production Hosting/DNS approval.

No DNS or production routing action is part of this plan.
