# UI Contract: `AmountKeypad`

The single new interface this feature exposes. `AmountKeypad` is a controlled React
component in `frontend/src/components/ui/AmountKeypad.jsx`, exported from
`frontend/src/components/ui/index.js`. It renders the **hero amount read-out** plus the
**on-screen number pad** and reports edits to its parent. It owns entry *format* only;
the parent owns the canonical value and all business validation.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `value` | string | yes | — | Canonical decimal string (e.g. `"10.00"`, `""` for zero state). The hero renders this. |
| `onChange` | `(next: string) => void` | yes | — | Called with the normalized decimal string after each accepted edit. Never called for ignored keystrokes. |
| `prefix` | string | no | `"$"` | Currency symbol shown before the hero figure. |
| `token` | ReactNode | no | `null` | Compact token indicator rendered near the hero (e.g. `"USDC"` or a small chip). Purely presentational. |
| `disabled` | boolean | no | `false` | Disables all pad keys and hardware-key handling (e.g. while submitting). |
| `maxFractionDigits` | number | no | `2` | Cap on decimal places (cents). |
| `id` | string | no | auto | Base id/prefix for keys and the hero region (for label association + tests). |
| `ariaLabel` | string | no | `"Amount"` | Accessible name for the amount region / keypad group. |
| `autoFocus` | boolean | no | `false` | Whether the keypad group takes focus on mount. |

**Not owned by this component** (stay in the sheet): token *selection*, min/max bounds,
positivity/submit gating, balance/allowance checks, and the memo/description field.

## Behavior contract

- **Controlled**: renders `value` verbatim (formatted with `prefix`/`token`); all edits go
  through `onChange`. The component keeps no independent canonical amount state.
- **Digit key**: appends the digit unless it would exceed `maxFractionDigits` after the
  decimal point; otherwise no-op.
- **Decimal key**: appends `"."` only if none present; otherwise no-op. Leading decimal is
  allowed (yields `"0."`-style display; `onChange` may emit `"0."` or `"."` — the hero shows
  a well-formed `$0.`).
- **Backspace key**: removes the right-most character; removing the last character yields
  `""` (zero state, hero shows `$0`).
- **Zero state**: when `value` is `""`/`"0"`/`"0.00"`, the hero shows `$0` (or `$0.00`
  once decimals are entered) and is styled as de-emphasized; the component does **not**
  disable submit (the parent does).
- **Hardware keyboard**: while focused, `0-9`, `.`, and `Backspace` apply the same edits;
  the on-screen pad remains visible (FR-005/D6).
- **Large values**: the hero must remain legible (scale down / clamp) without breaking
  layout at the smallest supported viewport.

## Accessibility contract (WCAG 2.1 AA)

- Every pad key is a `<button type="button">` with an accessible name: digit text for
  `0-9`; `aria-label="Decimal point"` and `aria-label="Delete"` (or "Backspace") for the
  two function keys.
- The pad is wrapped in a group with an accessible name (`ariaLabel`).
- The current amount is exposed to assistive tech via an `aria-live="polite"` (or
  `role="status"`) read-out that announces `prefix + value + token`.
- Fully keyboard operable; focus is visible; respects `prefers-reduced-motion`.

## Events / side effects

- No network calls, no navigation, no global state. The only output is `onChange`.

## Example usage (illustrative — not implementation)

```jsx
// USDC-locked sheet (#1/#2/#4)
<AmountKeypad value={stake} onChange={setStake} prefix="$" token="USDC" disabled={busy} />

// Multi-token sheet (#3) — token <select> stays in the sheet; prefix is token-driven
<AmountKeypad value={stakeAmount} onChange={(v) => update('stakeAmount', v)}
              prefix={showDollar ? '$' : ''} token={selectedTokenSymbol} disabled={submitting} />
```

## Test contract (Vitest + @testing-library/react)

- Renders keys queryable by role/name: `getByRole('button', { name: '7' })`, decimal, delete.
- Typing `7`,`.`,`5`,`0` yields hero `"$7.50"` and final `onChange` value `"7.50"`.
- A second decimal press is a no-op; a 3rd fractional digit is a no-op.
- Backspace to empty shows `$0` and emits `""`.
- `prefix`/`token` render; `disabled` blocks key activation.
