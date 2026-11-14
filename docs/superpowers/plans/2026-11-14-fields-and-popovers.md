# Agreement fields and popover corrections

User-approved corrections: standard outlined labels and consistent 46px form controls, aligned start/end rows; agreement modal actions in divided bottom-right footer with external form submit. Type add + moves right. Relation dropdown is 38px like adjacent search, and menu measures space in dialog scroll body, opening upward or shrinking to available space to avoid footer clipping. Remove input hover/focus shadows and inner outlines globally; retain border-only text-field focus and keyboard focus for buttons/checkboxes.

- [x] Browser failures reproduce form misalignment/footer placement, popup clipping/height and input focus rings.
- [x] Implement field/footer alignment, adaptive dropdown, right-hand + and shared plain input focus styling.
- [x] Check agreement/relations/type flows, integration fields, backend integrity tests and builds. Document remaining functional limitations without claiming a full audit.

Validation: 14 browser scenarios and 6 backend tests passed; targeted rechecks passed after final changes, including aligned child balance values. Frontend production build passed. No live deployment.
