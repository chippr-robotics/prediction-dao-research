# Three Kinds of Truth, One Interface: The Oracle Adapter Layer

*How a single `IOracleAdapter` contract interface absorbs push feeds, request/callback oracles, optimistic dispute, and Polymarket's resolved markets — without the escrow contract knowing the difference*

| | |
|---|---|
| **Series** | Prediction Markets (part 2) |
| **Part** | 15 of 34 |
| **Audience** | Oracle integrators, smart-contract engineers |
| **Tags** | `oracles`, `chainlink`, `uma`, `polymarket`, `adapter-pattern` |
| **Reading time** | ~9 minutes |

---

> **Important Note**: This article describes prediction markets based on publicly available information and legitimate forecasting. Oracle-settled wagers are not a mechanism for trading on material non-public information or circumventing securities regulations. All participants remain fully subject to applicable laws and compliance requirements.

---

## Three wagers, three truths

Consider three wagers a member might create on FairWins:

1. *"ETH closes above $4,000 on September 30."* The truth is a number that a Chainlink price feed already publishes on-chain, continuously, whether anyone asks or not.
2. *"The city's open-data API reports more than 40mm of rainfall for October."* The truth lives behind an HTTPS endpoint. Nothing on-chain knows it until someone goes and fetches it.
3. *"The Meridian–Vantage merger closes before Q3."* The truth is a human judgment about a messy real-world event. No feed publishes it; no API is authoritative. Someone has to assert it, and someone else has to be able to dispute them.

Each of these needs a fundamentally different oracle. The first is a **push feed**: data arrives on-chain on the oracle's schedule and you read the latest value. The second is **request/callback**: you send a request, a decentralized network executes it off-chain, and the answer comes back in an asynchronous callback. The third is **optimistic dispute**: anyone may assert the answer with a bond; the assertion stands unless challenged within a liveness window, and challenges escalate to a voting-based resolution.

FairWins' escrow contract — the `WagerRegistry` covered in part 1 — should not care about any of this. It holds two stakes and needs exactly one bit: did YES win? The engineering problem is designing the seam so that four very different resolution machines (the three above, plus reading Polymarket's already-resolved markets) all collapse to that one bit, with the same failure semantics, behind the same interface.

## The interface: one bit, one sentinel

The seam is `contracts/oracles/IOracleAdapter.sol`. Every adapter — Polymarket, Chainlink Data Feeds, Chainlink Functions, UMA Optimistic Oracle V3 — implements it. The heart of the interface is two functions:

```solidity
function isConditionResolved(bytes32 conditionId)
    external view returns (bool resolved);

function getOutcome(bytes32 conditionId) external view returns (
    bool outcome,      // true if the "YES" or "PASS" side won
    uint256 confidence, // basis points, 10000 = 100%
    uint256 resolvedAt  // timestamp; 0 = not resolved
);
```

Three conventions do the real work:

**`bytes32 conditionId` is the universal key.** Each adapter defines what a condition id *means* — a Polymarket CTF condition hash, an admin-registered feed-threshold config, a Functions request template, an UMA claim — but to the registry it is an opaque 32-byte handle stored on the wager.

**The outcome is a `bool`, deliberately.** FairWins wagers are binary: creator takes one side, opponent takes the other. Collapsing every oracle's richer output (payout numerator arrays, `int256` feed answers, DON byte responses, assertion verdicts) down to a single bool at the adapter boundary means the registry's settlement code has exactly one shape.

**`resolvedAt == 0` is the unresolved sentinel.** `getOutcome` is a view; it never reverts on "not yet." A zero timestamp tells the caller there is nothing to act on. This one convention carries surprising weight, as we'll see with Polymarket ties.

The interface also carries operational surface: `oracleType()` (a human-readable tag like `"Polymarket"` or `"UMA-OOv3"`), `isAvailable()` (is the underlying oracle actually deployed and responsive on this network?), `isConditionSupported`, and `getConditionMetadata`.

## The consumer: how `WagerRegistry` stays oracle-agnostic

The registry (`contracts/wagers/WagerRegistryCore.sol`) holds a dedicated `IOracleAdapter public polymarketAdapter` slot — kept for ABI compatibility with the original Polymarket-only design — plus a generic registry for everything after it:

```solidity
mapping(ResolutionType => IOracleAdapter) public oracleAdapters;
```

`ResolutionType` (in `contracts/interfaces/IWagerRegistryTypes.sol`) enumerates `Polymarket`, `ChainlinkDataFeed`, `ChainlinkFunctions`, and `UMA` alongside the human-arbitrated types. Admins wire adapters with `setPolymarketAdapter` / `setOracleAdapter`; an unset adapter simply disables that resolution type on that network.

The adapter is consulted at exactly two moments in a wager's life:

**At creation**, `_checkOracleLinkage` enforces that an oracle-typed wager carries a non-zero condition id, that the adapter for its type is configured, and — the stale-condition mitigation — that the condition is *not already resolved*. You cannot open a wager on an outcome the oracle has already decided.

