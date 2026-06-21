# API Reference

Practical guide to interacting with the FairWins contracts from JavaScript
(ethers.js v6). Every interaction is an on-chain transaction or view call —
there is no HTTP API and no backend.

For exact signatures see [Contract Interfaces](contracts.md); for addresses
see the [Smart Contracts guide](../developer-guide/smart-contracts.md#deployed-addresses).

## Setup

ABIs are produced by `npx hardhat compile` under `artifacts/contracts/`
(the frontend keeps trimmed copies in `frontend/src/abis/`).

```javascript
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const registry = new ethers.Contract(WAGER_REGISTRY_ADDRESS, WagerRegistryABI, signer);
const membership = new ethers.Contract(MEMBERSHIP_MANAGER_ADDRESS, MembershipManagerABI, signer);
const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
```

USDC has **6 decimals** — use `ethers.parseUnits("10", 6)` for a 10 USDC stake.

## Membership

Creating or accepting wagers requires an active `WAGER_PARTICIPANT_ROLE`
membership.

```javascript
const ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));

// Check status: tier 0 = None, 1 = Bronze … 4 = Platinum
const m = await membership.getMembership(userAddress, ROLE);
const isActive = m.tier > 0 && m.expiresAt > Math.floor(Date.now() / 1000);

// Purchase (USDC approval first). Tier prices come from getTierConfig.
const cfg = await membership.getTierConfig(ROLE, 1 /* Bronze */);
await (await usdc.approve(MEMBERSHIP_MANAGER_ADDRESS, cfg.priceUSDC)).wait();
await (await membership.purchaseTierWithTerms(ROLE, 1, acceptedTermsHash)).wait();
```

`Membership.activeCount` and `monthCount` track your concurrent and monthly
usage against the tier's `Limits` — `createWager` reverts once either limit
is hit.

### Membership vouchers (feature 026)

A `MembershipVoucher` is a transferable ERC-721 bearer claim — buy it with
USDC, then hold, gift, or resell it. It confers **no** membership until it is
**redeemed** (which burns it and writes a soulbound membership to the
redeemer). Mint is on the voucher contract; redeem is on the manager.

```javascript
const voucher = new ethers.Contract(MEMBERSHIP_VOUCHER_ADDRESS, MembershipVoucherABI, signer);

// Buy a voucher for a tier (USDC approval to the voucher contract first).
const cfg = await membership.getTierConfig(ROLE, 2 /* Silver */);
await (await usdc.approve(MEMBERSHIP_VOUCHER_ADDRESS, cfg.priceUSDC)).wait();
const mintTx = await voucher.mint(ROLE, 2);
const mintRc = await mintTx.wait();
const tokenId = mintRc.logs
    .map(l => { try { return voucher.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === "VoucherMinted").args.id;

// Gift / resell: it's a standard ERC-721.
await voucher.transferFrom(myAddress, recipientAddress, tokenId);

// Redeem (the holder): burns the voucher, grants the (role, tier) it carries.
await (await membership.redeemVoucher(tokenId, acceptedTermsHash)).wait();
```

Redemption screens the redeemer through `SanctionsGuard` (the minter is not
screened — screening happens at redeem time). `MembershipVoucher` is immutable
and carries a best-effort EIP-2981 royalty (default 2.5%, 5% cap).

## Creating a wager

```javascript
const stake = ethers.parseUnits("10", 6);
const now = Math.floor(Date.now() / 1000);

// 1. Approve the registry for your stake
await (await usdc.approve(WAGER_REGISTRY_ADDRESS, stake)).wait();

// 2. Create — your stake moves into escrow
const tx = await registry.createWager(
    opponentAddress,            // who can accept
    ethers.ZeroAddress,         // arbitrator (required for ThirdParty type)
    USDC_ADDRESS,               // stake token (must pass isAllowedToken)
    stake,                      // creatorStake
    stake,                      // opponentStake (differs for Offer odds)
    now + 6 * 3600,             // acceptDeadline  (≤ 30 days out)
    now + 86400 + 48 * 3600,    // resolveDeadline (≤ 180 days out)
    1,                          // ResolutionType.Creator ("Me" — UI no longer offers Either)
    ethers.ZeroHash,            // oracle conditionId (oracle types only)
    true,                       // creatorIsYes (oracle types only)
    metadataHash,               // keccak256 of the terms
    "ipfs://<cid>"              // terms location (optionally encrypted)
);
const receipt = await tx.wait();

// wagerId from the WagerCreated event
const event = receipt.logs
    .map(l => { try { return registry.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === "WagerCreated");
const wagerId = event.args.wagerId;
```

`ResolutionType`: `0` Either, `1` Creator, `2` Opponent, `3` ThirdParty,
`4` Polymarket, `5` ChainlinkDataFeed, `6` ChainlinkFunctions, `7` UMA.

For oracle types, pass the registered condition ID and which side you're
taking (`creatorIsYes`). For `ThirdParty`, pass a non-zero `arbitrator`.
`createWagerWithTerms(...)` additionally binds the accepted terms-version
hash on-chain.

## Open challenges (feature 024)

An open challenge is a wager posted with **no named opponent**, gated by a
four-word claim code. The code derives an off-chain key whose address is the
on-chain `claimAuthority`; the same code discovers the wager, decrypts its
terms, and signs acceptance. **Silver+** membership is required to create one;
**any active tier** may take it. Stakes are equal by construction.

```javascript
// Create — derive claimAuthority from the code off-chain, then post.
// (See frontend/src/utils/claimCode/ for code generation + key derivation.)
await (await usdc.approve(WAGER_REGISTRY_ADDRESS, stake)).wait();
const tx = await registry.createOpenWager(
    claimAuthority,             // address derived from the four-word code
    ethers.ZeroAddress,         // arbitrator (required for ThirdParty)
    USDC_ADDRESS, stake,
    now + 48 * 3600,            // acceptDeadline
    now + 9 * 86400,            // resolveDeadline
    0,                          // ResolutionType.Either (or ThirdParty/oracle)
    ethers.ZeroHash, true,
    metadataHash, "ipfs://<cid>"
);
// wagerId from the OpenWagerCreated event.

// Take — look the wager up by the code's authority, then accept with an
// EIP-712 signature from the code key BOUND TO THE TAKER (not replayable).
const wagerId = await registry.openWagerIdForClaim(claimAuthority); // 0 = no match
const w = await registry.getWager(wagerId);
await (await usdc.approve(WAGER_REGISTRY_ADDRESS, w.opponentStake)).wait();
await (await registry.acceptOpenWager(wagerId, signature)).wait();
```

The taker MUST approve their stake before `acceptOpenWager` — it escrows the
matching stake via `transferFrom`, so an un-approved call reverts with
`ERC20: transfer amount exceeds allowance`. `isOpenChallenge(wagerId)`
distinguishes an open challenge from a named-opponent wager.

## Accepting, declining, cancelling

```javascript
// Opponent: approve their stake, then accept (wager goes Open → Active)
await (await usdc.approve(WAGER_REGISTRY_ADDRESS, opponentStake)).wait();
await (await registry.acceptWager(wagerId)).wait();

// Opponent can reject (creator refunded immediately)
await registry.declineWager(wagerId);

// Creator can withdraw an un-accepted offer
await registry.cancelOpen(wagerId);

// Anyone can sweep stale open offers past their acceptDeadline
await registry.batchExpireOpen([id1, id2, id3]);
```

Both `createWager` and `acceptWager` screen the participants through
`SanctionsGuard` — a `SanctionedAddress` revert means the address is
deny-listed or flagged by the Chainalysis oracle.

## Resolving

```javascript
// Participant / arbitrator resolution (per the wager's ResolutionType)
await registry.declareWinner(wagerId, winnerAddress);

// Draw: first call records consent, the matching call from the other
// party settles it and returns each side's own stake
await registry.declareDraw(wagerId);
await registry.revokeDraw(wagerId);              // back out before the other consents
const { creatorAgreed, opponentAgreed } = await registry.drawConsent(wagerId);

// Oracle settlement — permissionless once the source has resolved
await registry.autoResolveFromPolymarket(wagerId);  // ResolutionType.Polymarket
await registry.autoResolveFromOracle(wagerId);      // Chainlink / UMA types
```

## Claiming and refunds

```javascript
// Winner pulls the full pot (once)
await registry.claimPayout(wagerId);

// Refunds — Open past acceptDeadline refunds the creator;
// Active past resolveDeadline refunds both sides
await registry.claimRefund(wagerId);
```

## Reading wagers

```javascript
const w = await registry.getWager(wagerId);
// w.status: 0 None, 1 Open, 2 Active, 3 Resolved, 4 Cancelled, 5 Refunded, 6 Draw
// w.creator / w.opponent / w.arbitrator / w.winner
// w.creatorStake / w.opponentStake (uint128, token decimals)
// w.acceptDeadline / w.resolveDeadline (unix seconds)
// w.metadataHash / w.metadataUri  — terms hash + IPFS pointer

// Paginated per-user queries
const count = await registry.getUserWagerCount(user);
const ids = await registry.getUserWagerIds(user, 0, 50);
const wagers = await registry.getUserWagers(user, 0, 50);
```

## Listening to events

```javascript
registry.on(registry.filters.WagerCreated(null, creatorAddress), (id, creator, opponent) => {
    console.log(`wager ${id}: ${creator} vs ${opponent}`);
});
```

Lifecycle events, in order of a typical happy path:
`WagerCreated` (or `OpenWagerCreated` for open challenges) → `WagerAccepted` →
`WagerResolved` → `PayoutClaimed`. Other exits: `WagerCancelled`,
`WagerDeclined`, `WagerRefunded`, `DrawProposed`/`DrawRevoked`/`WagerDrawn`.
Oracle links emit `PolymarketLinked` / `OracleConditionLinked` at creation.
Membership emits `VoucherSet` / `MembershipRedeemed` (vouchers) and
`MembershipRevoked`; the voucher contract emits `VoucherMinted`. Moderation
emits `AccountFrozen` / `AccountUnfrozen`.

## Encryption keys

For end-to-end encrypted terms, participants publish keys in `KeyRegistry`:

```javascript
const keyRegistry = new ethers.Contract(KEY_REGISTRY_ADDRESS, KeyRegistryABI, signer);

if (!(await keyRegistry.hasKey(opponentAddress))) {
    // opponent must registerKey() before you can encrypt a wager for them
}
await keyRegistry.registerKey(publicKeyBytes);            // 32–2048 bytes
const pk = await keyRegistry.getPublicKey(opponentAddress);
```

The envelope format (X-Wing hybrid KEM + ChaCha20-Poly1305) is specified in
the [Envelope Encryption Spec](../developer-guide/envelope-encryption-spec.md).

## Common errors

| Revert | Cause |
|--------|-------|
| `SanctionedAddress(account)` | Address deny-listed or flagged by the sanctions oracle |
| Membership-related revert on create | No active tier, or monthly/concurrent limit reached |
| ERC-20 `transferFrom` failure | Missing/insufficient USDC approval or balance |
| `acceptWager` revert | Wrong address (named opponent only), deadline passed, or not `Open` |
| `acceptOpenWager` revert | Bad/old claim signature, not an open challenge, expired, or you're the creator/arbitrator |
| `transfer amount exceeds allowance` on accept | Approve your stake to the registry before `acceptWager`/`acceptOpenWager` |
| `declareWinner` revert | Caller not authorized for the wager's resolution type, or wager not `Active` |
| `claimPayout` revert | Caller is not the winner, or already paid |
| `claimRefund` revert | Relevant deadline hasn't passed yet |
| Frozen-account revert | Address frozen by an Account Moderator (`isFrozen(user)`) |
