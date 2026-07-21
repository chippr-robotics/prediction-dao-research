# Three Ways to Break an Escrow: Slither, Manticore, and Medusa on a Wager Protocol

*A layered verification stack for peer-to-peer escrow — and the bug each layer is uniquely positioned to catch*

---

> **Important Note**: FairWins is a platform for peer-to-peer wagers based on publicly available information and legitimate forecasting. Nothing here is a mechanism for trading on material non-public information or circumventing applicable law. All participants remain fully subject to applicable regulations and compliance requirements. This post is about verifying escrow code, not about the wagers themselves.

---

## The function that can never be wrong

Here is the single function in `WagerRegistry` that moves money to a winner. Two people staked USDC, an oracle (or a counterparty) declared an outcome, and now the winner claims the pot:

```solidity
function _claimPayout(address actor, uint256 wagerId) internal {
    Wager storage w = _wagers[wagerId];
    if (w.status != Status.Resolved) revert NotResolved();
    if (actor != w.winner) revert NotWinner();
    if (w.paid) revert AlreadyPaid();

    w.paid = true;
    // Compute as uint256 to avoid uint128 overflow on sum
    uint256 payout = uint256(w.creatorStake) + uint256(w.opponentStake);
    IERC20(w.token).safeTransfer(w.winner, payout);

    emit PayoutClaimed(wagerId, w.winner, payout);
}
```

Twelve lines, and every one of them is load-bearing. The three `if` checks are the *checks*. Setting `w.paid = true` before the transfer is the *effect*. The `safeTransfer` is the *interaction*. That ordering — checks-effects-interactions — is the difference between a contract that pays each winner once and a contract that a reentrant token can drain. The `uint256` cast on the sum is the difference between a correct payout and a silent `uint128` overflow. The `actor != w.winner` check is the difference between a winner claiming their pot and anyone claiming everyone's.

No single testing technique gives you confidence across all of those failure modes at once. A pattern matcher can see that `w.paid = true` sits before the transfer, but it has no idea whether `payout` is arithmetically correct. A path explorer can prove the arithmetic never overflows, but it will time out before it can reason about ten wagers created and settled in an arbitrary order. A fuzzer can hammer that arbitrary order until the escrow goes insolvent, but it will never *prove* anything — only fail to disprove it.

So `contracts/wagers/WagerRegistry.sol` sits under three tools that catch different things. This is a tour of what each one actually does to the escrow and payout logic, grounded in the configuration and harnesses that ship in the repo.

## Layer 1: Slither, on every pull request

Slither is static analysis — it reads the compiled contract without ever executing it, and matches known-bad shapes. It is the cheap, fast layer, so it runs on every PR as the `slither-analysis` job in `.github/workflows/security-testing.yml`, gating merges alongside the Hardhat suite and coverage.

The configuration is deliberately un-permissive (`slither.config.json`):

```json
{
  "filter_paths": "node_modules|test|contracts/mocks",
  "exclude_dependencies": true,
  "exclude_informational": false,
  "exclude_low": false,
  "exclude_medium": false,
  "exclude_high": false,
  "compile_force_framework": "hardhat"
}
```

Nothing below high severity is filtered out. Dependencies and mocks are excluded so the signal is about *our* code, but every severity band on our code is surfaced.

What Slither is good at, on `_claimPayout`, is exactly the class of bug that is visible in the *shape* of the code: a reentrancy detector notices when a function makes an external call before it finishes updating state. Point it at a version of this function where `w.paid = true` came *after* the `safeTransfer` and it flags the ordering immediately — the reentrancy-eth detector exists precisely for that. It also catches unprotected state-changing functions (a `setOwner` with no modifier), missing zero-address validation on constructor and setter inputs, and dangerous strict equalities like `require(msg.value == bondAmount)`.

What Slither cannot do is tell you whether the payout is *right*. `uint256(w.creatorStake) + uint256(w.opponentStake)` and `uint256(w.creatorStake)` on its own are the same shape to a pattern matcher. Static analysis sees syntax and control-flow, not the semantics of "the winner should receive both stakes and no more." That is the gap the next two layers exist to close.

## Layer 2: Manticore, and the fix that made it real

