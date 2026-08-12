# Dialog and bottom-sheet focus management

**Status: open finding, repo-wide. Not caused by, and not confined to, any one feature.**

Measured 2026-08-12 while completing spec 083. This is a survey and a proposal, not a change —
nothing here has been fixed. It is written down because the defect is invisible to every gate the
repo currently runs, so it will otherwise be rediscovered rather than remembered.

## The finding

Ten components render `role="dialog" aria-modal="true"` over the page and **do not contain keyboard
focus**. Tabbing from the last control inside the sheet moves focus to the page behind it — the
member is then typing into a form they cannot see, underneath a backdrop, with the sheet still
mounted and still claiming to be modal.

`aria-modal="true"` is an assertion to assistive technology that everything outside the dialog is
inert. In these ten components that assertion is false. That is the precise defect: not that the
sheets are hard to use, but that they **state something about themselves that is not true**.

## What is actually true today, component by component

Three behaviours matter for a modal surface: containing Tab, restoring focus to whatever opened it,
and closing on Escape. The repo does not do the same three things twice.

| Component | Traps Tab | Restores focus on close | Escape closes |
| --- | --- | --- | --- |
| `components/account/ActionSheet.jsx` | **yes** | no | yes |
| `components/compliance/EntryGate.jsx` | **yes** | — (gate, nothing to return to) | n/a by design |
| `components/wallet/ConnectModal.jsx` | **yes** | no | yes |
| `components/fairwins/RequestQRModal.jsx` | **yes** | no | yes |
| `components/fairwins/SetTimeModal.jsx` | **yes** | no | yes |
| `components/wallet/AssetDetailSheet.jsx` | no | yes | yes |
| `components/wallet/reporting/StatementSheet.jsx` | no | yes | yes |
| `components/earn/VaultSheet.jsx` | no | yes | yes |
| `components/earn/SupplySheet.jsx` | no | yes | yes |
| `components/earn/StakeSheet.jsx` | no | yes | yes |
| `components/collectibles/CollectibleDetailSheet.jsx` | no | yes | yes |
| `components/perps/PositionSheet.jsx` | no | yes | yes |
| `components/perps/OpenPositionSheet.jsx` | no | yes | yes |
| `components/miniapps/AppSheet.jsx` | no | no | yes |
| `components/predict/MarketDetailSheet.jsx` | no | no | **no** |

Read the table before repeating the shorthand version of this finding. "No sheet in the repo traps
focus" is **wrong**: `ActionSheet` — a bottom sheet, used by the account-security panels for
recovery, passkeys and controller changes — traps focus and has since spec 041/045, and says so in
its own header comment. The split is not sheets-versus-modals either. It is two independent
half-implementations of the same pattern:

- the **`ActionSheet` + modal** family contains focus but abandons it on close (focus falls to
  `<body>`, so the next Tab restarts from the top of the document);
- the **detail-sheet** family saves and restores focus correctly but never contains it.

`PositionSheet` and `OpenPositionSheet` were built to match the detail-sheet family, so spec 083
inherited the gap rather than introducing it. `MarketDetailSheet` is the weakest of the set — no
containment, no restore, and no Escape handler at all.

## Which success criteria this engages

- **WCAG 2.4.3 Focus Order (Level A)** — the primary failure. Focus order must preserve meaning and
  operability; moving focus behind an open modal preserves neither.
- **WCAG 4.1.2 Name, Role, Value (Level A)** — `aria-modal="true"` communicates a state to
  assistive technology that the implementation does not honour.
- **WCAG 2.4.11 Focus Not Obscured (Minimum) (Level AA, WCAG 2.2)** — the concrete consequence:
  focus lands on controls covered by the sheet and its backdrop, so a sighted keyboard member
  cannot see where they are.
- **ARIA APG, Dialog (Modal) pattern** — focus containment is normative for the pattern the
  `role="dialog" aria-modal="true"` markup claims to implement.

**WCAG 2.1.2 No Keyboard Trap is _not_ engaged** and should not be cited here — 2.1.2 forbids
trapping focus. The fix for this finding is a *deliberate, escapable* trap, which 2.1.2 explicitly
permits because Escape and the close button both release it.

## Why no existing gate catches it

`frontend/src/test/perps/PositionSheet.axe.test.jsx` and its `OpenPositionSheet` twin pass, and
would keep passing after a fix. **axe-core cannot detect a missing focus trap**: it evaluates a
static DOM, and containment is a property of a key sequence, not of markup. The same is true of the
other sheets' suites. A regression test for this has to press Tab.

## What a repo-wide fix would touch

The point of writing this down rather than fixing the two perps sheets is that **an inconsistency
is not an improvement**. Two of fifteen surfaces behaving differently from the other thirteen is a
worse repo than fifteen behaving alike, even when the two are the better two.

A single fix, in rough order of work:

1. **One shared hook** — `frontend/src/hooks/useDialogShell.js` (new), doing the four things
   exactly once: save the previously-focused element, move focus into the dialog, contain Tab and
   Shift+Tab, close on Escape, lock `body` overflow, and restore focus on unmount. The containment
   logic already exists and is proven in `ActionSheet.jsx` (lines ~36-52) and the save/restore
   logic already exists and is proven in `PositionSheet.jsx` (the sheet-shell effect, with its
   comment explaining why the effect must not depend on `onClose`). The hook is those two halves
   put together; neither needs inventing.
2. **Fifteen components adopt it**, deleting their local effect. Every one of them already owns a
   `dialogRef`/`sheetRef` and a `tabIndex={-1}` container, so the adoption is a deletion plus a
   call, not a re-layout. Three need a behaviour change beyond that: `AppSheet` and
   `MarketDetailSheet` gain focus restore, and `MarketDetailSheet` gains Escape.
3. **One shared test**, table-driven over the fifteen, asserting the key sequence: Tab from the last
   focusable wraps to the first, Shift+Tab from the first wraps to the last, Escape closes, and
   focus returns to the opener. Component suites stay as they are; this is a new file, not an edit
   to fourteen.
4. **`EntryGate` is a deliberate exception** and must be reviewed, not converted blindly — it is a
   compliance gate with nothing behind it to return focus to, and its Escape behaviour is
   intentionally absent.

Nothing in `frontend/src/lib/**`, no CSS, no contract, no gateway. The change is confined to the
component layer and one new hook, and it is behaviour-only — no visual diff, which is why it can be
reviewed on the test alone.

## Related

- [`frontend.md`](frontend.md) — component conventions.
- `specs/083-perps-position-management/tasks.md` — the record entry that points here.
