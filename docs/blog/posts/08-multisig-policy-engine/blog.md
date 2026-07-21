# Enough Signatures Is Not Enough: An On-Chain Policy Engine for Safe Multisigs

*How a singleton transaction guard turns threshold approval into threshold approval plus policy — with no admin key and no way to brick a vault*

| | |
|---|---|
| **Series** | Custody & Multisig (part 2) |
| **Part** | 8 of 34 |
| **Audience** | Security engineers, DAO/treasury tooling builders |
| **Tags** | `safe`, `multisig`, `policy-engine`, `transaction-guard`, `security` |
| **Reading time** | ~9 minutes |

## The transaction that had every signature it needed

A three-owner treasury Safe runs a 2-of-3 threshold. One Tuesday, a proposal appears in the queue: send 180,000 USDC to an address nobody recognizes. Owner one approves it from a phone between meetings — the amount looks like the quarterly market-maker payment, and the proposal description says as much. Owner two approves an hour later for the same reason. The threshold is met. The transaction executes. The address belonged to whoever phished owner one's session and queued the proposal.

Nothing in the multisig failed. That is the uncomfortable part. A threshold multisig has exactly one control — *k* of *n* owners agree — and once that bar is cleared, the Safe will send any amount, to any destination, at any time. Every mitigation teams usually reach for is procedural: "we review destinations carefully," "we never approve on mobile," "large transfers get a call first." Procedures are policy that lives in people's heads, and people approve things between meetings.

FairWins' custody feature (spec 043, covered in part 1 of this series) gives members shared Safe vaults with a propose/approve queue. Spec 049 adds the missing layer: a **policy engine** that constrains what an *approved* vault transaction may do — after the owners' threshold is met, before execution. The phished proposal above dies at execution against a per-transaction limit or a recipient allowlist, no matter how many signatures it collected.

The interesting engineering question is where such rules can live so that they are actually binding. Client-side checks are advisory — anyone can call the Safe directly. A backend policy service is a trusted party. The answer Safe's architecture offers is the **transaction guard**, and spec 049 builds the whole engine as one.

## Where a guard sits in Safe's execution path

Safe v1.4.1 lets a Safe register a guard contract that gets a veto over every `execTransaction`. Just before executing an approved transaction, the Safe calls the guard's `checkTransaction` with the full transaction context; if the guard reverts, the transaction never executes. After execution it calls `checkAfterExecution`.

