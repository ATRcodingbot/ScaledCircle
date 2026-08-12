# Waitlist test subscriber reset

Scaled Circle waitlist records are role-specific. The canonical document ID
is SHA-256 of `role:normalizedEmail`, while deterministic subscriber email jobs
use SHA-256 of `normalizedEmail` alone. Email normalization trims surrounding
whitespace, limits input to 254 characters, and lowercases it. Domains and
aliases are not rewritten.

The reset utility is deliberately dry-run and emulator-first. It never scans
or deletes a collection. It calculates exactly one role-specific waitlist path
and the two deterministic subscriber email-job paths.

## Emulator dry run

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
node .\tools\reset_waitlist_test.js skotiatrades@proton.me `
  --role scaler `
  --project demo-scaledcircle
```

Add `--execute`, review the three displayed paths, then type the exact prompted
confirmation to delete them from the emulator.

## Production safeguards

Production reset is an exceptional administrator/developer operation. First
run a dry run and review every displayed path:

```powershell
node .\tools\reset_waitlist_test.js skotiatrades@proton.me `
  --role scaler `
  --project scaled-circle `
  --production `
  --confirm-email skotiatrades@proton.me
```

Only after explicit approval, repeat with `--execute` and type the exact
interactive confirmation. The utility refuses production unless the project,
production flag, role, and repeated normalized email all agree. It does not
contain or read SMTP, Firebase, or Stripe secrets.

Deleting only the historical email-only waitlist hash does not reset current
role-specific waitlist records. A Business and Scaler signup for the same email
have distinct waitlist documents but intentionally share the same subscriber
email-job IDs, preventing duplicate subscriber messages.
