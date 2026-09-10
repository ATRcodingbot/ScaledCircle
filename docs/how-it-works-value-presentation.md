# How It Works value presentation

The public `/how-it-works` route now explains the connected Business workflow:
choose the market, build the campaign, real people execute it, measure the result.
The page connects mapping/property context, weather, tracking/attribution and
growth intelligence without inventing household coverage, leads or return on
investment. The contractor example is explicitly a workflow illustration.

The page uses semantic HTML, a responsive four-step layout and an inline diagram.
It needs no external image request or Flutter download. Mobile navigation uses a
keyboard-operable Menu. The main business action appears in the hero and close;
Find Work is secondary. Premium/private tools have availability labels and no
purchase controls.

`tools/prepare_marketing_delivery.py --route /how-it-works` overlays only this
page onto a maintained Hosting artifact. Other pages, robots, sitemap, Firebase
rewrites, authentication resolution, product hash routes and referral propagation
remain in their existing delivery path. A source commit is not a production deploy.

Verification: marketing generation/metadata/navigation tests and
`tools/verify_how_it_works.cjs` against the actual served HTML at six viewport
widths. The verifier captures mobile and desktop screenshots, exercises the
mobile menu and referral links, and detects horizontal overflow and script errors.

## Research geography

Growth dogfood reads the bound tenant's maintained `discoveryPreferences` at each
research cycle. A tenant-specific ordered list of existing area IDs may prioritize
those saved areas; it cannot create territory or import another tenant's records.
City and county matching remain distinct. Existing source records can be rechecked
even if the current service area changes, preserving their provenance and drafts.

Missing or mismatched geography holds new out-of-scope discovery and is reported
explicitly. It never causes an account or geography record to be fabricated.
Summaries group genuine Business, organization-partner and individual-Scaler
counts by service area. An organization partner is not a recruited Scaler.
The bounded source pool still limits discovery; this is not unlimited search.
