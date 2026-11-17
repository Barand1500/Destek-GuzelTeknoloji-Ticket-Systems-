# Checkout and Alert Channels Implementation Plan
> Use superpowers:executing-plans and independent UI/worker tasks.
**Goal:** Reviewable checkout screen and selectable durable reminderchannels.
**Spec:** docs/superpowers/specs/2026-11-17-checkout-alert-channels-design.md
**Architecture:** Additivesettingsmigration, channel-awareworker/outbox, ownedpendingordercheckout, BINadapter; no moneyflow.
## Tasks
- [ ] Settingsvalidation/schema/API channels +WhatsApptemplatefields, migration; tests preservelegacy.
- [ ] Worker externalqueue atomic receipts and eligibility, approvedtemplate support; tests no externalcalls.
- [ ] Admincheckboxcombo UI andtemplatefields; test settings roundtrip.
- [ ] Checkout UI formatting validation/scheme/BIN pendingorder entry; tests sensitivecarddata staysclient.
- [ ] Compile, focusedtests/browser/screenshots and freshreview.
## Constraints
No charge/creditgrant, no credentials printed, no real externalmessage testing, no PAN/CVC serverrequest orstorage. Root-onlycheckout; ownershipenforced server. Missing selectedchannel silentlyskipped inrouting but UIhelperexplains.
