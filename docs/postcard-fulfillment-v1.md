# Neighborhood Postcards V1

Customer promise: **Fulfilled by ScaledCircle.** Customers choose an area, approve a mailpiece and final quote, pay ScaledCircle, and watch fulfillment. ScaledCircle uses replaceable print vendors and manually prepares USPS entry. There is no printer or USPS ordering API in this release.

## Availability and boundaries

The implementation is staging Beta. All order, payment and fulfillment actions reject production projects. The only provider credential accepted is the dedicated Stripe TEST secret; provider reconciliation also checks test mode. Production shows truthful unavailable/Beta copy rather than an unusable ordering button.

Software certification orders have an immutable simulation marker. Quotes, fulfillment confirmations, customer status and notifications disclose that no physical printing or mailing occurred. A simulation must never be converted into a real fulfillment record.

## Business flow

1. Business Services → Neighborhood Postcards → Create Postcard Campaign.
2. Enter campaign name, neighborhood, ZIP and preferred quantity. Final quantity must match complete USPS carrier routes confirmed by Admin.
3. Select existing Business services, a published Landing Page and an approved Brand Asset, or a text layout. New uploaded artwork first goes through the maintained Brand Assets approval flow.
4. Prepare and inspect both proof sides. Explicitly approve the immutable design/version before requesting a quote.
5. Review printing, pass-through postage, ScaledCircle fulfillment and tax, the complete routes, quantity, estimated mailing window and cancellation policy. Intentionally accept the exact design and quote before TEST Checkout.
6. Server reconciliation confirms the existing provider payment. Status updates automatically at a bounded 30-second cadence. No payment is fabricated from the browser return URL.

The service creates a canonical postcard campaign and binds the approved material, version, print artifact and existing response asset. An optional owned mapping-campaign reference is supported by the server; the current area form uses neighborhood and ZIP. It does not claim polygon-based USPS route selection. Targeted individual-address mail is outside V1.

## Admin operations

Admin → Postcard fulfillment lists the Business, campaign, target area, quantity, approved artifact, paid amount and private estimates/costs. Confirm the final quote using a real printer estimate and current USPS route selection for actual dogfood orders.

Sequential stages are Paid → Print Ready → Ordered for Print → Ready for Pickup → Print Received → USPS Preparation → Mailed → Completed. Holds, approval-needed and fulfillment-issue states preserve the last verified step. Resolving a hold returns only to that step; it does not repeat printing or mailing.

Printer confirmation or receipt evidence is required for actual print commitment/receipt. USPS acceptance evidence and an explicit acceptance date are required before actual Mailed status. A status update records both the entered acceptance date and the server recording timestamp. Private PDFs are size-limited, immutable and hashed. Customers do not receive vendor receipts or private cost data.

Actual costs preserve vendor, specification, quantity through the quote/order binding, print costs including vendor tax, postage, handling, other fees, customer charge and gross margin. Cost revisions retain an immutable history. Workflow timestamps support turnaround analysis; vendor ranking/automatic pricing is not yet claimed.

## USPS contract, checked September 8, 2026

