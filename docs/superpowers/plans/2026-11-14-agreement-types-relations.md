# Agreement types and relation picker improvements

User-approved scope: use existing SearchableDropdown (ticket details style), extend only with optional menu footer and per-option action. Four built-in types stay fixed; global staff-created named types can be added via small +/input footer and archived via trash. Archive keeps old agreement type labels; custom dates remain manual. Store UUID type key in expanded Agreement.type, add AgreementType catalog with archivedAt. Staff customers.update manages catalog, customer cannot. Read labels include archived types.

Relation modal: select left of compact top-right search. Search populates body candidate list, with backend filtered pagination (eligible active customers, not self/linked/hierarchy-invalid); blank search shows existing relations with local pagination. Selection controls the bottom-right link action. Quick create uses footer submit, row removal stays next to record. Child list in agreements becomes collapsed details. Already-charged resolution directly updates status, no extra credit confirmation or second charge.

- [x] Failing service tests: catalog permissions/archive/history and relation candidate search/pagination/eligibility.
- [x] Migration/services/routes, shared custom dropdown support and type selector.
- [x] Relation picker + footer, collapsed child list, repeat-resolution bypass.
- [x] Browser tests, backend regressions, build and visual review.

No live deployment; preserve current workspace. Built-ins retain monthly/yearly automatic dates.

Verification: 5 backend integration/regression tests passed. All 10 focused browser scenarios passed (9 in combined run, relation-search scenario rerun after correcting the test page-size expectation from 10 to 5). Full production build passed; existing Vite bundle-size advisory remains. Desktop/mobile screenshots checked. Migration applied locally only; no publish. Self-review checked archived type labels, custom date handling, server candidate eligibility/counts, modal footer submission and idempotent repeat resolution.
