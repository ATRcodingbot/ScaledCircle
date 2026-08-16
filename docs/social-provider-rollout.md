# Social provider rollout boundary

ScaledCircle's visual review, editing, approval, media ownership, and scheduling
contracts are provider-neutral. Production publishing remains disabled until each
provider completes its external requirements and a reviewed adapter is installed.

## Phase 1 — Meta

- Create and verify a Meta business developer application.
- Configure reviewed redirect domains and privacy/data-deletion URLs.
- Obtain the permissions required for Facebook Page publishing and Instagram
  professional-account publishing through Meta App Review.
- Implement server-side authorization callback, protected token storage,
  refresh/revalidation, disconnect/revocation handling, and sandbox publication.
- Validate Facebook feed and Instagram feed/story capability separately; a
  connection must advertise only permissions actually granted.

## Phase 2 — Google Business Profile

- Obtain Google Business Profile API access for the production Cloud project.
- Configure consent-screen verification and approved redirect domains.
- Implement server-side account/location selection and protected credentials.
- Validate post creation and public-link/result reconciliation in a review account.

## Phase 3 — LinkedIn

- Create and verify the LinkedIn developer application and organization.
- Obtain the applicable organization/community-management publishing product and
  permissions.
- Implement server-side organization selection, protected credentials, and
  reviewed test publication.

## Current truthful status

Facebook and Instagram show **Connection requires approval**. Google Business and
LinkedIn show **Coming Soon**. No provider credential is accepted by Flutter, no
provider adapter is configured, and scheduled publishing fails closed until a
reviewed connection reports `canCreatePost: true`.
