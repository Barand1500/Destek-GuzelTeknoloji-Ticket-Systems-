# Company shared credit implementation plan

User-approved design: company-wide switch controls direct children's access to company agreements; personal credits remain independent. Existing companies default on for compatibility. Staff with customers.update or the root customer itself may change only this switch. Children cannot change company policy. History and ticket visibility stay unchanged. Child summaries separate personal and company balances. Root agreements show children with personal balance and ticket/details links. Resolution sorts personal packages before shared packages, then by expiry. Reuse confirm-modal and standard-modal-close with Lucide X, preserving focus trap and pending guards.

- [x] Failing service test for policy permissions, balances and debit rejection.
- [x] User.shareCreditsWithChildren migration; services/routes for policy, summaries, ordering and synchronized debit.
- [x] Company switch, balance cards, child list and standard modal appearance.
- [x] Backend/browser tests, production build, screenshots and documentation.

Work in existing workspace preserving in-progress changes. No commit, push or live deployment.

Verification: service policy/permission/balance/expiry ordering tests passed, including a RepeatableRead snapshot opened before sharing was disabled; no shared debit recorded. Related-customer creation, dates and portal-channel regressions passed. Desktop/mobile screenshots inspected. Browser tests cover staff and company-self toggle, child summaries/navigation, separated balances and suggested package selection. Existing agreement browser regressions passed. Production build passed; migration applied locally only.

Final checks: 4 targeted backend integration/regression tests and all 7 agreement/company-sharing browser tests passed. Backend and frontend production builds passed (existing Vite chunk-size advisory only). Self-review checked customer-self versus child permissions, current company policy under stale snapshots, balance ownership and modal keyboard behavior. No live deployment.
