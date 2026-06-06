# Phase 0 Research: Draw Resolution

All findings are grounded in the current code (file:line refs) and the resolved product decisions in `spec.md` (mutual consent; arbitrator solo; Polymarket tie auto-draws; stuck oracle relies on the existing timeout refund).

---

## D1 — How to add a Draw outcome to an immutable, live contract

**Decision**: Ship a versioned **WagerRegistry v3** redeploy. Append `Draw` to the `Status` enum (new value 6), add draw functions/events, leave the existing v2 registry as read-only legacy, and re-point the frontend to v3.

**Rationale**: `WagerRegistry` is a plain `AccessControl/ReentrancyGuard/Pausable` contract with **no proxy/initializer** (`contracts/wagers/WagerRegistry.sol:25`) — it cannot be edited in place. Immutability is a deliberate security property for a fund-custody contract. There is precedent (v1→v2) and the mainnet instance is currently **paused for testing** (`polygon-chain137-v2.json` ops notes in memory), so migrating live state is minimal-to-none right now.

**Alternatives considered**:
- *Make it upgradeable (UUPS/Transparent proxy)* — rejected: adds an admin upgrade path to a live fund-custody contract (larger trust/attack surface) for a one-time additive change.
- *Separate "DrawManager" satellite contract* holding draw logic against the existing registry — rejected: the registry owns the escrow and `Status`; an external contract cannot mutate `_wagers[id].status` or move escrowed funds without the registry exposing privileged hooks, which is more surface than a clean v3.

**Enum-ordering note**: `Status` must be **append-only** (`None,Open,Active,Resolved,Cancelled,Refunded,Draw`) so existing wire values stay stable (`IWagerRegistry.sol:8`); the frontend mirror and subgraph status array must add `draw` at index 6 to match.

---

## D2 — Detecting a Polymarket tie without redeploying the adapter

**Decision**: Detect a resolved tie in the **registry** using only the existing `IOracleAdapter` surface — **no adapter change**:
- `isConditionResolved(conditionId) == false` → genuinely unresolved → revert `ConditionNotResolved` (unchanged).
- `isConditionResolved == true` **and** `getOutcome().resolvedAt == 0` → **resolved tie** → settle a **draw**.
- `isConditionResolved == true` **and** `getOutcome().resolvedAt != 0` → decisive → settle the winner (unchanged).

**Rationale**: `getOutcome` already returns the `resolvedAt == 0` sentinel for *both* "unresolved" and "resolved tie" (`PolymarketOracleAdapter.sol:493-494, 512-514`), while `isConditionResolved` returns `true` for any resolved market including a tie (`PolymarketOracleAdapter.sol:343-355`). Their combination uniquely identifies a tie. This keeps the (already security-reviewed, owner-correct) adapter at its current mainnet address (`0x8368…`) — zero adapter redeploy, zero new oracle trust assumption. "Invalid"/both-zero markets (`payouts[0]==payouts[1]`, incl. `[0,0]`) also map to a tie → draw, matching the spec.

**Alternatives considered**:
- *Add a tie-aware method to the adapter (e.g. `getResolution` → {Unresolved,Decided,Tie})* and redeploy it — rejected as unnecessary: the existing interface already disambiguates; redeploying re-opens an audited adapter for no functional gain. (Kept as a documented future option if Chainlink/UMA ties are ever brought in scope.)
- *Cross-check via `getCachedResolution` numerators* (`PolymarketOracleAdapter.sol:361-376`) — available as a belt-and-suspenders read but not required; avoids coupling the registry to an adapter-specific method.

**Scope boundary**: Spec FR-009/010 scope auto-draw-on-tie to **Polymarket only**. `autoResolveFromOracle` (Chainlink/UMA) stays unchanged this feature; a generic-oracle "no decisive outcome → draw" is recorded as future work, not implemented (YAGNI).

---

## D3 — Mutual-consent mechanism (participant-resolved draws)

