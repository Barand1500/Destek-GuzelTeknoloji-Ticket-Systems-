# Customer email access and quick relationship creation

User-authorized scope: main /auth screen gets E-posta ile Devam Et, email then one-time code, normal customer session. Only existing, active, nondeleted CUSTOMER without staff accessRole. A unique login identity takes priority; otherwise a unique primary contact email matches. Ambiguous, missing and staff emails get the same generic response and no customer account is created. Existing form access tokens keep their scope.

- [x] CustomerLoginChallenge model/migration, 10-minute HMAC code, 5 attempts, 5 sends/hour, replacement/replay/changed-email checks. Issuing a regular session and consuming the code happen atomically.
- [x] Main auth UI uses existing Turnstile login action and durable mail queue. Existing password login stays.
- [x] A customer OTP session grants a 15-minute, single-use password-setup capability, only for password changes; other credential changes still require current password. Profile exposes that capability, never the code/hash. Setting password revokes other sessions and preserves login identity during staff contact edits.
- [x] Quick-create inside CustomerRelations for either child or parent: current required customer fields, existing creation checks and notifications. Creation and linking share a transaction. Both customers.create and customers.update required.
- [x] Remove announcement trigger and modal from CUSTOMER shell.
- [x] Integration tests (OTP validity, attempts/replay/ambiguity/scope, setup proof, atomic relations), mocked browser tests, build and visual checks.

No live deployment or external provider test sends. Test mail jobs are delayed to 2099 and cleaned up. Work remains in the user's current workspace; no automatic commit/push.

Verification: production build passed; 7 focused backend tests and 2 password recovery regressions passed. Browser coverage verifies both quick creation directions, email-code login including invalid code, profile password setup and customer announcement hiding. Tests use mocked browser API and delayed/cleaned database mail jobs; no live delivery verified.
