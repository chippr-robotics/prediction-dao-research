# The FeeRouter: One Source of Truth for Platform Fees

*How FairWins centralized every configurable fee into a single capped, disclosed, on-chain registry — without centralizing trust*

| | |
|---|---|
| **Series** | Finance Surfaces (part 1) |
| **Part** | 22 of 34 |
| **Audience** | Protocol and product engineers |
| **Tags** | `fees`, `fee-router`, `solidity`, `uups`, `product` |
| **Reading time** | ~8 minutes |

## Three fee systems walk into a codebase

By mid-2026, FairWins had shipped three integrations that touched revenue, and each had grown its own fee plumbing. The OpenSea referral (Collect) cost members nothing and paid FairWins out of OpenSea's economics. The Polymarket builder fee (Predict) was a real, disclosed taker cost, configured through gateway environment variables. And Earn — Morpho lending vaults behind an ERC-4626 interface — had no native revenue-share program at all, which meant FairWins earned nothing on it.

The plan was to charge a small platform fee on Earn deposits. The obvious implementation was also the wrong one: hardcode 50 bps in the deposit path, add another env var to the gateway, put a matching constant in the frontend so the confirm screen shows the right number. That's three copies of one number, owned by three deploy pipelines. The failure mode writes itself: an operator changes the gateway env var, forgets the frontend constant, and a member confirms a screen that says 0.50% while the backend charges 0.60%. For a platform whose entire fee doctrine is *the member always sees the real cost before signing*, a stale disclosure isn't a display bug — it's a broken promise.

There's a second failure mode that no amount of config discipline fixes: the race. A member reviews a deposit at 50 bps, an admin raises the rate to 75 bps, and the member's transaction lands after the change. Whatever the UI said, the chain charges the live rate. If the fee logic lives in scattered constants, there is nowhere to even express "charge me at most what I was shown."

Spec 060's answer was to make fees a first-class on-chain subsystem: one contract, the `FeeRouter` (`contracts/fees/FeeRouter.sol`, a UUPS proxy recorded under the `feeRouter` / `feeRouterImpl` deployment keys), that is the *only* place a fee rate lives — and to make the charge path enforce the disclosure.

## A registry keyed by keccak

Every configurable fee is a service entry keyed by `bytes32 serviceId = keccak256("<label>")` — `earn.lend`, `polymarket.taker`, `polymarket.maker`. The entry itself is small:

```solidity
enum ServiceKind {
    Unregistered,
    Wrapped,    // chargeable through the router (e.g. earn.lend)
    ConfigOnly  // read-only rate for off-chain enforcement (e.g. polymarket.taker)
}

struct Service {
    uint16 capBps; // hard ceiling for feeBps; 0 => unregistered
    uint16 feeBps; // live rate, 0..capBps
    ServiceKind kind;
}
```

The `kind` split is what lets one registry cover very different fee mechanics. **Wrapped** services are charged by the router itself, on-chain, atomically. **ConfigOnly** services store a rate that an off-chain enforcer reads — the Polymarket builder bps, which the relay gateway attaches to CLOB orders per spec 057. The router never touches ConfigOnly money; it just holds the number everyone agrees on.

Caps are fixed at registration and can never be edited afterward. `registerService` is one-shot per id, rejects a zero cap, and for wrapped services bounds the cap by an absolute constant:

```solidity
/// @notice Absolute ceiling for any Wrapped service's cap (2.5%).
uint16 public constant MAX_WRAPPED_FEE_BPS = 250;
```

`setFeeBps` — gated by `FEE_ADMIN_ROLE` — enforces `newBps <= capBps`, and the charge path re-checks the cap as defense in depth. The emergency lever is deliberately `setFeeBps(id, 0)`, not a cap change: an operator can always zero a misbehaving fee immediately, but nobody, including admins, can quietly raise the ceiling members were told about. Every change emits `FeeBpsChanged(serviceId, oldBps, newBps, actor)`, and that event stream *is* the audit history — the AdminPanel Fees tab renders it directly rather than keeping a parallel log.

## Atomic charging: fee-for-value or nothing

For wrapped services, the router is also the settlement path. Earn deposits don't call the vault; they call the router:

```solidity
function depositToVaultWithFee(
    bytes32 serviceId,
    address vault,
    uint256 assets,
    address receiver,
    uint16 maxFeeBps
) external nonReentrant returns (uint256 shares);
```

In one transaction the router pulls the member's principal, transfers `floor(assets · bps / 10 000)` to the treasury, approves the ERC-4626 vault for the remainder, and deposits it for the member. Any failing leg reverts the whole action, so the treasury can never keep a fee for a deposit that didn't happen. The router holds no balances outside a transaction — there is nothing to drain between calls. And if the vault returns zero shares for a nonzero net deposit, the router reverts `ZeroShares()` rather than letting a vault swallow principal: the fee is only ever payment for value actually delivered.

Two edge cases show the fail-safe posture. Fee math floors, in the member's favor — a fee that rounds to zero in the asset's smallest unit is charged as zero. And if a network's treasury was never configured (`treasury == address(0)`), the router *skips* the fee entirely and emits `FeeSkippedNoTreasury` instead of reverting or parking funds. An ops misconfiguration must never strand a member's deposit; it can only cost FairWins revenue.

## `maxFeeBps`: the disclosure becomes enforceable

