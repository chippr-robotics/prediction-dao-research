# Smart Contracts

Reference for the active FairWins contract suite under `contracts/`.
(`contracts-archive/` holds superseded research — governance, conditional-token
markets, friend-group factories — and is reference-only.)

## Contract relationships

```mermaid
graph TD
    WR[WagerRegistry<br/><i>wagers/ · UUPS proxy</i>]
    MM[MembershipManager<br/><i>access/ · UUPS proxy</i>]
    MV[MembershipVoucher<br/><i>access/ · immutable ERC-721</i>]
    SG[SanctionsGuard<br/><i>access/</i>]
    KR[KeyRegistry<br/><i>privacy/</i>]
    PA[PolymarketOracleAdapter]
    CDF[ChainlinkDataFeedOracleAdapter]
    CFN[ChainlinkFunctionsOracleAdapter]
    UMAA[UMAOptimisticOracleV3Adapter]

    WR -->|checkCanCreate / recordCreate / recordClose| MM
    WR -->|checkBlocked| SG
    WR -->|getOutcome via IOracleAdapter| PA & CDF & CFN & UMAA
    MM -->|checkBlocked| SG
    MM -->|redeemVoucher burns + grants| MV
    MV -->|price / treasury config| MM
    SG -->|isSanctioned| CHA[Chainalysis oracle]
    PA --> PM[Polymarket CTF]
    CDF --> FEED[Chainlink price feeds]
    CFN --> DON[Chainlink Functions DON]
    UMAA --> OO[UMA Optimistic Oracle V3]
    KR -.read by frontend for<br/>envelope encryption.-> WR
```

Admin roles (OpenZeppelin `AccessControl`) span the suite:
`DEFAULT_ADMIN_ROLE` (configuration), `GUARDIAN_ROLE` (pause),
`ACCOUNT_MODERATOR_ROLE` (per-account freeze), `ROLE_MANAGER_ROLE`
(membership grants), and `UPGRADER_ROLE` (authorizes UUPS implementation
upgrades on `WagerRegistry` / `MembershipManager`); plus the paid user role
`WAGER_PARTICIPANT_ROLE`. See [Roles and Tiers](../system-overview/roles-and-tiers.md)
and the [Account Moderation Policy](../system-overview/account-moderation.md).

> **Upgradeability.** `WagerRegistry` (spec 025) and `MembershipManager`
> (spec 027) are **UUPS proxies** — they inherit
> [`UUPSManaged`](upgradeable-contracts.md), live at stable addresses, and have
> their logic upgraded in place (state preserved). `MembershipVoucher`
> (spec 026) is deliberately **immutable**. See
> [ADR-004](../adr/004-upgradeable-registry-uups.md) and the
> [contract-upgrade runbook](../runbooks/contract-upgrades.md).

## WagerRegistry (`contracts/wagers/WagerRegistry.sol`)

The core contract: escrow plus a state machine over every wager.

### Wager state machine

```mermaid
stateDiagram-v2
    [*] --> Open: createWager / createWagerWithTerms
    [*] --> Open: createOpenWager (open challenge, no named opponent)
    Open --> Active: acceptWager
    Open --> Active: acceptOpenWager (claim-code signature)
    Open --> Refunded: cancelOpen / declineWager /<br/>claimRefund / batchExpireOpen<br/>(after acceptDeadline)
    Active --> Resolved: declareWinner /<br/>autoResolveFromPolymarket /<br/>autoResolveFromOracle
    Active --> Draw: declareDraw (both parties<br/>or arbitrator)
    Active --> Refunded: claimRefund (after resolveDeadline)
    Resolved --> [*]: claimPayout (winner, once)
    Draw --> [*]: stakes auto-returned
    Refunded --> [*]
```

### Key functions

