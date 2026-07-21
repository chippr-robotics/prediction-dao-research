# Sanctions Screening as a Contract Primitive: One Guard, Every Value Path

*Why FairWins moved compliance from a frontend check into a shared, fail-closed on-chain guard — and how the same 100 lines of Solidity thread through wagers, pools, memberships, and token issuance*

---

> **Important Note**: This article describes prediction markets based on publicly available information and legitimate forecasting. Nothing here is a mechanism for trading on material non-public information or circumventing securities regulations. All participants remain fully subject to applicable laws, compliance requirements, and fiduciary obligations.

---

| | |
|---|---|
| **Series** | Identity & Access, part 3 |
| **Audience** | Compliance engineers, regulated-product founders, Solidity engineers |
| **Tags** | `compliance`, `sanctions`, `access-control`, `solidity`, `fail-closed` |
| **Reading time** | ~9 minutes |

## The check that wasn't there

Picture the code review. Your team ships wallet screening for a peer-to-peer wager platform: when a user connects, the frontend reads the Chainalysis sanctions oracle over RPC, and if the address is listed, the UI refuses to proceed. The compliance box is ticked. The demo looks great.

A week later someone on the security review asks the obvious question: *what happens if a sanctioned address never opens your frontend?* The contracts are publicly callable on Polygon. Anyone with a script and an ABI can call `createWager` directly. Your screening layer — the one your Terms of Service describe as a control — is a suggestion.

This is the trap that catches most "compliance-aware" dApps. OFAC sanctions exposure is strict liability: it does not matter that you *intended* to block the address, or that your UI *would have* blocked it. If your smart contract accepted escrow from a listed address, the transaction happened. A screen that lives only in the client is not a control; it's theater with good intentions.

FairWins' answer, built in spec `007-compliance-gating`, is to treat sanctions screening the way you'd treat reentrancy protection: as a contract primitive. One small, shared contract — `SanctionsGuard` — is consulted by every value-bearing entry point across the platform. The frontend still pre-checks (fast UX, no wasted gas), but the layer that actually enforces is the one nobody can route around.

## The guard itself

`contracts/access/SanctionsGuard.sol` is deliberately small: about 100 lines, no proxy, no funds, no upgradeability. It composes two lists behind a single verdict:

1. **The Chainalysis on-chain Sanctions Oracle** — a public contract Chainalysis maintains that answers `isSanctioned(address)` against the OFAC SDN set (deployed on Polygon mainnet at `0x40C57923924B5c5c5455c48D93317139ADDaC8fb`).
2. **An operator-maintained discretionary deny-list** — a plain `mapping(address => bool)` for addresses associated with illicit finance beyond SDN membership, mutated only by `SANCTIONS_ADMIN_ROLE`.

The interface (`contracts/interfaces/ISanctionsGuard.sol`) exposes exactly what consumers need:

```solidity
interface ISanctionsGuard {
    function isAllowed(address account) external view returns (bool);
    function checkBlocked(address account) external view; // reverts SanctionedAddress(account)
    function isDenied(address account) external view returns (bool);
    function sanctionsOracle() external view returns (address);

    function setDenied(address account, bool denied, string calldata reason) external;
    function setSanctionsOracle(address oracle) external;

    event DenyListUpdated(address indexed account, bool denied, address indexed actor, string reason);
    event SanctionsOracleUpdated(address indexed oracle);

    error SanctionedAddress(address account);
}
```