The last parameter of `depositToVaultWithFee` is the interesting one. The frontend quotes the live rate before any signature (`frontend/src/lib/fees/feeQuote.js` reads `getService` straight from the router) and passes that *quoted* rate back as `maxFeeBps`. On-chain:

```solidity
uint16 liveBps = svc.feeBps;
if (liveBps > svc.capBps) revert CapExceeded(); // defense in depth
if (liveBps > maxFeeBps) revert FeeAboveQuoted();
```

This closes the race permanently. If an admin raises the rate while a member's transaction is in flight, the member either pays at most what the confirm screen showed or the transaction reverts and they re-review. The confirm screen is no longer a courtesy; it's a signed ceiling the contract enforces. The one rule integrators must honor is behavioral, not technical: never call the router with a `maxFeeBps` you did not actually display.

## The honest-disclosure doctrine, mechanized

FairWins' fee doctrine predates the router: fees are disclosed before signature, as a named line with the live percentage and absolute amount — never hidden, never folded into a spread, never labeled "free" when they aren't. The router turns that doctrine into code paths with exactly three outcomes, and `fetchFeeQuote` makes integrators handle all of them:

- **No router on this chain** (or service unregistered): `{ available: false, bps: 0 }` — proceed with no fee and no fee line, byte-identical to pre-060 behavior. Zero fee means the feature behaves as if the fee system never existed.
- **Live rate obtained**: disclose it and pass it as `maxFeeBps`.
- **Read failed on a network that has a router**: *block the action.* The one thing a surface may never do is proceed on a possibly understated rate. Earn's deposit flow pauses (withdrawals are unaffected) until the read succeeds — fail-safe, not fail-open.

The relay gateway follows the same discipline from the other side. `services/relay-gateway/src/fees/onchain.js` reads the Polymarket bps from the router via a cached `eth_call` (30-second TTL), clamps to the spec-057 caps before serving — a clamp firing is logged as a should-be-impossible warning, since the contract enforces the caps too — serves a stale value for at most 10× the TTL during an RPC outage, and then drops to env-configured fallback bps, honestly labeled `source: "env-fallback"` in the API response. Crucially, the gateway stays *stateless*: no admin API, no persistence, no second fee-config store. An admin edits on-chain; every reader follows.

## Design decisions

**One registry instead of per-feature fee logic.** The alternative — each integration owning its fee — is how the pre-060 sprawl happened. Now a new integration (Lido, Polygon liquid staking, Uniswap are the named candidates) *registers a service* rather than building a fee path: pick a label, `registerService(ethers.id('stake.lido'), capBps, Wrapped)`, wire the standard quote-and-disclose flow. The rate starts at 0; nothing is charged until an operator acts.

**Centralized config is not centralized trust.** Admins got one screen, but members got harder guarantees than before: an immutable per-service cap, an absolute 250 bps ceiling on wrapped services, a contract-enforced consent ceiling, and a public `FeeBpsChanged` history. The admin's power is bounded by constants members can read on-chain.

**Entry-only fees.** Wrapped fees apply to principal at entry; withdrawals are never charged. This keeps the mental model simple ("you saw the cost when you put money in") and keeps the exit path free of any fee-read dependency.

**Floor rounding, member's favor.** A deliberate bias: on tiny principals the fee rounds to zero and is charged as zero — the router still emits a `FeeCharged` event with `feeAmount = 0` so reconciliation counts exactly one router event per deposit. The monthly reconciliation invariant is exact: every `FeeCharged.feeAmount` equals one same-transaction ERC-20 transfer to the treasury (`docs/runbooks/fee-operations.md` treats any divergence as a security incident).

**Known limits.** Fee-on-transfer and rebasing tokens are unsupported — the router assumes the pulled amount equals the requested amount, true for the curated vault assets like USDC. One-shot registration means a mistaken cap can't be fixed, only abandoned for a new service id; that rigidity is the price of caps members can rely on. And the router is a UUPS proxy (`UUPSManaged`, append-only storage with a trailing `__gap`, CI-gated `check:storage-layout`), so new wrapped entrypoints for differently shaped actions — staking, swaps — can ship as in-place upgrades, provided they keep the same accounting, events, cap re-check, and `maxFeeBps` ceiling.

The result is a fee system whose most important property is the one members never see: there is no code path on which the number they were shown and the number they are charged can diverge.

## Sources

- `specs/060-platform-fee-wrapper/spec.md` — feature spec, user stories, acceptance scenarios
- `contracts/fees/FeeRouter.sol` — router implementation (registry, caps, atomic charging)
- `contracts/fees/IFeeRouter.sol` — interface, `Service` struct, events, errors
- `docs/developer-guide/platform-fees.md` — architecture, disclosure rules, service registration
- `docs/runbooks/fee-operations.md` — rate changes, emergency-zero, treasury reconciliation
- `services/relay-gateway/src/fees/onchain.js` — stateless cached on-chain rate reader
- `frontend/src/lib/fees/feeQuote.js` — quote path and the three integrator outcomes
- [ERC-4626: Tokenized Vaults](https://eips.ethereum.org/EIPS/eip-4626) — the vault interface behind `depositToVaultWithFee`
- [ERC-1822 / UUPS](https://eips.ethereum.org/EIPS/eip-1822) and [OpenZeppelin upgradeable contracts](https://docs.openzeppelin.com/contracts/5.x/api/proxy) — the proxy pattern the router builds on
