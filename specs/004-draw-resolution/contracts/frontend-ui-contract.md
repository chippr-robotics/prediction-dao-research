# Contract: Frontend UI for Draw

Authoritative UI behavior for the draw feature. Component: `frontend/src/components/fairwins/MyMarketsModal.jsx` (ResolutionModal + status display); constants: `frontend/src/constants/wagerDefaults.js`.

## Status surface

- `WagerStatus.DRAW = 'draw'`; included in `TERMINAL_STATUSES` → drawn wagers appear under **History**.
- On-chain numeric `Status` `6` decodes to `'draw'` wherever status is mapped.
- `getStatusLabel('draw') → "Draw"`; `getStatusClass('draw') → 'status-draw'` (distinct from `status-refunded` / `status-resolved`).
- History/detail copy: **"Settled as a draw — both parties' stakes returned."** Must read distinctly from the timeout case **"Refunded (expired)"** and the winner case **"Resolved"**.

## Resolution modal — draw option

Eligibility to show the **"Draw — both parties refunded"** control:

```
showDraw =
     market.status == Active
  && now <= resolveDeadline                        // manual draw is gated on the deadline (FR-005); past it, Claim Refund takes over
  && !isOracleType(resolutionType)                 // Polymarket/Chainlink/UMA never show manual draw
  && (
       (resolutionType ∈ {Either,Creator,Opponent} && (isCreator || isOpponent))
       || (resolutionType == ThirdParty && isArbitrator)
     )
```

Like the existing winner-resolution UI (which suppresses resolve once `resolveDeadlineTime` passes, `MyMarketsModal.jsx:1139-1144`), the manual Draw control is hidden after the resolve deadline; the contract would otherwise revert `ResolveExpired`, and the timeout **Claim Refund** path returns both stakes instead.

Propose/confirm states (participant types), driven by `drawConsent(wagerId)` (or `DrawProposed`/`DrawRevoked` events):

| Counterparty consented? | Caller consented? | Control |
|:---:|:---:|---|
| no | no | **"Propose draw"** → `declareDraw` |
| no | yes | **"Waiting for counterparty…"** + **"Withdraw"** → `revokeDraw` |
| yes | no | **"Confirm draw"** (settles) → `declareDraw` |

`ThirdParty`: single **"Declare draw"** → `declareDraw` (settles immediately).

## Contract write

- Selecting/confirming Draw calls `registry.declareDraw(market.id)` (replaces the `declareWinner` call path for that option); withdraw calls `registry.revokeDraw(market.id)`.
- Error parsing must map the new reverts (`NotParticipant`, `DrawNotApplicable`/`NotAuthorized`, `NoDrawProposal`, `NotActive`, `ResolveExpired`) to friendly messages.
- Address + ABI come from sync artifacts only (`config/contracts.js`, regenerated `abis/WagerRegistry.js`). Never hand-copied.

## Accessibility (WCAG 2.1 AA)

- The Draw control is keyboard-reachable, has an accessible name ("Propose draw" / "Confirm draw" / "Declare draw"), and conveys state with **text**, not color alone.
- A confirmation step explains the effect ("Both parties get their original stake back; no winner.") before submitting.

## Coexistence with feature 003 (Polymarket-only oracle mode)

- Manual draw never applies to oracle wagers, so the `VITE_ORACLE_MODELS` Polymarket-only mode is unaffected. Polymarket wagers settle a draw only via `autoResolveFromPolymarket` on a tie — no manual control is rendered for them.