| Function | Caller | Effect |
|----------|--------|--------|
| `createWager(opponent, arbitrator, token, creatorStake, opponentStake, acceptDeadline, resolveDeadline, resolutionType, conditionId, creatorIsYes, metadataHash, metadataUri)` | Creator | Escrows creator stake, emits `WagerCreated` |
| `createWagerWithTerms(...)` | Creator | Same, additionally binds the current terms-version hash |
| `createOpenWager(claimAuthority, arbitrator, token, stake, …)` | Creator (Silver+) | **Open challenge** — no named opponent; escrows creator stake, emits `OpenWagerCreated` |
| `acceptWager(wagerId)` | Named opponent | Escrows opponent stake, activates wager, emits `WagerAccepted` |
| `acceptOpenWager(wagerId, signature)` | Any active member | Takes an open challenge with the code key's EIP-712 signature; escrows the matching stake, emits `WagerAccepted` |
| `declineWager(wagerId)` / `cancelOpen(wagerId)` | Opponent / creator | Refunds creator, closes the offer |
| `declareWinner(wagerId, winner)` | Authorized declarer (per resolution type) | Resolves the wager, emits `WagerResolved` |
| `declareDraw(wagerId)` / `revokeDraw(wagerId)` | Participants or arbitrator | Two-party consent (bitmask) settles a draw, emits `DrawProposed` → `WagerDrawn` |
| `autoResolveFromPolymarket(wagerId)` / `autoResolveFromOracle(wagerId)` | Anyone | Pulls the outcome from the wager's oracle adapter and resolves |
| `claimPayout(wagerId)` | Winner | Transfers the full pot once (`PayoutClaimed`) |
| `claimRefund(wagerId)` | Anyone (funds go to owners) | Refunds expired-Open or deadline-passed-Active wagers (`WagerRefunded`) |
| `batchExpireOpen(wagerIds[])` | Anyone | Bulk-expires stale open offers |

### Resolution types

The on-chain enum (mirrored canonically in
`frontend/src/constants/wagerDefaults.js`):

| # | Type | Settled by |
|---|------|-----------|
| 0 | `Either` | Either participant |
| 1 | `Creator` | Creator only |
| 2 | `Opponent` | Opponent only |
| 3 | `ThirdParty` | Arbitrator named at creation |
| 4 | `Polymarket` | Linked Polymarket CTF condition |
| 5 | `ChainlinkDataFeed` | Price feed vs. registered threshold |
| 6 | `ChainlinkFunctions` | Fulfilled Chainlink Functions request |
| 7 | `UMA` | Settled UMA OO-V3 assertion |

The enum is wire-stable and unchanged. The create UI labels `Creator` / `Opponent`
/ `ThirdParty` / `Polymarket` as **Me** / **Them** / **A Friend** / **An Oracle**,
and no longer offers `Either` (0) for new wagers — every new wager names a single
settler, which in an **Offer** (asymmetric odds) also carries the majority stake.
`Either` is retained on-chain so any pre-existing wagers still resolve.

For oracle types the creator records which side they take (`creatorIsYes`);
the registry maps the reported boolean outcome to a winner. Tied/invalid
oracle outcomes settle as a draw.

### Guards on every state change

- `SanctionsGuard.checkBlocked()` on the creator at create, and on both
  parties at accept.
- `MembershipManager.checkCanCreate()` before create; `recordCreate` /
  `recordClose` hooks keep concurrent-wager counts accurate.
- Guardian pause halts new activity; account freezes (`AccountFrozen`) block a
  specific address. Neither affects escrowed funds or refund paths.

### Open challenges (feature 024)

An **open challenge** is a wager posted with no named opponent, gated by a
four-word claim code. The code is generated client-side and never leaves the
browser; it derives (a) an on-chain `claimAuthority` address recorded at
creation and (b) a symmetric key that encrypts the terms. The same code does
triple duty for a taker: discover the wager (`openWagerIdForClaim(authority)`),
decrypt its terms, and sign an EIP-712 acceptance **bound to the taker's
address** (so a passive observer of the code cannot replay someone else's
signature). Mechanics:

- **`createOpenWager(...)`** — requires Silver+ membership; stakes are equal by
  construction (`creatorStake == opponentStake == stake`); resolution type may
  be `Either`, `ThirdParty`, or an oracle (single-party `Creator`/`Opponent`
  self-resolution is disallowed because the opponent is unknown at creation).
- **`acceptOpenWager(wagerId, signature)`** — any active membership tier may
  take it; the taker must first **approve their stake to the registry**, then
  accept (it escrows the matching stake via `transferFrom`). Decline is blocked
  — only the creator can withdraw an un-taken challenge.
- Views: `openWagerIdForClaim(authority)` (0 = no live challenge) and
  `isOpenChallenge(wagerId)`.

## MembershipManager (`contracts/access/MembershipManager.sol`)

Time-bound, USDC-priced membership tiers that gate wager participation. A
**UUPS upgradeable proxy** (spec 027) inheriting `UUPSManaged`; voucher
redemption (spec 026) shipped as its first in-place upgrade.

- **Tiers**: `None`, `Bronze`, `Silver`, `Gold`, `Platinum` — each with a
  monthly creation allowance and a max-concurrent-wagers cap.
- `purchaseTier()` / `purchaseTierWithTerms()` (records the accepted-terms
  hash on-chain), `upgradeTier()`, `extendMembership()`.