**Decision**: One entry function `declareDraw(uint256 wagerId)` with branch-by-resolution-type, plus `revokeDraw(uint256 wagerId)`:
- `Either`/`Creator`/`Opponent`: caller must be `creator` or `opponent`; the call records that caller's consent. When **both** have consented, `_settleDraw` runs. (First call = propose; second = confirm.)
- `ThirdParty`: caller must be `arbitrator`; settles immediately (solo).
- Oracle types: revert `NotAuthorized` (draw comes only from the oracle tie, D2).

Consent is stored in a **side mapping** `mapping(uint256 => uint8) private _drawConsent` (bit0 = creator, bit1 = opponent), **not** in the `Wager` struct.

**Rationale**: Returning both stakes affects both parties, so for participant types it requires both (prevents a losing party unilaterally escaping a loss — the abuse vector the spec's clarification settled). Note the consent gate is **independent of who may declare a winner**: even on `Creator`/`Opponent` types (where one party declares the winner), a *draw* still needs both — because a draw, unlike a winner declaration, refunds the counterparty's stake too. A side mapping keeps the public `Wager` struct (and therefore `getWager`/subgraph ABI) **unchanged**, minimizing frontend/subgraph churn; `_drawConsent` is cleared on settle/revoke.

**Alternatives considered**:
- *Separate `proposeDraw` + `confirmDraw` functions* — rejected: two functions for one toggle; `declareDraw` (idempotent per caller) + `revokeDraw` is simpler and mirrors `declareWinner` naming.
- *Store consent flags on the `Wager` struct* — rejected: changes the `getWager` return ABI (frontend/subgraph break) for state that is transient and only relevant while a draw is pending.
- *Allow either party to draw unilaterally (mirror `declareWinner` authority)* — rejected by the spec decision (abuse/grief vector).

**Finality / locking (FR-008b)**: a pending one-sided consent must NOT block the wager — `declareWinner`, `autoResolveFromPolymarket`, and `claimRefund` remain callable while a draw is only half-agreed; settling a winner or refund simply leaves `_drawConsent` as harmless dangling state (the wager is no longer `Active`). `revokeDraw` lets a participant withdraw consent explicitly.

---

## D4 — Push vs. pull payout on a draw

**Decision**: **Push** — `_settleDraw` transfers `creatorStake` to creator and `opponentStake` to opponent in the settling transaction (no separate claim step).

**Rationale**: Matches the existing both-stakes path `claimRefund` (`WagerRegistry.sol:402-410`), satisfies "settled in a single resolution action" (SC-002), and is safe: CEI ordering + `nonReentrant` + allowlisted tokens (no transfer hooks). Winner payout uses pull (`claimPayout`) because the winner is a single self-selecting actor; a draw has two fixed recipients known at settle time, exactly like a refund.

**Alternatives considered**: *Pull (each party claims)* — rejected: adds a state and two extra transactions for no safety benefit given allowlisted tokens and CEI; inconsistent with `claimRefund`.

---

## D5 — Pause / frozen / deadline interaction

**Decision**: Draw settlement is **not** `whenNotPaused` (consistent with `declareWinner`/`claimRefund`/`autoResolveFromPolymarket`, which stay open while paused — confirmed by the mainnet ops note "resolve/claim/refund stay open"). `declareDraw`/`revokeDraw` carry `nonReentrant` + `notFrozen(msg.sender)` (mirroring `declareWinner:304`). A manual draw requires `status == Active` and `block.timestamp <= resolveDeadline`; after the deadline, the existing `claimRefund` timeout path already returns both stakes, so a draw adds nothing there. The Polymarket auto-draw (like `autoResolveFromPolymarket` today) is callable by anyone and not frozen-gated, since funds go to the participants regardless of caller.

**Rationale**: Keeps settlement/exit paths available during an emergency pause (a draw releases funds back to users — strictly safe to allow). Frozen actors still cannot *drive* settlement.

---

## D6 — Subgraph indexing of Draw

**Decision**: Add `draw` to the subgraph `WagerStatus` enum and a `handleWagerDrawn` mapping **iff** the subgraph actually indexes `WagerRegistry` events. The current mapping (`subgraph/src/mappings/factory.ts`) handles `Market*` events (e.g. `MarketResolved`), which suggests it indexes a `ConditionalMarketFactory`, **not** the `Wager*`-event `WagerRegistry`. 

**Action / open item**: First **verify** whether the deployed subgraph tracks `WagerRegistry` (Wager* events). If yes → add the enum value + `WagerDrawn` handler + datasource address (v3) + status-array entry. If no (frontend reads chain directly via the per-user index) → the subgraph work is **out of scope** for this feature and the draw is surfaced from on-chain reads only. This verification is the first task in the subgraph slice; it gates whether any subgraph change ships.

**Rationale**: Don't add a handler for an event the indexed contract doesn't emit. Frontend already supports direct on-chain reads via `getUserWagers`/`getUserWagerIds` (`WagerRegistry.sol:450-485`), so draw visibility does not strictly depend on the subgraph.

---

## D7 — Deployment & migration strategy

**Decision**: Land contract + tests + frontend + (optional) subgraph behind the v3 redeploy. Deploy **Amoy first** (`deployments/amoy-chain80002-v3.json`), validate end-to-end, then a **separately-gated, explicitly-confirmed** mainnet v3 deploy (`polygon-chain137-v3.json`) while the registry is paused. Re-run `npm run sync:frontend-contracts` to write the v3 address; regenerate `frontend/src/abis/WagerRegistry.js` from the new artifact. The Polymarket adapter is reused as-is (no redeploy, no `setPolymarketAdapter` change).

**Rationale**: Mirrors the v2 deterministic-deploy flow (`scripts/deploy/deploy.js`), respects the constitution's deployment-artifact-as-source-of-truth rule and the floppy-keystore key flow, and keeps the mainnet money action behind an explicit human confirmation (consistent with the project's financial-action safety practice). New bytecode → new CREATE2 address regardless, so a bumped salt suffix (`WagerRegistry-draw`) is cosmetic/idempotency hygiene.