EDDM Retail supports complete carrier routes, with a normal minimum of 200 pieces and at most 5,000 per ZIP per day. V1 conservatively rejects under-200 exceptions. Admin must check the daily total across other mailings as part of USPS preparation. Pieces weigh at most 3.3 oz. USPS supplies the current eligibility rules and account-based operational workflow. [Eligibility](https://pe.usps.com/text/dmm300/143.htm), [EDDM operations](https://www.usps.com/business/every-door-direct-mail.htm).

The current reference postage is **$0.260 per piece**, effective July 12, 2026. This is a dated reference, not an automatic permanent price. Every quote requires Admin confirmation of current USPS costs and a recent verification date. The postage line equals confirmed USPS cost; profit is in printing and the separate fulfillment fee. [USPS Notice 123](https://pe.usps.com/text/dmm300/Notice123.htm).

The chosen flat is 11 inches long by 6 inches high. Its length exceeds the 10.5-inch EDDM flat qualification threshold. Admin must verify flexible, uniform stock and actual weight; V1 conservatively requires at least 0.009-inch stock. The printed product must satisfy USPS physical standards, not merely PDF dimensions. [Physical standards](https://pe.usps.com/text/dmm300/101.htm), [eligibility](https://pe.usps.com/text/dmm300/143.htm).

Use USPS's own EDDM workflow/account to select complete routes, apply exclusions, obtain the current facing slips and PS Form 3587, and identify the designated drop-off office. Bundle by carrier route, 50–100 pieces per bundle and no more than 6 inches high. Retain actual acceptance/payment evidence. The software links the maintained official workflow rather than issuing a fake postal order or receipt. [Preparation](https://pe.usps.com/text/dmm300/145.htm), [postage and documentation](https://pe.usps.com/text/dmm300/144.htm).

## Print master and attribution

The maintained print architecture generates two CMYK PDF pages with embedded fonts/output intent, vector text/QR, 11 × 6-inch trim, 0.125-inch bleed and a 0.25-inch safe area. Approved raster assets use the maintained 300-dpi workflow. The back reserves a local postal customer address area and EDDM Retail indicia. Preflight and visual proof approval precede immutable binding.

The download verifies the maintained artifact binding hash and separately reports the raw file SHA-256. Those are distinct digests. Do not relabel the legacy serialized-buffer binding hash as a raw-file digest.

The QR resolves through the existing response asset to the Business's published Landing Page. Campaign attribution remains linked. No response, delivery, conversion or ROI is inferred merely from printing, mailing or a simulation.

## Money, cancellation and notifications

Final quotes expire after 48 hours and bind the route selection, quantity and exact approved artifact. Printing plus service revenue must cover confirmed print/handling estimates. Customer postage is exact pass-through; taxes are separately identified and require appropriate operational confirmation.

Checkout creation has a deterministic provider idempotency key. An ambiguous create enters a hold; it never blindly creates another session. Reconciliation retrieves the existing Stripe TEST session/payment intent, validates exact identity, amount and successful provider state, then writes one durable payment receipt. A staging-only scheduler checks outstanding known sessions every five minutes.

Before print commitment: full refund. After commitment: review documented unrecoverable costs. Mail already entered cannot be recalled. Cancellation blocks further fulfillment. Admin performs an authorized refund through Stripe, then the maintained action verifies that existing provider refund before recording it. Partial refunds display the exact confirmed amount. The current UI does not create provider refunds or promise automatic recall.

Exactly-once in-app notifications cover approved/paid, printing started and mailed. These are durable notification records, not claims of a separately integrated email or SMS delivery channel. Simulation notifications explicitly disclose their nature.

## Validation and release gate

Maintained tests cover quote arithmetic, current-route constraints, artifact/approval binding, CMYK/QR output, payment identity and amount checks, concurrent/idempotent creates and reconciliation, sequential stages, private evidence, actual acceptance dates, hold recovery, cancellation/refund protection, cross-Business/Admin authority and Rules denial of direct document access. Flutter tests cover responsive quote display, explicit acknowledgment, exact draft inputs, dialog disposal, action-error preservation and production unavailability.

The hosted proof must show one Business-created simulation, approved artifact, Admin quote, actual Stripe TEST payment, one paid queue entry, simulated fulfillment milestones, linked attribution and no Scaler earnings or Wallet effects. Private order IDs, payment IDs and evidence stay outside public Git.

Before LIVE activation Founder must confirm real local print cost/stock, tax handling, USPS route/preparation/drop-off workflow, usable print proof and refund operations. A separately reviewed production-compatible package and explicit Founder authorization are required. This staging certification does not enable real customer postcard charges, perform a print order, purchase postage, mail anything, or authorize production deployment.