Manticore is symbolic execution. Instead of running the contract with concrete inputs, it runs it with *symbolic* ones — each input is an unknown, and at every branch it forks the world, accumulating the constraints that lead down each path. Where a unit test asks "does it work for `amount = 100`?", Manticore asks "is there *any* `amount` for which this assertion can fail, this arithmetic can overflow, or this path can revert unexpectedly?" For a bounded number of transactions it explores paths exhaustively, which is why it is aimed at the highest-risk contracts: it runs weekly in the `torture-test.yml` workflow against `WagerRegistry`, `MembershipManager`, `KeyRegistry`, and every oracle adapter (Polymarket, both Chainlink adapters, and UMA).

That weekly run existed for a while before it was actually doing anything — and that is the most instructive part of the story. Manticore drives its own Solidity compiler, and it did not know where FairWins keeps its dependencies. Every run died on:

```
Error: Source "@openzeppelin/contracts/access/Ownable.sol" not found: File not found.
```

followed, in the finalizer, by an `AttributeError: 'NoneType' object has no attribute 'result'`. That second error is the tell: when compilation fails, Manticore has no transaction objects to finalize, so it crashes trying to read results that never existed. The CI step was catching the failure and moving on. The verification tool was green and inert — the worst state a security tool can be in, because it manufactures confidence it hasn't earned.

The fix, documented in `docs/MANTICORE_FIX.md`, is unglamorous and exactly right. A `remappings.txt` at the repo root tells the compiler where the imports live:

```
@openzeppelin/=node_modules/@openzeppelin/
@chainlink/=node_modules/@chainlink/
@uma/=node_modules/@uma/
```

And a wrapper script, `scripts/run-manticore.py`, reads those remappings and passes them through to Manticore as `--solc-remaps` arguments, validates the environment before it starts, and handles timeouts gracefully so a partial exploration still yields artifacts. The workflow calls the wrapper instead of the bare binary:

```bash
timeout 600 python scripts/run-manticore.py contracts/wagers/WagerRegistry.sol \
  --contract WagerRegistry --timeout 600
```

With imports resolving, Manticore compiles the registry and starts forking paths through `_claimPayout` and its siblings. Now the `uint256` cast earns its comment: symbolic execution reasons about the full `2^128` range of each stake and confirms the sum can't overflow the way a naive `uint128` addition would. It checks that the three guard clauses have no satisfiable path that skips them. This is the layer that turns "I'm pretty sure the arithmetic is fine" into "there is no input for which it isn't."

Its limits are honest and documented: state explosion means it struggles with deep multi-transaction sequences, unbounded loops, and external calls into contracts it can't model. Manticore proves things about a *bounded* exploration of one contract. It will not, on its own, discover a bug that only emerges after ten interleaved wagers.

## Layer 3: Medusa, on the whole stack at once

That interleaving is Medusa's entire job. Medusa is a property-based fuzzer: it deploys a harness, then throws long, random sequences of real transactions at it — up to 100 calls per sequence, per `medusa.json` — and after every call it re-checks a set of invariants. It is looking for the emergent bug: the one that no single transaction causes, but some *order* of transactions does.

The harness for the escrow is `contracts/test/WagerRegistryFuzzTest.sol`, and critically it deploys the *production* stack the way production does — the real `MembershipManager` and `WagerRegistry` behind ERC-1967 proxies, initialized through the proxy, with tiers configured and memberships purchased. Medusa then fuzzes against the proxy. The invariants are plain `bool`-returning functions with a `property_` prefix (declared in `medusa.json` under `testPrefixes`). The one that matters most is escrow solvency:

```solidity
function property_escrow_covers_active_stakes() public view returns (bool) {
    uint256 totalLocked = 0;
    uint256 count = registry.nextWagerId();
    for (uint256 i = 1; i < count; i++) {
        IWagerRegistryTypes.Wager memory w = registry.getWager(i);
        if (w.status == IWagerRegistryTypes.Status.Open) {
            totalLocked += w.creatorStake;
        } else if (w.status == IWagerRegistryTypes.Status.Active && !w.paid) {
            totalLocked += uint256(w.creatorStake) + uint256(w.opponentStake);
        } else if (w.status == IWagerRegistryTypes.Status.Resolved && !w.paid) {
            totalLocked += uint256(w.creatorStake) + uint256(w.opponentStake);
        }
    }
    return token.balanceOf(address(registry)) >= totalLocked;
}
```

