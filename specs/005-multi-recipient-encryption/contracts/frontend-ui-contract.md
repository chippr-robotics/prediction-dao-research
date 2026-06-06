# Contract: Frontend UI (ThirdParty create + arbitrating discovery)

## Create flow — re-enable ThirdParty (`FriendMarketsModal.jsx`, `useFriendMarketCreation.js`)

- `PARTICIPANT_RESOLUTION_TYPES` MUST again include `ResolutionType.ThirdParty` (currently omitted at `FriendMarketsModal.jsx:33-37`).
- Selecting ThirdParty MUST reveal an **arbitrator address input**, validated:
  - a valid address; not the creator; not the opponent (mirrors contract `ArbitratorDisallowed` / `SelfWager` intent).
- For a **private** ThirdParty wager, before submit:
  - check `hasRegisteredKey(arbitrator)`; if missing → **block** with a clear, accessible error naming the arbitrator (FR-007).
  - add the arbitrator to the encryption recipients (encryption-bundle-contract.md).
- `useFriendMarketCreation` MUST pass the real arbitrator address to `createWager` for ThirdParty (replace the hardcoded `ethers.ZeroAddress` at `:241`); non-ThirdParty types continue to send `ZeroAddress`.
- **Honest disclosure** (FR-012/Constitution III & V): when an arbitrator is set on a private wager, the create UI and the wager detail view MUST state that the arbitrator can read the private terms.

## Discovery — "Arbitrating" view (`MyMarketsModal.jsx`)

- Add an **Arbitrating** tab/filter listing wagers where `wager.arbitrator?.toLowerCase() === account` (sourced from `getUserWagers(account)`, which includes arbitrated wagers after the index change).
- For each such wager, the arbitrator gets the resolve action (declareWinner) and, post-004, the draw action (declareDraw) — read-and-resolve, not accept/cancel.
- The terms render via the existing decrypt path (arbitrator is a recipient); a non-arbitrator never sees this view populated by others' wagers.

## Accessibility (WCAG 2.1 AA)

- Arbitrator input has a label + inline validation error announced to assistive tech.
- The "arbitrator can read" disclosure is text (not color/icon-only).
- The "missing key" block is a clear, focusable error, not a silent no-op.

## Coexistence

- Composes with 004 (the arbitrator's resolve options include declareWinner and arbitrator-solo declareDraw).
- The Polymarket-only oracle mode (feature 003) is unaffected — ThirdParty is a participant/arbitrator type, not an oracle type.
