# Company management implementation plan

**Goal:** One management dialog for independent customers and companies, with company contacts and a single company credit balance.

**Approved design:** Independent customers retain their own agreements. A root customer with people is a company account; people remain User records with parentCustomerId so login and ticket history stay intact. The main customer list requests root accounts only; ticket selectors still include contacts. The combined dialog has Agreements and Credit / Company People tabs. New people are created directly within the company. No parent/child terminology or sharing toggle in the UI. Attached people use company agreements exclusively. Existing personal agreements are preserved as read-only legacy history without moving balances.

**Architecture:** Reuse parentCustomerId, agreements and credit charges; no schema or destructive data migration. Enforce company-only credits in summary, creation and debit paths. Preserve authorization keys and per-person charge attribution.

**Tech Stack:** Express, Prisma, React, React Query, Playwright, node:test.

- [x] Add failing backend tests for root lists, company-only balance/debits, legacy preservation and blocked personal agreement writes.
- [x] Update agreement service and customer list filtering; retain ticket directory access.
- [x] Combine action buttons and management dialog; implement numbered company people table with create/edit controls.
- [x] Simplify credit summaries and remove company sharing UI; expose legacy agreements read-only to staff.
- [x] Verify backend rules, browser flows, permissions, responsive layout and builds; document final behavior.

Ruling: No separate Company model or automatic matching by company name. Existing explicit parentCustomerId is the company boundary, avoiding accidental merging of similarly named companies.
Ruling: Existing personal balances remain recorded but are unavailable while attached. No automatic transfer, deletion or spending from those agreements.

Verification: backend company-policy / agreements / relation-create / customer-project tests pass; 18 affected browser scenarios verified across the broad run and corrected reruns. Frontend production build and backend typecheck pass. Independent review findings fixed: prevent deleting companies with attached contacts, retain contact file access within the same dialog. Form fields have equal heights, no nested email border, and formatted phone numbers.
