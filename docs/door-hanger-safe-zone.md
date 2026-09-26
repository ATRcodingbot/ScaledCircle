# Door-hanger safe-area rule

Implementation is in the isolated web/server worktree; it is not deployed. The frozen native candidate is unchanged.

## Maintained paths

- `functions/physical_marketing.js`: draft normalization, immutable preparation, PDF master, proof renderers, printer JPG export, approval/readiness.
- `functions/door_hanger_geometry.js`: reviewed format authority, geometry, safe-content checks and generation instructions.
- `functions/generation_foundation.js` → `openai_image_adapter.js`: geometry passed before image composition. Service images are contained inside the safe region; no attention crop removes important details.
- `apps/mobile/lib/screens/business/physical_marketing_screen.dart` and `widgets/door_hanger_proof_guide.dart`: proof-only overlay and downloads. This isolated change does not alter the frozen native branch.

## Verified format

All three maintained door-hanger design layouts use the one maintained physical product, `door_hanger_3_5x8_5`. They now bind to `gotprint_3_5x8_5_20260926`, geometry version `DoorHangerGeometryV2`.

The official [GotPrint template archive](https://static.gotprint.com/templates/gotprint.com/doorhanger-3.5inx8.5in.pdf.zip) was downloaded September 26, 2026. Front/back SHA-256 hashes are recorded in the geometry module. Its PDF pages measure 261 × 621 points: 3.625 × 8.625 inches with bleed; trim is 3.5 × 8.5 inches with 0.0625 inch bleed per edge. This resolves the approximately 3.62 × 8.62 input without rounding production dimensions.

The blue safe boundary includes a circular region and diagonal slit, mirrored on the reverse. The model records a conservative circle/slit envelope in trim-top-left inches. All important content is placed below a conservative 2.15-inch safe line on BOTH faces. This is a deliberate layout rule derived from this template, not a universal door-hanger rectangle. Trim safety remains 0.125 inch. New vendor IDs or changed dimensions fail closed until independently verified.

PDF exports have trim/bleed boxes, CMYK output intent and embedded fonts. Printer JPGs are flattened, 350 DPI CMYK, 1269 × 3019 pixels, with no UI guides. GotPrint's template asks for outlined text in supplied artwork; use the flattened printer JPGs for that vendor, not an assertion that embedded-font PDFs are outlined. Digital JPGs are separately labeled for screen use. QR export retains four quiet modules and minimum 0.8-inch physical size.

## Enforcement and uploads

Actual PDF text/image/QR drawing bounds are checked before returning an export; a violating layout is blocked. The same safe line drives proof composition on each side. Geometry is included in immutable version identity so changed geometry generates a new proof/version.

The existing upload feature supplies logos/service images to fixed template slots. Those images are contained below the safe line. Full-page artwork upload is supported only for the existing EDDM postcard workflow, not door hangers. Direct door-hanger requests carrying full-page artwork are now explicitly rejected instead of silently ignoring the upload. There is no OCR-based door-hanger certification or full-page repositioning editor. The safe-content checker rejects incomplete/unknown bounds; adding a full-page door-hanger upload workflow would require verified content bounds and a correction UI before enabling print-ready approval.

## Migration and limits

Existing door-hanger versions need regeneration and renewed visual approval. History is not rewritten: the workspace marks legacy versions as needing attention and does not offer their old download paths; approval rejects versions without the current geometry version. Already downloaded or previously disclosed Storage URLs are not retroactively erased/revoked by this source change. Deployment/migration must account for those historical files before claiming that every historical direct download has been replaced.

No other maintained door-hanger vendor/format is enabled. GotPrint's 3.5 × 11 rip-card, 4.25 × 11, 5.5 × 17, horizontal variants and other printers are NOT verified by this work and must not inherit this geometry. Postcards, flyers and other material geometry remains unchanged.

## Verification

Focused tests cover high logo/headline/QR/contact/legal/photo bounds on both sides, valid content, incomplete upload warnings, unsupported uploads, changed vendor/size, legacy approval, actual PDF trim/bleed, 350-DPI CMYK raster metadata, guide-free exports, visible UI guide and unaffected non-door-hanger presentation. Existing physical-marketing rendering/QR, generation and adapter regressions are included. All test artwork is synthetic local evidence; no customer records, generation request or print order is created.

Validation result: 69 focused backend tests passed, 0 failures/skips; 2 Flutter guide tests passed; analyzer clean for the two affected UI files. Local PDF front/back visually inspected. No deployment, native build, model call or printer order was performed.