This is a claim no static or symbolic tool made: *at every point in any transaction history, the registry holds at least enough tokens to cover every stake it still owes.* If some sequence of create / accept / claim / refund / cancel ever pays out twice, or refunds a stake it already released, or leaks tokens on the open-challenge path, this property goes false and Medusa hands you the exact failing call sequence.

The rest of the harness fences the state machine from every angle: `property_no_double_claim` asserts the `paid` flag is irreversible; `property_state_only_progresses_forward` tracks per-wager status across calls and rejects any backward transition (`Resolved` and `Refunded` are terminal); `property_winner_is_participant` requires every resolved winner to be the creator or the opponent; `property_payout_equals_total_stakes` guards the arithmetic that Manticore proved, now under live sequences; and `property_cannot_reinitialize` confirms the UUPS proxy's one-time initializer can never be called again to seize roles.

There is a genuinely clever bit in the open-challenge invariants. The harness holds no private key for any claim authority, so it *cannot* forge the EIP-712 signature that accepts an open wager. `property_open_never_active_without_signature` turns that into a test: none of the harness's open wagers may ever reach `Active`, because reaching `Active` would require a signature the fuzzer can't produce. If Medusa ever finds a path that activates one anyway, the signature gate is broken.

Medusa's weakness is the mirror of Manticore's strength: it is random, not exhaustive. A passing run means "no counterexample found in this campaign," never "no counterexample exists." That is precisely why the arithmetic invariant lives in *both* the fuzzer and the symbolic layer.

## Design decisions

**Cost-order the layers.** Slither is cheap and runs on every PR; Manticore and Medusa are expensive and run weekly in `torture-test.yml`. You get fast pattern feedback on the critical path and heavyweight proof/fuzzing off it. Nobody waits ten minutes per push for a symbolic run.

**Overlap the arithmetic on purpose.** Payout correctness is checked by Manticore (exhaustive over inputs, one transaction) *and* Medusa (random over sequences, many transactions). Neither subsumes the other: one proves the sum never overflows, the other proves no ordering of settlements ever breaks solvency. The redundancy is the point.

**Fuzz the real deployment shape.** The Medusa harness stands up UUPS proxies and buys memberships instead of poking a bare logic contract. An invariant that only holds for a contract you don't ship is worthless; the escrow-solvency property is only meaningful against the proxy users actually transact with.

**Treat a silent security tool as a failure.** The Manticore import bug is the lesson that generalizes past this repo: a verification tool that green-lights because it never compiled your code is worse than no tool, because it launders false confidence. The fix wasn't cleverness — it was noticing the tool wasn't running and making it run.

## Sources

- `contracts/wagers/WagerRegistryCore.sol` — `_claimPayout` (checks-effects-interactions, payout formula)
- `contracts/wagers/WagerRegistry.sol` — `claimPayout` / `claimRefund` / `createWager` externals
- `contracts/test/WagerRegistryFuzzTest.sol` — Medusa invariant harness (escrow solvency, forward-only state, open-challenge signature gate)
- `medusa.json` — fuzzing config (target contracts, `property_` prefixes, sequence length)
- `slither.config.json` — Slither configuration (severity bands, remaps, filtered paths)
- `remappings.txt` — OpenZeppelin / Chainlink / UMA import remaps
- `docs/MANTICORE_FIX.md` — the import-resolution fix and the `run-manticore.py` wrapper
- `docs/security/index.md`, `static-analysis.md`, `symbolic-execution.md`, `fuzz-testing.md` — the layered testing overview
- `.github/workflows/security-testing.yml` — PR-gating Slither job
- `.github/workflows/torture-test.yml` — weekly Manticore + Medusa runs
- [Slither](https://github.com/crytic/slither), [Manticore](https://github.com/trailofbits/manticore), [Medusa](https://github.com/crytic/medusa) — Trail of Bits / crytic tooling
- [SWC Registry](https://swcregistry.io/), [Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- ERC-1167 minimal proxy and EIP-712 typed-data signing — [eips.ethereum.org](https://eips.ethereum.org)
