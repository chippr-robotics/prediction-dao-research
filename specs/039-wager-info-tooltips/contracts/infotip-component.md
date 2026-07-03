# UI Contract: `InfoTip` component

**Feature**: 039-wager-info-tooltips | **File**: `frontend/src/components/ui/InfoTip.jsx`

The only new external interface this feature exposes. Host views (wager
modals, `DeadlineTimeline`, panels) depend on this contract; tests enforce it.

## Props

```jsx
<InfoTip
  label="About: Stake — each side"   // string, required — accessible name of the trigger
  className=""                        // string, optional — extra wrapper classes
>
  Enter the amount in USD. Only USDC is supported for open challenges on this network.
</InfoTip>
```

| Prop | Type | Required | Contract |
|---|---|---|---|
| `label` | string | yes | Trigger's `aria-label`. Must identify what is being explained (used by tests and screen readers to find the icon). |
| `children` | ReactNode | yes | Bubble content. Re-evaluated on every render → the bubble shows current-state text when opened (FR-009). Plain text or simple inline markup; no interactive content other than links. |
| `className` | string | no | Appended to the wrapper `<span>`; hosts use it for spacing only, never to restyle the bubble. |

One internal exception: `bubbleRole` (default `'note'`) exists solely so the
`ScreeningInfoButton` wrapper can keep its spec-021 dialog semantics for rich
content; wager views MUST NOT pass it.

No other props. Hosts MUST NOT control open state, placement, or styling of
the bubble (single shared design, FR-006).

## Rendered structure & ARIA

```html
<span class="infotip-wrap {className}">
  <button type="button" class="infotip-btn"
          aria-label="{label}" aria-expanded="false|true"
          aria-controls="{generated-id}">
    <svg aria-hidden="true"><!-- ⓘ glyph, ≥24×24 CSS px hit area --></svg>
  </button>
  <span id="{generated-id}" class="infotip-bubble-region" aria-live="polite">
    <!-- when open: -->
    <span class="infotip-bubble" role="note">{children}</span>
  </span>
</span>
```

## Behavior contract

| # | Given | When | Then |
|---|---|---|---|
| B1 | closed | click/tap trigger, or Enter/Space while focused | bubble opens; `aria-expanded="true"`; content announced via live region; `fairwins:infotip-open` CustomEvent dispatched on `document` with instance id |
| B2 | open | click/tap trigger again | closes |
| B3 | open | `mousedown` outside wrapper | closes; focus not stolen |
| B4 | open | Escape key | closes; focus returns to trigger |
| B5 | open | another `InfoTip` dispatches `fairwins:infotip-open` with a different id | closes (at most one bubble document-wide, FR-004) |
| B6 | open | component unmounts (modal closed / view re-rendered away) | bubble disappears with it; listeners removed (no leaks) |
| B7 | opening near a viewport edge (≥320 px screens) | bubble would overflow | clamp effect offsets horizontally and/or flips above so the bubble is fully visible (FR-008) |
| B8 | any | render | trigger is in the natural tab order at its DOM position; icon-only, no visible text added to the form |

## Accessibility acceptance (axe-gated)

- Trigger: name (from `label`), role `button`, `aria-expanded` state — no
  axe `button-name` or `aria-*` violations open or closed.
- Bubble text: meets WCAG AA contrast in light and dark themes (theme tokens).
- Zero new violations in existing view axe suites after the sweep (SC-004).

## Non-goals

- No hover-open requirement (hover MAY style the icon only).
- No focus trap, no portal, no persistence, no controlled mode, no placement
  prop.