FairWins keeps a dependency-free local replica of the interface in `contracts/custody/ISafeGuard.sol`, byte-identical to the canonical one (Safe's `Enum.Operation` is `uint8` in the ABI, so the selectors — and the ERC-165 interface id that `setGuard` checks as `GS300` — match exactly):

```solidity
interface ISafeGuard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata signatures,
        address msgSender
    ) external;

    function checkAfterExecution(bytes32 txHash, bool success) external;
}
```

The implementation, `contracts/custody/SafePolicyGuard.sol`, is a **singleton per chain**: one immutable contract holds every opted-in vault's rule configuration and live accounting, keyed by the Safe's address. Because the Safe itself is `msg.sender` when it calls the guard, the guard always knows which vault's policy to evaluate — no registration handshake needed.

Two properties define the trust model. First, the guard is **restriction-only**: it can block a transaction but can never initiate, approve, or execute one, and it holds no funds (non-payable everywhere). Second, **the vault is the only authority over its own policy**: every call to `configureRules` requires `msg.sender == safe`, which is only reachable as a Safe self-transaction — meaning a policy change rides the same threshold-approved proposal queue as moving money. There is no owner, no admin role, and the contract is deliberately not upgradeable, because an upgrade key over the guard would be a backdoor over every vault's enforcement.

## The rules

Version 1 ships the classic treasury controls, each independently optional per vault:

- **Per-transaction limit** — per asset (`address(0)` for the native coin, or an ERC-20 address); no single outgoing transaction may exceed it.
- **24-hour-window limit** — per asset; the window opens at the first counted spend and resets 24 hours later.
- **Recipient allowlist** — outgoing value may only go to approved addresses.
- **Cooldown** — a minimum delay between fund-moving transactions.

A transaction is *counted* — subject to limits and cooldown — when it carries native `value > 0` or calls one of three ERC-20 selectors the guard decodes: `transfer`, `transferFrom`, and `approve`. Counting `approve` is not an accident: an approval is a spending grant, and skipping it would leave an approve-then-pull bypass where the vault approves a spender within no limit and the spender drains the allowance later.

The allowlist has a subtlety worth copying. For decoded token actions it gates the *beneficiary* — the `transfer`/`transferFrom` recipient or the `approve` spender — not the token contract being called. For everything else it gates the call target, so calldata the guard cannot decode still cannot reach an un-allowlisted contract. Native value riding a call additionally gates the target.

Calldata decoding in `_classify` slices exactly the canonical argument words (`data[4:68]` for `transfer`/`approve`, `data[4:100]` for `transferFrom`). Solidity functions ignore extra trailing calldata for static arguments, so the guard classifies a padded call exactly as the token itself would execute it — padding can neither dodge classification nor spuriously revert it.

## Hard denials: the bypasses you must close first

Limits are worthless if the transaction can step outside the accounting. While any rule is active, the guard hard-rejects two shapes:

- **`operation == DELEGATECALL`.** Delegatecalled code runs in the Safe's own storage context — it can move funds without tripping any decode path and can literally rewrite the guard slot. The consequence is that MultiSend batching is unavailable on policy vaults; since spec 043's flows are single-call, nothing regresses.
- **`gasPrice != 0`.** Safe's gas-refund mechanism pays `refundReceiver` out of the Safe. That is an uncounted outflow, so refund transactions are refused outright.

Both denials are typed errors (`DelegatecallBlocked`, `GasRefundBlocked`), like every other rejection — clients decode one canonical error format instead of parsing revert strings.

## Lockout-proofing: a policy you can always loosen

The classic failure mode of on-chain policy is self-imprisonment: owners set a cooldown of a year, or enable an allowlist with only a now-defunct address, and the vault is bricked. Spec 049's answer (FR-008) is a pair of exemptions at the top of the shared evaluation function:

```solidity
// Lockout-proof exemptions (FR-008): vault self-management and policy
// configuration bypass all fund rules; both still require the vault's
// own approval threshold.
if (to == safe) return ("", false);
if (to == address(this)) {
    if (value != 0) return (abi.encodeWithSelector(ValueToGuardBlocked.selector), false);
    return ("", false);
}
```

Transactions targeting the Safe itself (owner, threshold, and guard management) or the guard (policy configuration, with `value == 0` enforced so the exemption cannot smuggle funds) bypass all fund rules — while still requiring the vault's threshold. A too-strict policy can therefore always be loosened by the same collective consent that created it; no vault can be locked out by its own rules. This is proven against a real Safe v1.4.1 deployment in `test/integration/policy-guard-safe.test.js`, not just against a mock.

## One evaluation path, shared by enforcement and preview

Owners should learn a transaction violates policy *before* they spend signatures on it. The guard exposes `previewTransaction`, a read-only twin of `checkTransaction` that runs the exact same internal `_checkPolicy` function and returns the would-be revert data. The frontend (`frontend/src/lib/custody/policy.js`) pre-flights every proposal through it, so what the UI displays can never drift from what the chain enforces — there is one rule evaluator, used verbatim by both paths.

Enforcement itself follows checks-effects with no interactions at all: `_checkPolicy` is read-only, then `_commitAccounting` writes window and cooldown state. The guard makes zero external calls, so there is no reentrancy surface to reason about.

## Policy from block one

A vault attached to a guard after creation has a gap: transactions before attachment are unpoliced. `contracts/custody/PolicyGuardSetup.sol` closes it. It is a stateless helper delegatecalled from `Safe.setup(to, data, ...)` during vault creation: running in the new proxy's context, it writes the guard address directly into Safe's guard storage slot (`keccak256("guard_manager.guard.address")`), re-performs the ERC-165 `GS300` acceptance check that writing the slot directly would otherwise skip, emits a byte-identical `ChangedGuard` event for explorer parity, and then `call`s the guard's `configureRules` calldata — at which point `msg.sender` seen by the guard *is* the new Safe, so the creation path needs no special authority carve-out. Any revert bubbles up and aborts the whole vault creation: a half-configured vault can never deploy. And because the full initializer is hashed into the CREATE2 salt, the vault's predicted address commits to its initial policy.

For existing vaults, attachment is ordered so there is no half-set gap: queue `configureRules` first (inert without the guard), then `setGuard` (activates).

## Design decisions and accepted limits

**Immutable singleton, no proxy.** Elsewhere FairWins is aggressively UUPS (`WagerRegistry`, `MembershipManager`), but the guard has no upgrade path on purpose: whoever can swap the implementation can disable every vault's enforcement. Upgrades ship as a *new* guard deployment that each vault adopts via its own threshold-approved `setGuard` — consent per vault, not fiat from a deploy key. Both contracts deploy deterministically via CREATE2 and are recorded in `deployments/` under `safePolicyGuard` / `policyGuardSetup`, rolling out Mordor (63) then Polygon (137).

**Fixed-reset window, not rolling.** A true rolling 24-hour window requires unbounded per-transaction history on-chain. The fixed-reset window admits up to 2× the limit across a span that straddles a reset — a bounded, disclosed weakening (research.md R3), surfaced in the UI rather than hidden.

**Unvalued calldata passes limits.** The guard values native transfers and three ERC-20 selectors; a DEX swap or arbitrary contract call passes spending limits unvalued. It still faces the allowlist on the call target, so a vault that needs full lockdown enables the allowlist and gets it.

**Conservative accounting.** Window and cooldown state commit in `checkTransaction`, before execution. If the Safe's inner call fails without reverting the outer transaction, the spend still counts. Overcounting can only restrict, never permit — the safe direction to be wrong in.

The through-line: every rule that exists is enforced exactly, every gap that exists is named, bounded, and disclosed, and no key anywhere can waive either.

## Sources

- `specs/049-multisig-policy-engine/` — spec, plan, research, data model
- `docs/developer-guide/multisig-policy-engine.md`
- `contracts/custody/SafePolicyGuard.sol`
- `contracts/custody/ISafeGuard.sol`
- `contracts/custody/PolicyGuardSetup.sol`
- `test/integration/policy-guard-safe.test.js`, `test/custody/SafePolicyGuard.test.js`
- `frontend/src/lib/custody/policy.js`
- Safe transaction guards (Safe v1.4.1 `GuardManager`): https://docs.safe.global/advanced/smart-account-guards and https://github.com/safe-global/safe-smart-account
- ERC-165 (interface detection, the `GS300` check): https://eips.ethereum.org/EIPS/eip-165
- ERC-20 (`transfer`/`transferFrom`/`approve` semantics): https://eips.ethereum.org/EIPS/eip-20
- EIP-1014 (CREATE2, deterministic deployment): https://eips.ethereum.org/EIPS/eip-1014