**At settlement**, anyone may call `autoResolveFromPolymarket(wagerId)` or the generic `autoResolveFromOracle(wagerId)` (both live in the `WagerRegistryIntents` facet; part 1 covered why the registry is two facets behind one proxy). The path is permissionless by design — settlement is a pure function of public oracle state, so there is no reason to gate who triggers it. The generic path is four lines of essence: look up the adapter for `w.resolutionType`, call `getOutcome`, revert `ConditionNotResolved` if `resolvedAt == 0`, otherwise settle the win.

That's the whole coupling. The registry never imports a Chainlink or UMA interface.

## Adapter one: Polymarket, reading someone else's settled truth

`contracts/oracles/PolymarketOracleAdapter.sol` doesn't run an oracle at all — it reads the output of one. Polymarket markets settle on the Gnosis Conditional Token Framework (CTF), where a condition id is `keccak256(oracle, questionId, outcomeSlotCount)` and resolution is a pair of payout numerators: `[1,0]` means YES, `[0,1]` means NO. The adapter fetches `getPayoutNumerators` from the CTF contract (Polygon only — Polymarket runs nowhere else), caches the result, and maps `payouts[0] > payouts[1]` to `outcome = true`.

The subtle case is a tie. Polymarket markets occasionally resolve 50/50 — an "invalid" or UMA-disputed market. Equal numerators are not a decidable YES/NO, and paying either side would be wrong. The adapter's answer is the sentinel:

```solidity
// A tie (equal payout numerators — e.g. a 50/50 split or an
// "invalid"/UMA-disputed Polymarket resolution) is not a decidable
// YES/NO outcome. Return the unresolved sentinel (resolvedAt=0) so
// WagerRegistry leaves the wager unsettled and the deadline-based
// refund path returns both stakes, rather than paying a fixed side.
if (cached.passNumerator == cached.failNumerator) {
    return (false, 0, 0);
}
```

On the registry side, `autoResolveFromPolymarket` disambiguates: `resolvedAt == 0` *plus* `isConditionResolved() == true` means "resolved tie," and the wager settles as an immediate draw — both stakes back. A genuinely unresolved market reverts and the deadline-based refund path remains the backstop. The failure mode of an undecidable question is a refund, never a coin-flip payout.

**Trade-offs:** you can only wager on questions Polymarket already lists; resolution timing is entirely external; and you inherit Polymarket's own resolution stack (which is itself UMA underneath). In exchange, the adapter is nearly free to operate — no bonds, no subscriptions, no feed curation — which is why it's the model FairWins exposes first.

## Adapter two: Chainlink Data Feeds, a threshold on a push feed

`contracts/oracles/ChainlinkDataFeedOracleAdapter.sol` turns a continuously-updated price feed into a binary outcome. An admin registers a condition as `(feed, threshold, comparison, deadline)` — the comparison being one of `GT/GTE/LT/LTE/EQ` — against an allowlisted `AggregatorV3Interface` feed. After the deadline, *anyone* calls `evaluate(conditionId)`: it reads `latestRoundData()`, requires `updatedAt >= deadline` (rejecting stale data with `StaleFeedData`), compares the answer to the threshold, and caches the boolean forever.

**Trade-offs:** this model only answers questions that reduce to *number vs. threshold at/after time T* — but for those it is the cheapest and lowest-trust of the four, because the data is already on-chain and the evaluation is a pure function anyone can trigger. The honest caveat: `latestRoundData()` is the latest answer *at evaluation time*, not the answer at the deadline instant. The staleness check bounds this (the round must postdate the deadline), and the first caller after the deadline fixes the reading — an incentive to evaluate promptly if the number is drifting your way.

## Adapter three: Chainlink Functions, request/callback for arbitrary APIs

`contracts/oracles/ChainlinkFunctionsOracleAdapter.sol` handles truths that live behind an API. A condition registers an encoded Chainlink Functions request (the JavaScript source is pinned by a `sourceHash`), a subscription id, gas limit, and DON id. `requestResolution(conditionId)` — again permissionless — sends the request to the Decentralized Oracle Network; the answer arrives asynchronously in the inherited `fulfillRequest` callback, which decodes the DON script's single `uint8` return (0 = NO, 1 = YES) and caches it.

Asynchrony forces two guards the synchronous adapters don't need: a `conditionToPendingRequest` mapping rejects a second request while one is in flight, and a DON-reported error emits `RequestFailed` and leaves the condition unresolved — so a flaky API means "try again," never "wrong answer cached forever."

**Trade-offs:** maximum expressiveness — any public API a script can query — paid for in trust and operations. You are trusting the registered script and the API it queries; the source hash makes the script auditable but not less trusted. There's a funded subscription to maintain, and the request/callback round trip means resolution is a two-transaction affair.

## Adapter four: UMA Optimistic Oracle V3, truth by unchallenged assertion