- `redeemVoucher(voucherId, acceptedTermsHash)` — burns a `MembershipVoucher`
  and writes the soulbound `(role, tier)` membership it carries (screens the
  redeemer); `setVoucher(address)` wires the voucher contract (admin).
- `checkCanCreate(user, role)` view + `recordCreate` / `recordClose` hooks
  called by `WagerRegistry`.
- `grantMembership()` / `revokeMembership()` for `ROLE_MANAGER_ROLE`.
- Fees flow to the treasury address fixed at deployment.

## MembershipVoucher (`contracts/access/MembershipVoucher.sol`)

A transferable **ERC-721 bearer claim** on a `(role, tier)` membership
(spec 026) — the giftable/resellable on-ramp to membership.

- `mint(role, tier)` — pays that tier's USDC price to the treasury and mints a
  voucher (the minter is **not** sanctions-screened — screening happens at
  redemption). It confers **no** membership while held.
- Held, gifted, or resold as a standard ERC-721; redeemed via
  `MembershipManager.redeemVoucher`, which burns it and grants a soulbound
  membership.
- **Immutable by design** (not upgradeable): a tradable bearer asset's rules
  must not change after purchase. Carries a best-effort EIP-2981 royalty
  (default 2.5%, 5% hard cap); the mutable redemption logic lives in the
  upgradeable `MembershipManager`.

## SanctionsGuard (`contracts/access/SanctionsGuard.sol`)

Non-bypassable compliance screening.

- `checkBlocked(account)` — reverts with `SanctionedAddress` if the account is
  on the operator deny list **or** flagged by the wired sanctions oracle.
- On Polygon mainnet the oracle is Chainalysis's on-chain sanctions list
  (`0x40C57923924B5c5c5455c48D93317139ADDaC8fb`); testnets use a mock.
- `setDenied()` (`SANCTIONS_ADMIN_ROLE`) and `setSanctionsOracle()`
  (`DEFAULT_ADMIN_ROLE`) are the only mutators.

## KeyRegistry (`contracts/privacy/KeyRegistry.sol`)

On-chain directory of encryption public keys powering private wager terms.

- `registerKey(bytes publicKey)` — 32–2048 bytes; supports X25519 and X-Wing
  post-quantum hybrid keys ([ADR-003](../adr/003-xwing-post-quantum-encryption.md)).
- `registerKeyWithEligibility(publicKey, termsRef)` — also emits a dated
  eligibility attestation.
- `getPublicKey(user)` / `hasKey(user)` — used by the frontend to encrypt
  wager envelopes for counterparties and arbitrators. See
  [Encryption Architecture](encryption-architecture.md).

## Oracle adapters (`contracts/oracles/`)

All adapters implement `IOracleAdapter`:

```solidity
function isConditionResolved(bytes32 conditionId) external view returns (bool);
function getOutcome(bytes32 conditionId)
    external view returns (bool outcome, uint256 confidence, uint256 resolvedAt);
```

| Adapter | Source | Condition registration |
|---------|--------|------------------------|
| `PolymarketOracleAdapter` | Polymarket CTF payouts | Links an existing Polymarket condition ID; caches resolutions |
| `ChainlinkDataFeedOracleAdapter` | Chainlink price feed | `registerCondition(feed, threshold, op, deadline)` with GT/GTE/LT/LTE/EQ comparisons |
| `ChainlinkFunctionsOracleAdapter` | Chainlink Functions DON | `registerCondition(encodedRequest, sourceHash, subscriptionId, gasLimit, donId)`; fulfills via `FunctionsClient` callback |
| `UMAOptimisticOracleV3Adapter` | UMA Optimistic Oracle V3 | `registerCondition(claim, bondCurrency, bondAmount, liveness)`; settles via `assertionResolvedCallback` |

```mermaid
sequenceDiagram
    participant Any as Anyone
    participant WR as WagerRegistry
    participant AD as Oracle adapter
    participant SRC as External source

    Note over SRC: underlying event resolves<br/>(market settles / price crosses /<br/>assertion passes liveness)
    Any->>WR: autoResolveFromOracle(wagerId)
    WR->>AD: isConditionResolved(conditionId)?
    AD->>SRC: read settled outcome
    AD-->>WR: (outcome, confidence, resolvedAt)
    WR->>WR: map outcome → winner via creatorIsYes
    WR-->>Any: WagerResolved
```

## Deployed addresses

`deployments/*-v2.json` is the source of truth. For the UUPS contracts the
table lists the **proxy** address (the stable address you integrate against);
each record also stores the current implementation under `…Impl`.

