# Search presence: preserve existing pages, change delivery

Live read-only GET audit 2026-09-05: `/`, `/businesses`, `/scalers`, `/how-it-works`,
`/pricing` all return HTTP200, 4411 identical bytes, SHA256
`9fba919646f142aeedf1cf56535a125a0834f6df0a2fd2759252e09eddd17c9c`.
All have the same title and canonical `https://scaledcircle.com/`, and zero raw
HTML H1 elements. This verifies the shared document problem; it does not claim
the rendered pages are absent. Founder confirms those public pages already exist.
No pages were recreated and no DNS, Hosting or Squarespace mutation occurred.

Safe repo changes: sitemap now includes the five existing canonical path URLs,
retains `/i`, and removes unsupported stale lastmod dates. Removed unbuilt iOS
from SoftwareApplication operating-system claim. Robots already allows crawling
and points to the production sitemap; unchanged. These files are not deployed.
Sitemap alone does not fix duplicate canonical HTML.

## Recommendation and cost comparison

| Option | SEO strength | Estimated engineering effort, not a quote | Operations / risk |
| --- | --- | --- | --- |
| A: route-specific static/prerendered Firebase delivery of existing marketing content | Strong raw HTML metadata/content/link discoverability; existing URLs retained | 2–4 focused days extraction/templates + 1–2 days visual, auth, attribution and crawl regression | One host/repository; lowest migration risk. Exact marketing routes before Flutter fallback. Static HTML must stay in sync with existing content and approved pricing. |
| B: existing Squarespace marketing + app subdomain | Strong crawlable marketing when configured correctly; easier editor ownership | 3–6 days integration/migration QA, plus owner content review; subscription cost not priced here | Two content owners/releases; DNS, OAuth authorized domains, app links, cookies, attribution and redirects need coordinated migration. Do not recreate existing Squarespace pages. |

Recommend A for launch. This is an engineering estimate/inference from current
shared Hosting architecture, not a claim that Firebase ranks better than
Squarespace. B becomes attractive if Founder explicitly wants marketing editing
outside the repo; defer that operational split until launch stability.

Google recommends crawlable href links and avoiding fragment-based content routes;
raw HTML canonicals avoid competing client metadata. See
[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
and [canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
Squarespace also requires deliberate metadata/redirect upkeep:
[SEO checklist](https://support.squarespace.com/hc/en-us/articles/360002090267-SEO-checklist).

## Route metadata/content contract for the existing pages

| Route | Proposed unique title / H1 | Intent / sections |
| --- | --- | --- |
| / | ScaledCircle: Local Marketing and Verified Field Work / Local marketing connected to verified field work | Maryland overview; Business and Scaler paths; demonstrated workflow |
| /businesses | Local Business Campaigns in Maryland — ScaledCircle / Plan and review your local campaigns | Practical target areas; approved creative; evidence; attributable response |
| /scalers | Scaler Field Work in Maryland — ScaledCircle / Find and complete local field work | Available assignments; agreed compensation; job evidence; earnings without guaranteed-income claims |
| /how-it-works | How ScaledCircle Works / From campaign planning to completion evidence | Plan, assign, perform, review, earning; distinguish available features from upcoming payouts |
| /pricing | ScaledCircle Pricing / Choose the tools your Business needs | Authoritative subscription catalog, separate fulfillment/fees, clear bounded availability |

Each gets self canonical, og:url, matching unique title/description and approved
preview image/alt. Use Organization/WebSite for homepage, WebPage/BreadcrumbList
for sections; pricing offers only from authoritative catalog. No invented reviews,
ratings, earnings, LocalBusiness premises or generic JobPosting markup.

Reuse existing content components/copy as the source of truth. One meaningful H1,
ordered H2 sections, semantic navigation linking all five path URLs and existing
sign-in/signup CTAs. Keep product hash routes functional; never convert OAuth or
Response Asset routes as a side effect. `/r`, `/p/**`, legal/auth and unknown-route
behavior need explicit regression coverage before routing promotion.

Images: descriptive alt for Smart Mapping demo, assigned-job evidence and Business
review; empty alt for decorative duplicates. Preserve public-map attribution and
avoid screenshot PII. Mention Maryland/Baltimore/Columbia only where supported by
actual service context; no doorway locality pages or fabricated service coverage.
YouTube: existing approved demos link to matching canonical routes; add transcript,
descriptive title and chapter topics. No new video/upload or account action here.

Performance: remove Flutter boot from eventual marketing-only documents; reserve
image dimensions, compress derivatives, lazy-load below-fold media, subset fonts,
cache immutable assets and defer third-party scripts. Do not preload every image.
No measured LCP/INP/CLS result is available: run mobile Lighthouse and field/Search
Console comparisons after staging. Targets are release criteria, not claimed scores.

Before future production release: compare existing-page screenshots and text,
JS-disabled HTML, canonicals/OG/schema, sitemap MIME, robots, all hrefs, 404s,
authentication, OAuth callback and attribution redirects on staging. Verify five
distinct raw documents; Founder later submits sitemap/URL inspection in Search
Console. No need for Founder browser interaction during this preparation pass.
