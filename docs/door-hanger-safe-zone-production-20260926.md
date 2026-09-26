# Door-hanger production deployment — 2026-09-26

Deployment package source: `cfdd88836b346a6cd01a6d3d7fa97b776cc7a8d5`, based on reviewed implementation `fb7766973f5c503b0451a4a71825002277ea3c98`. Retained production overlays and immutable source hashes are in `tools/releases/door_hanger_20260926/manifest.json`. Existing entrypoints, dependency locks, runtime, service identity, ingress, secret/environment bindings, memory and timeouts were preserved.

| Function | ACTIVE revision |
|---|---|
| preparePhysicalMarketingVersion | preparephysicalmarketingversion-00005-laf |
| approvePhysicalMarketingVersion | approvephysicalmarketingversion-00004-fip |
| getPhysicalMarketingWorkspace | getphysicalmarketingworkspace-00004-fiz |
| mutatePhysicalMarketingMaterial | mutatephysicalmarketingmaterial-00004-pol |
| getPhysicalMarketingOperations | getphysicalmarketingoperations-00003-hal |
| requestGeneratedServiceVisual | requestgeneratedservicevisual-00009-quv |
| processGeneratedServiceVisual | processgeneratedservicevisual-00011-xaf |

Hosting version `5109fcb0edb9ddf8`, released 2026-09-26 10:15:59 America/New_York (14:15:59 UTC). Public main.dart.js hash matches the deployed package.

## Inventory and migration

Production inventory: 3 door-hanger versions; 0 current geometry, 3 legacy/unknown. Three material records now have DRAFT status and no current approvedVersionId. Three deterministic migration audit records exist. Immutable versions, three artifact records and two historical approval records remain preserved. Each version hash was unchanged across migration.

Read-only workspace execution with the deployed renderer against production data confirms all three show Needs regeneration / Needs renewed approval, null PDF/digital-JPG download paths, and no printable raster paths. Browser readback on production Physical Marketing confirms this disposition and the automatic-safe-area/full-page-upload notices. Regeneration creates a new immutable version; old approval cannot approve it.

No confirmed order or external-download records were found in maintained inventory; external download history remains unknown. Historical Storage was NOT revoked. All three old objects still exist; two retain download tokens, and existing owner Storage access remains. Previously obtained URLs/direct historical access can therefore still retrieve unverified historical artwork. Current workspace download/approval eligibility is removed; this is not a claim of historical-link revocation.

## Verified supported format

Only `door_hanger_3_5x8_5`, vendor geometry `gotprint_3_5x8_5_20260926`, `DoorHangerGeometryV2` is enabled. Trim 3.5 × 8.5 inches; bleed canvas 3.625 × 8.625; verified hole/slit with mirrored reverse; conservative 2.15-inch top safe line on both faces; .125-inch trim safety. Other vendor/size/landscape variants fail closed. Full-page uploaded artwork remains unsupported; logo/photo slots use controlled layout, not OCR certification.

## Post-deployment verification

Downloaded deployed renderer and generation archives match the release manifest hashes. 32 renderer/geometry tests passed, zero skipped. Synthetic local exports from that deployed code verified two PDF faces, 261 × 621 point media size and trim boxes, content bounds below the safe line, QR quiet zone, embedded fonts, guide-free output, and both printer JPGs at 1269 × 3019, 350 DPI, CMYK. Both faces were visually inspected: reserved top area clear, readable body and QR, no printed guide or fake hole.

Pure prompt tests on both deployed generation archives confirm canonical geometry is applied before model dispatch, including protection of legacy queued briefs with stale geometry. No model/provider request was made. These are local synthetic production-code export checks, not a live customer generation or printer order.

Evidence retained under ignored `.firebase/door-hanger-deploy/`: production-tests.log, production-fixtures, deployment-readback.json, workspace-readback.json, hosting-readback.json, inventory-before.json, migration-applied.json and legacy-storage.json. Private metadata is not committed.

## Native disposition

Frozen native checkout remains clean at `0f57f0894a06fc0de0b769d3c4fa012c62e51cb1`. No native build, merge, CI run or store change. Tested proof overlay remains in isolated source and this web build for reconciliation during the next separately required native release. Installed clients are not claimed to contain the guide; server export enforcement applies independently.