**Feature-complete networks** (UUPS registry + UUPS membership + voucher +
open challenges): Polygon Amoy (80002) and Mordor / Ethereum Classic (63).
Polygon mainnet (137) is still the **pre-UUPS** set (plain contracts, no
voucher) pending the upgradeable migration.

=== "Polygon Amoy (80002) — feature-complete"

    | Contract | Address |
    |----------|---------|
    | WagerRegistry (proxy) | `0xA429CdaD3E1497e33BEA7D6FE7d6913fE880241b` |
    | MembershipManager (proxy) | `0x89158f2E044C73c687dA12B7FA42b94F9A6D8465` |
    | MembershipVoucher | `0x33C8Ccacf6442Cf4238f01419e38C781cB859769` |
    | SanctionsGuard | `0xdF41355dD5E47FCA4eE2F2205af4C70Dab8C13B3` |
    | KeyRegistry | `0xcEFdeBba8E040c035c690ca9057cF22E73247c24` |
    | PolymarketOracleAdapter | `0x98fe63209f5BffcCe905bF8779a1F06576A2C313` |
    | ChainlinkDataFeedOracleAdapter | `0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23` |
    | ChainlinkFunctionsOracleAdapter | `0x074fC18C1E322a7537b53B8B2Bf0762629E3b532` |
    | UMAOptimisticOracleV3Adapter | `0xcEa9b4A01CcD3aA6545ea834a268C69e7eEfee88` |
    | Stake token (test USDC) | `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582` |

=== "Mordor / ETC (63) — feature-complete, core-only"

    Core-only: no oracle adapters are deployed on Ethereum Classic (Spec 015).

    | Contract | Address |
    |----------|---------|
    | WagerRegistry (proxy) | `0x3ccB144d8aa838e8d4D695867cC72e548117830C` |
    | MembershipManager (proxy) | `0x68bCBA1055DAbe11b98Bb8425A16e648Ad65d541` |
    | MembershipVoucher | `0xf514e0e342A898E4681bf51590B672aEC5620401` |
    | SanctionsGuard | `0xdF41355dD5E47FCA4eE2F2205af4C70Dab8C13B3` |
    | KeyRegistry | `0xcEFdeBba8E040c035c690ca9057cF22E73247c24` |
    | Stake token (Classic USD) | `0xDE093684c796204224BC081f937aa059D903c52a` |

=== "Polygon Mainnet (137) — pre-UUPS"

    Plain (non-proxy) contracts, no voucher; UUPS migration pending.

    | Contract | Address |
    |----------|---------|
    | WagerRegistry | `0x5023765809fDA93ab9F11B684fdb76521eD31774` |
    | MembershipManager | `0x00c3ef4e02Ef00Ad6eE955dF5022A22F6ea73dae` |
    | SanctionsGuard | `0x2Dc53d91A189be71DfE96Ea9BCFCF6aDDA77BC76` |
    | KeyRegistry | `0xcEFdeBba8E040c035c690ca9057cF22E73247c24` |
    | PolymarketOracleAdapter | `0x83688e9b8D4f085E3eF4619D91e0e6303cFcf0A4` |
    | ChainlinkDataFeedOracleAdapter | `0x7ae8220Dc02D0504EDCBa2C1B1AbA579AA3F0f23` |
    | ChainlinkFunctionsOracleAdapter | `0x148C2E347a601AC1a680b17321529b0Ffc31AeFc` |
    | UMAOptimisticOracleV3Adapter | `0x8224433d099Af6cd30540A78421aBFd6e044E949` |
    | Stake token (USDC) | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` |

The original v2 deploy used the Safe Singleton Factory with salt prefix
`FairWins-P2P-v2.0-` for deterministic cross-chain addresses — see
[Singleton Deployment Patterns](singleton-deployment-patterns.md). The
upgradeable contracts now ship as proxies; logic changes go out as in-place
upgrades, never a redeploy (see the
[contract-upgrade runbook](../runbooks/contract-upgrades.md)). After any
deploy or upgrade, run `npm run sync:frontend-contracts` to regenerate
`frontend/src/config/contracts.js`.

## Development workflow

```bash
npm run compile        # compile the suite
npm test               # unit + integration tests
npm run test:fork      # fork tests against live networks
npm run test:coverage  # coverage report
```

Contract changes must follow checks-effects-interactions, pass Slither and
Medusa, and receive a security review — see
[Security Testing](../security/index.md) and the binding standards in
`.specify/memory/constitution.md`.
