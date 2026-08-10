# Scaled Circle Squarespace launch setup

## Recommended launch shape

- Keep the public `www`/apex site on Squarespace.
- Add the contents of `coming-soon-waitlist-embed.html` to a Squarespace Code Block on the Coming Soon page. It contains no secret keys.
- Point a separate `app` subdomain to the Firebase-hosted Flutter app when the private web beta is deployed.
- Keep public registrations closed. The waitlist creates a `waitlist` record only; it never creates Firebase Authentication access.
- Give private test accounts `active: true` or `betaAccess: "approved"`. Give the Attractive Remodel admin user document `role: "admin"`. Do not use an email-domain check as authorization.

## Squarespace

1. Edit the Coming Soon page and add a Code Block.
2. Select HTML and paste the complete embed file.
3. Confirm JavaScript is permitted on the current Squarespace plan. If it is not, use a normal Squarespace button that links to the Flutter public site instead.
4. Publish, then test one Business and one Scaler submission.

## Domain plan

- `www.scaledcircle.com`: Squarespace public marketing site.
- `app.scaledcircle.com`: Firebase Hosting for the Flutter web app.
- `go.scaledcircle.com`: later custom tracking-link domain; current links use Cloud Functions directly.
- `reply.scaledcircle.com`: later SendGrid inbound-parse subdomain. Do not change the root domain's normal email MX records.

GoDaddy remains the DNS registrar. Squarespace remains the public website. Firebase serves the authenticated application and server endpoints.

## Tracking boundaries

- Web, QR, Scaled Circle landing pages, and print-ready PDFs work without a forwarding provider.
- Tracked phone numbers need a telephony provider such as Twilio and incur provider charges.
- Tracked inbound email needs a dedicated subdomain and an email provider/webhook such as SendGrid Inbound Parse.
- Do not label phone or email tracking active until those provider resources are provisioned.

## Weather opportunity wording

The alert title, area, severity, and timestamps are National Weather Service facts. The lead-lift range is an experimental Scaled Circle model output, must remain labeled as an estimate, and is not a promise of leads.
