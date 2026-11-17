# Credit Store Implementation Plan
> Inline implementation using executing-plans; preserve existing workspace edits.
**Goal:** Persist admin pricing/catalog and show customer credit calculator/subscription previews without pretending to collect payment.
**Architecture:** Dedicated catalog settings + plans; validated quotes from server; no purchase/credit mutation until provider integration.
**Tech Stack:** Prisma/MySQL, Express/Zod, React Query/React.
**Spec:** docs/superpowers/specs/2026-11-17-credit-store-design.md
## Constraints
TRY, integer credits, exact kuruş arithmetic, active-account checks, permission checks, no real payment or new credit, no changed existing agreements.
## Review focus
- Fractional credits/invalid values never silently lose money.
- Closed plans and inactive accounts cannot quote.
- Changing price requires a new preview.
- Errors/loading never resemble payment success.
- Catalog changes are audited and exposed only through permission checked routes.
## Tasks
- [x] Test and implement money/quote validation and period rules.
- [x] Add catalog schema + additive migration, authorized API and audit records; test persistence/scoping.
- [x] Admin pricing/plan forms and customer calculator/plan/preview panels; responsive existing theme.
- [x] Run focused tests, both builds and UI/structure checks; document payment integration boundary.

## Ledger
- User clarified screens first; no provider credentials. Purchase orders/settlement/subscription renewal deliberately not implemented.
- Local additive migration deployed; existing balances and agreements untouched.
- Review found stale calculator after rate refresh: reproduced with failing browser regression, fixed clearing linked fields on price change.
- Fractional amount errors now suggest valid nearby totals.
- Current period policy is a visible catalog preview only, not a change to existing agreement consumption.
- tmp/search-baseline-check/backend/src/generated/prisma is a filesystem link to the active generated client; generated changes were preserved.

Validation: 5 backend tests, 3 mocked Playwright flows (light/dark/mobile and price refresh), real catalog database read, backend/frontend builds, formatting and diff checks passed. Reviewer rechecked both findings and found no remaining blockers.

## Follow-up: currency, formatting, ownership
User requested currency selectors/localized monetary inputs, consistent dropdown/textarea/close styling, hidden number spinners, and owner-only purchase access. Add TRY/USD/EUR/GBP per catalog price/plan (no currency conversion), format money in Turkish grouping, reject child accounts in catalog/quote services and hide purchase entry. Default existing records to TRY using an additive migration. Regression tests cover child access and Turkish money parsing.

Follow-up verification: 6 focused tests and 4 Playwright flows passed. Browser checks assert transparent textarea/dropdown backgrounds, hidden spinner appearance, localized money and currency payloads, and hidden entry for linked customers. Currency migration deployed locally. Review found malformed thousands grouping opportunity, corrected with regression coverage.
