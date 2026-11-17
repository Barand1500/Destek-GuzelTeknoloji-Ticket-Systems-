# Mail and history bounds implementation plan

**Goal:** Bound incoming email memory and paginate history in the database; inspect terminal outbox dependencies without deleting anything.
**Architecture:** Metadata-first IMAP size gate with durable skip diagnostics and checkpoint continuation. History uses a stable mixed message/log timeline in SQL, loading only current-page entities and relevant enrichment. Preserve permissions, original first-message labeling, author and metadata behavior.
**Constraints:** No queue cleanup, no deletion of tickets/messages/logs/files. No external email sending in tests. Keep current dirty workspace changes.

- [x] Mail: add pre-download total-message limit, skip diagnostics and tests proving no source fetch for oversized mail and continuation after skip. Check actual IMAP API locally.
- [x] History: replace unbounded read with stable DB pagination and counts; test mixed pages, equal timestamps, original author, metadata and access.
- [x] Outbox: inspect messages, system notices, OTPs, log rendering, delivery callbacks and deduplication. Document exactly which fields cannot be removed; do not mutate.
- [x] Run focused backend tests and TypeScript/build; inspect final diffs and report limits.