`contracts/oracles/UMAOptimisticOracleV3Adapter.sol` handles the merger question — outcomes that need human judgment. A condition registers a human-readable `claim`, a bond currency and amount, and a liveness window. `assertResolution(conditionId, asserter)` pulls the bond from the caller and posts the claim to UMA's Optimistic Oracle V3 via `assertTruth`. If the liveness window passes undisputed, OOv3 calls back `assertionResolvedCallback(assertionId, assertedTruthfully)` and the adapter caches the verdict. If disputed, the question escalates to UMA's Data Verification Mechanism (a token-holder vote) and resolves through the same callback — the adapter doesn't distinguish a quiet settlement from a fought one.

One implementation detail worth stealing: the adapter reserves `conditionToAssertion[conditionId]` with a sentinel value *before* the external `assertTruth` call, so a reentrant call sees "assertion already pending" and reverts — checks-effects-interactions preserved without a post-call write to that mapping (the real `assertionId → conditionId` link lives in a separate mapping written after the call). The regression suite for this lives in `test/oracles/UMAOptimisticOracleV3Adapter.test.js`.

**Trade-offs:** the only model of the four that can answer *arbitrary* questions — at the cost of capital (someone must post the bond), latency (the liveness window is a floor on resolution time), and an economic-security assumption: an unchallenged false assertion wins, so the bond must make watching worthwhile.

## Shared discipline across all four

The adapters converge on more than the interface. All cache resolutions in an identical `CachedResolution` struct, making `getOutcome` a cheap view after the first resolution. All make the resolution *trigger* permissionless while keeping condition *registration* owner-only — curation is trusted, settlement is not. And all take an explicit `admin` constructor argument rather than `Ownable(msg.sender)`: FairWins deploys adapters deterministically via CREATE2 through the Safe Singleton Factory, and `msg.sender` in that context is the factory, not the operator. `test/oracles/AdapterDeterministicOwnership.test.js` is the regression test for the day that bug shipped.

`isAvailable()` earns its keep off-chain: spec 023 (`specs/023-oracle-graph-gating/`) gates the frontend's oracle-wager entry point per network, so a user on a chain with no adapters never starts a flow that dead-ends. And spec 003 (`specs/003-polymarket-only-oracle-ui/`) is the abstraction's quiet payoff: the frontend currently exposes *only* the Polymarket model, hiding Chainlink and UMA behind a configuration switch — while the contracts keep all four fully supported. Narrowing the product surface required zero contract changes, because the seam was already there.

## Design decisions

- **A `bool` outcome, not a payout vector.** Binary wagers need one bit; forcing every oracle's output through that funnel at the adapter boundary keeps settlement code singular. The cost is that multi-outcome markets need a different design (wager pools solve this differently — spec 034).
- **Sentinel over revert for "unresolved."** `getOutcome` as a non-reverting view lets the registry, the frontend, and keepers poll cheaply, and lets "resolved tie" and "not resolved" share a wire format while the registry disambiguates with one extra call.
- **Fail toward refund.** Undecidable Polymarket outcomes settle as draws; failed Functions requests stay unresolved; stale feeds revert. No path guesses a winner.
- **`confidence` is honest.** Every adapter today returns 10,000 basis points (or 0 with the sentinel). The field exists so a future probabilistic adapter can report less than certainty without an interface break — it is headroom, not a claim.
- **Adapters are peripherals, not dependencies.** The registry works with zero adapters configured; each adapter degrades to "this resolution type unavailable here," and the UI reflects that per network.

Four resolution machines, three interaction models, one interface — and an escrow contract that never learned the difference.

## Sources

- `contracts/oracles/IOracleAdapter.sol` — the shared interface
- `contracts/oracles/PolymarketOracleAdapter.sol` — CTF resolved-market reads, tie sentinel
- `contracts/oracles/ChainlinkDataFeedOracleAdapter.sol` — push-feed threshold evaluation
- `contracts/oracles/ChainlinkFunctionsOracleAdapter.sol` — request/callback via DON
- `contracts/oracles/UMAOptimisticOracleV3Adapter.sol` — optimistic assertion + dispute callback
- `contracts/wagers/WagerRegistryCore.sol`, `contracts/wagers/WagerRegistryIntents.sol` — `_checkOracleLinkage`, `autoResolveFromPolymarket`, `autoResolveFromOracle`
- `contracts/interfaces/IWagerRegistryTypes.sol` — `ResolutionType` enum
- `specs/003-polymarket-only-oracle-ui/spec.md` — Polymarket-only frontend exposure
- `specs/023-oracle-graph-gating/spec.md` — per-network oracle availability gating
- `test/oracles/` — adapter unit tests incl. `AdapterDeterministicOwnership.test.js`
- `docs/developer-guide/oracle-open-challenges.md` — oracle-settled open challenges
- Chainlink Data Feeds: https://docs.chain.link/data-feeds
- Chainlink Functions: https://docs.chain.link/chainlink-functions
- UMA Optimistic Oracle V3: https://docs.uma.xyz/developers/optimistic-oracle-v3
- Polymarket documentation: https://docs.polymarket.com
- Gnosis Conditional Token Framework: https://docs.gnosis.io/conditionaltokens/
