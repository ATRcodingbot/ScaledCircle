# ScaledCircle Brand System

Status: canonical identity adopted and production-verified on 2026-08-24.

## Canonical identity

The primary product identity is the exact approved symbol plus the `ScaledCircle`
wordmark on a transparent canvas. The legal entity remains **Scaled Circle LLC**.
Primary product wordmarks must not alternate between `ScaledCircle` and
`Scaled Circle`.

The approved raster source is:

`apps/mobile/assets/brand/source/scaledcircle-approved-artwork.png`

SHA-256:
`7FE471F94A00BD5595B9C48EA5EDE2EBF52004FC94B6C31EF65A279735D874FB`

The approved source is raster artwork. No SVG master is asserted because no
authoritative vector file was supplied. Vector tracing would redraw the geometry
and is prohibited.

## Approved derivatives

- `scaledcircle-lockup-dark-surface.png`: exact symbol and opaque white
  `ScaledCircle` wordmark on transparency.
- `scaledcircle-lockup-light-surface.png`: exact symbol and opaque navy
  `ScaledCircle` wordmark on transparency.
- `scaledcircle-symbol.png`: exact symbol on transparency for compact marks,
  favicon, app-icon source, and social avatars.
- `scaledcircle-secondary-marketing-lockup.png`: the approved symbol, original
  marketing wordmark, and `SCALE YOUR CIRCLE.` tagline on transparency. It is
  secondary and must not be forced into compact product UI.

All derivatives are generated mechanically by
`docs/generate_web_brand_assets.ps1`. The generator verifies the source hash,
removes only the supplied off-white canvas, preserves the source geometry, and
does not draw replacement artwork.

## Usage

- Dark application headers, Admin/Command Center, dark login and marketing
  surfaces: dark-surface lockup.
- Light pages, documents, email, and light cards: light-surface lockup.
- Compact/mobile navigation, favicon, application icon source, social avatar:
  symbol only.
- Presentations, flyers, press, landing hero art, and promotional compositions
  with adequate space: secondary marketing lockup.

Logo assets must remain proportional, crisp, and free of a baked white, dark, or
card background. A composition may place a transparent asset on an intentional
surface, but the canonical asset itself remains transparent.

## Prohibited treatment

- AI generation, redraw, vector trace, approximation, or reinterpretation.
- Stretching, skewing, altered concentric geometry, altered pin, or random
  gradients.
- Substitute fonts or independently typed primary wordmarks.
- Baked rectangles or cards in canonical logo files.
- Tagline use in compact navigation or dense operational interfaces.

If a required format does not exist, derive it mechanically from the canonical
source or request an authoritative source asset. Do not invent one.

## Brand inventory

- Replaced now: drawn Flutter ring placeholders, the hand-drawn SVG favicon,
  generated placeholder PNG icons, core public/authenticated header wordmarks,
  and the social preview's placeholder mark.
- Prepared now: transparent web/PWA favicon and maskable icon derivatives.
- Deferred to native release certification: Android and iOS launcher-icon
  replacement and store artwork, so the physical-device-gated build is not
  disturbed by a cosmetic release change.
- Deferred to comprehensive visual certification: verification, payment/refund,
  signup, support, and marketing email header artwork. Their copy is maintained,
  but broad transactional-email deployment is outside this Sales promotion.