Two views matter. `isAllowed` returns a boolean for callers that want to branch (the frontend's advisory read uses this). `checkBlocked` reverts with `SanctionedAddress(account)` — the form contracts consume, because in Solidity a revert in the Checks phase is the cheapest, safest way to make a whole transaction never happen.

Note what the admin surface records. `setDenied` takes a human-readable `reason` and emits `DenyListUpdated` with the account, the direction of the change, the acting admin, and the reason — so the deny-list's entire history is an on-chain audit trail: who blocked whom, when, and why. There is no off-chain compliance database to subpoena or lose; the event log *is* the record. The admin keys behind both roles follow the platform's air-gapped floppy-keystore flow, so list mutations require a deliberate offline signing ceremony.

## Fail-closed, for real

The interesting engineering is in how the guard talks to the oracle. The naive version — `oracle.isSanctioned(account)` inside a `try/catch` — has a sharp edge: if the configured oracle address has no code (a bad deploy config, a selfdestructed target, the wrong chain), a high-level Solidity call doesn't behave the way you'd hope, and return-data decoding failures aren't reliably swallowed by `catch`. The guard instead does the query by hand:

```solidity
function _queryOracle(address account) internal view returns (bool sanctioned, bool ok) {
    address oracle = address(_oracle);
    if (oracle == address(0)) return (false, true); // deny-list-only
    (bool success, bytes memory data) = oracle.staticcall(
        abi.encodeWithSelector(IChainalysisSanctionsOracle.isSanctioned.selector, account)
    );
    if (!success || data.length < 32) return (false, false); // fail-closed
    return (abi.decode(data, (bool)), true);
}
```

A low-level `staticcall` gives the guard full control over every failure mode: revert, out-of-gas bubble-up, empty return data from a codeless address, malformed return data. Anything short of a well-formed 32-byte answer means the configured oracle "gave no usable answer," and `isAllowed` returns false for *every* account. Spec 007's FR-019 states the invariant plainly: if the screening source is unavailable, refuse the screened action rather than allow it unscreened.

There is one deliberate exception, and it's a configuration, not a failure. An oracle set to `address(0)` means *deny-list-only enforcement* — the posture for networks where Chainalysis simply doesn't deploy (Polygon Amoy gets a `MockSanctionsOracle` in tests; production injects the real mainnet address at deploy time, never hardcoded, per FR-022/FR-055). The distinction is precise: a **configured but broken** oracle blocks everyone; an **unset** oracle blocks only the deny-list. Confusing those two states is how fail-closed systems quietly become fail-open.

## One guard, four subsystems

What makes this a *primitive* rather than a feature is reuse. A grep for `ISanctionsGuard` across `contracts/` finds the same pattern in four independent subsystems:

**Wagers** (`contracts/wagers/WagerRegistryCore.sol`): every escrow entry point starts its Checks phase with a three-line helper —

```solidity
function _screen(address account) internal view {
    ISanctionsGuard guard = sanctionsGuard;
    if (address(guard) != address(0)) guard.checkBlocked(account);
}
```

`createWager` screens the creator as its first check. The accept path screens *both* sides — the taker **and** the original creator — because acceptance is the moment the second stake enters escrow, and the creator may have been listed since they posted the wager. This implements spec 007's FR-021: re-screen at wager entry, every time.

**Memberships** (`contracts/access/MembershipManager.sol`): `purchaseTier`, `upgradeTier`, `extendMembership`, and voucher redemption (`redeemVoucher`, spec 026) all call `_screen(actor)` before any USDC moves. Even the admin-only `grantMembership` screens the grantee — the guard is non-bypassable *including by operators*, so a role-holder can't hand standing to a listed address by accident.

**Wager pools** (`contracts/pools/WagerPoolFactory.sol`): pools screen creators and joiners through the same guard, with one extra invariant worth stealing: a `screeningRequired` flag set at initialization. On production networks the factory *refuses to run unconfigured* — `screen()` reverts `ScreeningNotConfigured` if the flag is set but the guard address is zero. The "unset means disabled" convenience that's fine for local development becomes an impossible state in production.

**Token issuance** (`contracts/tokens/TokenFactory.sol`, spec 028) screens issuers and injects the guard into the tokens it clones, and the callsign registry (`contracts/naming/CallsignRegistry.sol`, spec 054) checks `isAllowed` before letting anyone register a name.

Each consumer holds its own settable reference (`setSanctionsGuard`, admin-gated), so the guard can be rewired without upgrading any consumer — and a single `setDenied` call propagates instantly to every subsystem. One list, one admin surface, one event stream, four enforcement points.

## What is deliberately *not* screened

The consumption table in `specs/007-compliance-gating/contracts/ISanctionsGuard.md` has a line that's easy to read past: exit and refund paths — `claimRefund`, `claimPayout`, `batchExpireOpen`, `declareDraw` — are **not** screened.

This is the design decision most teams get wrong in the other direction. If a party is added to the deny-list *after* their stake enters escrow, screening the exit path would permanently trap their funds in your contract. That converts a screening control into an asset freeze — a materially different (and much heavier) legal act than refusing new business, and one that turns your escrow contract into a custodian of blocked property. FairWins draws the line where the spec draws it: a listed address can take no *new* action that moves value in, but can always recover what is already theirs. The guard gates entry, never exit.

## Trade-offs

**Gas on every entry.** Each screened action pays for a cross-contract `staticcall`, and (when the oracle is set) a second one into Chainalysis. That's real overhead on the hot path. The team judged it acceptable because the alternative — screening only at membership time — leaves the FR-021 gap: an address listed mid-membership could keep wagering until renewal.

**Trusting an external oracle.** The Chainalysis oracle is a centralized, permissioned data source; FairWins takes its answers as ground truth. The mitigations are structural rather than trust-minimized: the oracle is read-only from the guard's perspective, it can be swapped by `DEFAULT_ADMIN_ROLE` if compromised or deprecated, and the discretionary deny-list works even with the oracle unset. This is an honest trade — no decentralized OFAC feed exists, and pretending otherwise doesn't help anyone.

**Fail-closed can mean downtime.** If Chainalysis' contract ever reverted for everyone, every screened FairWins entry point would halt until an admin re-pointed or unset the oracle. That's the cost of FR-019, accepted with eyes open: brief unavailability is recoverable; a strict-liability violation is not.

**Defense in depth, not defense in one place.** The on-chain guard is one layer of spec 007's stack: a Cloudflare edge geo-gate (HTTP 451 with an origin-lock header so the gate can't be bypassed by hitting the origin), an advisory app-layer oracle read for fast UX, versioned hash-addressed legal documents, and on-chain consent records. The guard is the layer that holds when every other layer is skipped — because on a public chain, one of them always can be.

