# Explicit source acquisition for retained iOS39 recovery

Application remains `d60920930c81253f9019c19bed47a3eaf184dd3e`; original IPA SHA-256 remains `845c80206f166e9aea4ea56dcdf7f79f768d23bdc9697a08d32cb1dd90cda021`.

The first recovery failed because Codemagic fetched only the tooling tag at depth 1. The corrected workflow leaves TOOLING_DIR checked out and fetches `refs/tags/internal-native-parity-d609209` through its existing authenticated trusted origin at depth 1. It verifies the full expected commit, commit/tree/lock objects, and a separate clean APP_DIR worktree HEAD. No earlier history is needed by these guards. A wrong/missing ref or failed fetch stops before artifact retrieval and staging. Validators execute from TOOLING_DIR; source and compiled-brand comparisons receive APP_DIR explicitly.

Eight real Git transport regression cases use fresh file:// depth-1 clones with an initially absent application commit. They cover exact acquisition, wrong/unavailable ref, fetch failure, exact SHA, distinct checkouts, post-checkout HEAD verification and trusted-origin rejection. Additional orchestration coverage proves preparation failure cannot retrieve/stage the publishing artifact. Existing name/content/full-gate tests are retained. Combined execution: 25 iOS/preparation tests plus three branding tests pass; two of those 25 are unrelated maintained staging tests.

The source preparation fix makes no application-byte or dependency change. Codemagic remains one manually started upload-only workflow, free Mac mini M2, 30-minute maximum, no auto trigger/retry, existing Apple integration, no public submission. Only the exact original IPA can enter the publishing path after all six mandatory guard groups pass and its hash is checked again. Temporary artifact URL input must be removed after the attempt and Workflow Editor restored.

Android recovery is independent: the same frozen application and Flutter 3.44.8 are used in an isolated local checkout. Enforced locked pub get precedes one normal release appbundle invocation (without --no-pub). Compare lock and tracked source before/after; verify release registrant excludes the dev integration_test plugin while retaining production plugins; all maintained artifact/signing/branding gates must pass before one internal upload. No dependency upgrade, application change, paid service, or retry is authorized by this tooling document.

Runtime outcomes and store availability are recorded separately in ignored local safe evidence; passing preparation tests is not artifact validation or upload proof.
