# UI Contracts: UX Consistency Harmonization (038)

The feature exposes no network or on-chain interfaces. Its "contracts" are the
props/behavior contracts of the shared frontend components and the storage
schema other code may rely on.

## 1. `DeadlineTimeline` (reworked) — `components/fairwins/DeadlineTimeline.jsx`

Single canonical time control for all flows.

```jsx
<DeadlineTimeline
  milestones={[            // 2 or 3 entries, ordered left→right
    { key: 'accept', label: 'Joining open until', tileHead: 'Join by',
      value, min, max, editable: true, hint: '...' },
    { key: 'resolve', label: 'Must be resolved by', tileHead: 'Resolve by',
      value, min, max, editable: true, hint: '...' },
  ]}
  onChange={(key, epochMs) => ...}  // fired on drag, keyboard step, or modal Set
  disabled={bool}
  idPrefix="oc"                     // stable element ids for tests/labels
  summary="Open 1 day 23h for a taker · then up to 7 days 0h to settle"
/>
```

**Behavioral contract**
- Each editable milestone dot: `role="slider"`, `aria-valuemin/max/now`,
  `aria-valuetext` (human-readable date), draggable via Pointer Events
  (`touch-action: none` on track), arrow keys step by 15 min (Shift = 1 h).
- Tapping a milestone tile or its displayed time opens `SetTimeModal` for that
  milestone. No other date entry point exists (no bare `datetime-local`, no
  "tap to type a date" link).
- All value changes clamp to `[min, max]` and preserve milestone ordering with
  a minimum separation; out-of-range modal input is rejected with the allowed
  range shown.
- Legacy two-slider API (`acceptBy/resolveBy/onAcceptChange/...`) is removed;
  both call sites migrate in the same change.
- Colors come only from `--timeline-*` tokens; component renders identically
  (except milestone count/labels/bounds) in every flow.

## 2. `SetTimeModal` (new) — `components/fairwins/SetTimeModal.jsx`

```jsx
<SetTimeModal
  open={bool}
  title="Set date and time"
  label="Must be resolved by"
  value={epochMs}
  min={epochMs}
  max={epochMs}
  onCancel={() => ...}
  onSet={(epochMs) => ...}   // only fires with an in-range value
/>
```

- Focus-trapped dialog (`role="dialog"`, `aria-modal`, labelled by title);
  Escape/Cancel closes without change.
- Contains one labelled `datetime-local` input bounded to `[min, max]`;
  invalid/out-of-range input disables **Set** and shows the allowed range in
  plain language (FR-004).

## 3. `PillSelect` (new) — `components/ui/PillSelect.jsx`

```jsx
<PillSelect
  label="Who Can Resolve?"
  options={[
    { value: 1, label: 'Me', icon: '👤' },
    { value: 3, label: 'Friend', icon: '⚖️' },
    { value: 7, label: 'Oracle', icon: '🔮', disabled: true,
      disabledReason: 'Requires Gold membership' },
  ]}
  value={1}
  onChange={(value) => ...}
/>
```

- `role="radiogroup"` with `role="radio"` buttons, roving tabindex,
  arrow-key movement; disabled options are focusable-skipped but visible,
  with `aria-disabled` and an accessible `disabledReason` (FR-010).
- Visual states `.active` / `.locked` match the shipped
  `.fm-resolution-tab` styling (CSS relocated to `PillSelect.css`).
- **Consumers after migration** (option values unchanged):
  - FriendMarketsModal participant flow "Who Can Resolve?" — `ResolutionType`
    values from `constants/wagerDefaults.js` (replaces `#fm-resolution-type`
    select).
  - OpenChallengeModal "How is it resolved?" — `OPEN_RESOLUTION_TYPES.Either`
    (0) / `.ThirdParty` (3) (replaces `#oc-resolution` select).
  - FriendMarketsModal oracle/offer tab strip and GroupPoolModal
    "Who must approve the payout?" (Majority 51 / Two-thirds 67 /
    Everyone 100) — migrate from the className convention.

## 4. Stake row — layout contract

- One `.fm-stake-row` per flow: amount input (with `$` prefix where the value
  is USD-denominated) and the token control on the same line.
- The token control is always interactive:
  - FriendMarketsModal: existing token `<select>` inline
    (STABLE/WNATIVE/NATIVE/CUSTOM from `DexContext`); CUSTOM expands the
    address input below the row.
  - OpenChallenge/GroupPool: control opens showing the single supported
    stablecoin with a note that only it is supported on this network.

## 5. `NotificationBell` — CSS contract

- `.notification-bell` explicitly sets `padding: 0; border: none;
  min-width: 36px; min-height: 36px; flex-shrink: 0;` — it must not inherit
  sizing/spacing from the global `button` rule (`index.css`) or any
  `@media` rule.
- Unread badge caps its displayed count (`99+`) and never displaces the icon.

## 6. Quick access preference storage — `utils/quickAccessPreference.js`

```js
getHiddenCards(): string[]          // [] on missing/corrupt storage
isCardVisible(id): boolean          // !hidden.includes(id)
setCardVisible(id, visible): void   // persists full hidden set
subscribe(listener): unsubscribe    // notifies Dashboard on change
```

- localStorage key **`fairwins_quickaccess_v1`**; value: JSON array of hidden
  card ids (see data-model.md for the id domain and semantics).
- Consumers: `PreferencesPanel` (writes), `Dashboard` (reads + subscribes).
  Any future card must use a stable id and defaults to visible.