## Sources

- `specs/007-compliance-gating/spec.md` — compliance & legal gating layer (FR-016–FR-022, FR-054–FR-055)
- `specs/007-compliance-gating/contracts/ISanctionsGuard.md` — behavior contract and consumption table
- `contracts/access/SanctionsGuard.sol` — guard implementation (fail-closed staticcall, deny-list, roles)
- `contracts/interfaces/ISanctionsGuard.sol`, `contracts/interfaces/IChainalysisSanctionsOracle.sol`
- `contracts/wagers/WagerRegistryCore.sol`, `contracts/wagers/WagerRegistry.sol` — `_screen` in create/accept paths
- `contracts/access/MembershipManager.sol` — screening on purchase/upgrade/extend/grant/voucher redemption
- `contracts/pools/WagerPoolFactory.sol` — `screeningRequired` invariant, `ScreeningNotConfigured`
- `contracts/tokens/TokenFactory.sol`, `contracts/naming/CallsignRegistry.sol` — additional consumers
- Chainalysis on-chain sanctions oracle: https://go.chainalysis.com/chainalysis-oracle-docs.html
- OFAC SDN list: https://ofac.treasury.gov/sanctions-list-service
- OpenZeppelin AccessControl: https://docs.openzeppelin.com/contracts/5.x/access-control
- RFC 7725 (HTTP 451 Unavailable For Legal Reasons): https://www.rfc-editor.org/rfc/rfc7725
