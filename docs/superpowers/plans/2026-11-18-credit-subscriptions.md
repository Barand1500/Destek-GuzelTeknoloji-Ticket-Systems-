# Credit subscription foundation
Scope approved in conversation: prepare package and agreement renewals without connecting a payment provider.
1. Expand schema with subscriptions, period orders and payment attempts. Preserve all existing rows and renewal preferences. Deploy additive migration and regenerate Prisma.
2. Add anchored calendar scheduling, consent, owner-only subscription management, order settlement and idempotent credit grants. A verified provider adapter is the only payment trust boundary; expose no HTTP endpoint that can mark an order paid.
3. Add bounded renewal worker. No adapter means no charges or credit grants. Definite failures retry after one and three days (three attempts total); uncertain results reuse the same attempt identity. Stopping renewals preserves current paid period.
4. Reuse customer agreement pages and sales settings for paginated subscription management, next payment dates, explicit agreement enrollment and cancellation.
5. Verify date boundaries, duplicate events, concurrent grants, cancellation, failures, permissions and disabled-provider behavior, then run TypeScript and browser checks.

Payment terms are snapshots. Each paid order grants a new agreement; previous messages, agreements, charges and logs remain untouched. Agreement enrollment requires owner consent, a positive price, a currency and an explicit duration. Existing renewalRequested values are preferences only.
Rollback: deploy previous application version; additive columns and tables can remain. Do not drop financial history. Provider integration must supply verified results, provider-held payment tokens, idempotent charge/reconciliation and signature verification before production activation. No card numbers or CVC are stored.

Implemented: additive migrations applied locally; provider-free worker exits without database writes. Pending payments reconcile independently after renewal cancellation, with fair retry scheduling. Owner eligibility is rechecked under locks. Nine backend tests and seven browser scenarios verified across focused runs; backend/frontend TypeScript passed. Real provider, hosted/tokenized checkout and authenticated callback wiring remain the deferred integration boundary.
