# Responsive Controls and System Guide Implementation Plan

**Goal:** Make mobile controls and populated lists readable, and simplify the System Guide with complete screen coverage.

**Architecture:** Keep application behavior and desktop controls unchanged. Scope shared layout corrections to mobile breakpoints. Keep compact table rows and allow horizontal scrolling within each list. Reuse guide screenshots and annotations; align the image and callouts in shared grid rows. Keep guide copy concise and add missing tools to its directory.

**Tech Stack:** React, TypeScript, CSS, Playwright.

## Constraints

- Preserve desktop UI except the explicitly requested System Guide content and layout.
- Retain transparent fields, existing theme colors, permissions and all actions.
- Keep sorting, filtering, pagination and row navigation usable on phones.
- Do not alter backend services or payment behavior.

## Tasks

- [x] Reproduce populated mobile list and toolbar issues at 360, 390 and 768 pixels; record desktop control dimensions.
- [x] Add focused Playwright checks for compact rows, horizontal scrolling, aligned controls, usable menus and no page overflow.
- [x] Correct shared mobile CSS while retaining table structure, sorting and row actions. Use horizontal scrolling for inbox, customers, staff, categories, projects, templates, currencies and activity logs.
- [x] Shorten guide flows and screen descriptions; document missing credit, payment, file, calendar and account tools from actual routes.
- [x] Align guide screenshots and callouts in shared grid rows so customer and phone sections do not leave a vertical gap before the lower callouts. Retain screenshot tabs and full-screen preview. Refresh the nine existing screenshots.
- [x] Place dashboard status labels beside the donut when its container has sufficient width; retain stacking on narrower phones.
- [x] Verify both themes, desktop layout, key interactions and TypeScript; inspect representative screenshots.

## Validation

- All thirteen focused Playwright tests passed after replacing mobile cards with compact scrolling tables. Checks cover scrolling, filtering, sorting, row actions, guide layout, dashboard legend placement and both themes.
- Phone widths: 320, 360 and 390 pixels; tablet: 768 pixels; desktop: 1440 pixels. Guide image and callout alignment also passed at 1920 pixels.
- TypeScript build and `git diff --check` passed.
- Read-only code review found two issues (tablet template sorting and conversation guide wording); both were corrected.

## Review Focus

- Long customer names, email addresses and department lists must remain readable.
- Dropdown menus must remain visible beyond their control and retain usable touch targets.
- Customer bulk selection and staff status toggles must not trigger row navigation.
- Guide screenshot numbering must match its explanations after copy edits.
- Mobile rules must not change desktop table structure or control sizes.