**Open items for the user at deploy time** (not blocking the plan): (a) confirm timing of the mainnet v3 cutover; (b) decide whether any existing v2 wagers (if unpaused testing created some) need user-facing migration messaging. Given the paused/testing state, the expectation is a clean cutover.

---

## D8 — Frontend resolution UX for the propose/confirm flow

**Decision**: In `MyMarketsModal.jsx` `ResolutionModal`, add a third "Draw — both parties refunded" option, gated by eligibility:
- shown only when `status == Active`, the connected wallet is an authorized resolver for a draw (creator/opponent for participant types; arbitrator for `ThirdParty`), and the resolution type is **not** an oracle type.
- For participant types, reflect the two-step state: if the other party has already consented, label the action "Confirm draw"; if not, "Propose draw," and after proposing show a pending "Waiting for counterparty to confirm" state with a "Withdraw" (revoke) affordance.
- `Either`/`ThirdParty` already allow a manual resolve UI; Polymarket/oracle wagers continue to **auto-resolve** (no manual winner buttons today, `canResolve` returns false for them) and likewise show **no manual draw** — their draw arrives via `autoResolveFromPolymarket`.

**Rationale**: Honest-state (Constitution III): a one-sided proposal is shown as pending, not as a settled draw. Reuses the existing `canResolve` authorization shape (`MyMarketsModal.jsx:410-431`) and outcome-button rendering (`:1650-1671`), swapping the contract call to `declareDraw` (`:1698-1730`). Coexists with the feature-003 Polymarket-only oracle mode (manual draw never applies to oracle wagers anyway).

**Alternatives considered**: *A separate "Propose Draw" modal* — rejected: the resolution modal is the natural, discoverable home; a third option with clear copy keeps one flow.
