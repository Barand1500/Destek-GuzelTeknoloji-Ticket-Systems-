# Staff credit usage report plan

**Goal:** Report the employee who actually charged credits, ticket, customer, agreement, date and amount.

**Architecture:** Read CreditCharge.actorId, not current ticket assignment. A separate paginated reports endpoint supplies rows, totals and per-actor summaries under reports.view and existing conversation visibility. Existing reports tab filters supply agentId, departmentId and 7/30/90-day window, measured at charge time. No schema change or mutations to credits.

**Tech Stack:** Prisma/Express, React Query/React, node:test and Playwright.

- [x] Add backend regression test for actual actor attribution, period, department, totals and own-scope restrictions.
- [x] Implement paginated credit report endpoint with minimal selected fields and actor-name lookup.
- [x] Add report component with employee totals and linked ticket table; wire existing filters.
- [x] Verify API rules, browser display and filters, typechecks and frontend build.

Validation: staff-credit-report.test.ts passes (actual actor vs reassignment, charge-time window, pagination, department, OWN/DEPARTMENT scope and customer/permission denial). reports.spec.ts passes with credit totals, zero-credit rows, ticket links, person/department/day query filters and mobile themes. Frontend production build and backend typecheck verified.
