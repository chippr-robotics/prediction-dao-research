# Earn Without Custody Surprises: Wrapping ERC-4626 Vaults With a Disclosed, Atomic Fee

*How FairWins routes lending deposits into external Morpho vaults, charges its platform fee in the same transaction, and shows the member the exact rate before they sign*

- **Series:** Finance Surfaces (part 2)
- **Part:** 23 of 34
- **Audience:** DeFi integrators; protocol and product engineers
- **Tags:** `erc4626`, `defi`, `lending`, `yield`, `fees`
- **Reading time:** ~8 minutes

---

## The idle-balance problem, and the two bad answers

FairWins members hold stablecoins in their connected accounts between wagers. Between the moment a payout lands and the moment the next wager is created, that USDC sits idle. Members asked the obvious question — can it earn something in the meantime? — and the team faced the two answers most consumer crypto apps reach for.

The first bad answer is custody: run your own yield product, pool member deposits, and manage the strategy in-house. That turns a wager-escrow platform into an asset manager, with everything that implies — a new value-bearing contract surface, discretionary control over member funds, and a trust model the rest of the platform deliberately avoids.

The second bad answer is the hidden spread: route deposits into someone else's protocol, quietly keep a slice of the yield or the principal, and let the member discover the difference in their statement. Plenty of "earn" features work this way. It's also exactly the kind of quiet skim that FairWins' constitution forbids — every fee on the platform is disclosed before signature, or it doesn't exist.

The Earn section (spec `050-earn-lending-rewards`) is the answer that avoids both: deposits go **directly from the member's account into third-party ERC-4626 vaults** — curated Morpho lending vaults on Ethereum mainnet and Polygon PoS — with FairWins never taking custody, and the platform fee, when one is configured, charged **atomically in the same transaction** by an on-chain router that refuses to charge more than the rate the member was shown. This post walks through both layers: the non-custodial vault integration, and the fee wrapper that monetizes it honestly.

## Layer one: direct ERC-4626 deposits, no FairWins contracts

[ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) is the tokenized-vault standard: `deposit(assets, receiver)` mints shares, `convertToAssets(shares)` values a position, `maxDeposit`/`maxWithdraw` report honest limits, `withdraw`/`redeem` exit. Because Morpho's Vault V1 (MetaMorpho) implements the full surface, the base Earn integration shipped as a **frontend-only** feature — no FairWins contracts, no backend. The client discovers vaults through Morpho's public GraphQL API (`listed: true`, the same curation the Morpho app itself uses), reads positions authoritatively on-chain, and claims protocol rewards through Merkl's distributor.

One curation detail matters for anyone wrapping vaults: only Morpho **Vault V1** is surfaced. Vault V2 returns `0` from `maxDeposit`/`maxWithdraw` by design, which makes honest limit display impossible — and honest limits are load-bearing in this UI, not decoration.

The write path (`frontend/src/lib/earn/vaultActions.js`) applies safety rails before any wallet prompt:

- pure validators reject zero, over-balance, and over-cap amounts with member-facing reasons;
- approvals are for the **exact amount** — no unlimited allowances;
- spendable deposits are dry-run with `staticCall` from the member's address, so vault-side rejections (cap reached, paused) surface before anything is signed;
- withdrawals are bounded by `maxWithdraw`, and full exits use `redeem(shares)` so share dust never strands.

Writes are expressed as `{ target, data, value }` batches through the app's unified `sendCalls` rail: a passkey smart account authorizes the whole approve-plus-deposit batch with one WebAuthn ceremony via a UserOp; a classic wallet signs the legs sequentially. Custody never changes hands — the vault's `deposit` names the member as `receiver`, and shares sit in the member's own account.

Notably, spec 050 shipped with **no platform fee at all**. Morpho has no referral or transaction-source fee parameter (nothing like Aave's referral code), so there was no way to monetize attribution natively — and rather than bolt on a rushed fee mechanism, FR-013 made fee-free operation an explicit, documented decision, with treasury revenue deferred to a future spec.

## Layer two: the FeeRouter, and why the fee is a contract concern

That future spec is `060-platform-fee-wrapper`, and its core decision is that a platform fee on someone else's protocol must be **atomic** — fee and deposit in one transaction, or neither. The naive alternative, two transfers ("send us the fee, then deposit the rest"), can strand a member mid-flow: fee paid, deposit failed, treasury holding money for a service that never happened.

The `FeeRouter` (`contracts/fees/FeeRouter.sol`, a UUPS proxy) is the single on-chain source of truth for every configurable platform fee. Each fee is a `bytes32 serviceId = keccak256("<label>")` — Earn's is `earn.lend` — with a `Service { capBps, feeBps, kind }` entry. `Wrapped` services are charged by the router itself; `ConfigOnly` entries (the Polymarket builder rates) just store rates that off-chain enforcers read. Wrapped caps are fixed at registration and bounded by `MAX_WRAPPED_FEE_BPS = 250` (2.5%); `earn.lend` registers at that cap with a live rate of **zero** until a `FEE_ADMIN_ROLE` holder deliberately sets one.

The member-facing entrypoint is the wrapper deposit:

```solidity
function depositToVaultWithFee(
    bytes32 serviceId,
    address vault,
    uint256 assets,
    address receiver,
    uint16 maxFeeBps
) external nonReentrant returns (uint256 shares) {
    // ...service lookup and zero checks elided...
    uint16 liveBps = svc.feeBps;
    if (liveBps > svc.capBps) revert CapExceeded(); // defense in depth
    if (liveBps > maxFeeBps) revert FeeAboveQuoted();
    // ...fee math elided...
    asset.safeTransferFrom(msg.sender, address(this), assets);
    // ...fee transfer + FeeCharged event elided...
    uint256 netAmount = assets - feeAmount;
    asset.forceApprove(vault, netAmount);
    shares = IERC4626(vault).deposit(netAmount, receiver);
    if (shares == 0) revert ZeroShares();
    asset.forceApprove(vault, 0);
}
```

One call pulls the member's gross principal, sends `floor(assets · bps / 10 000)` to the treasury, and deposits the remainder into the ERC-4626 vault with the member as `receiver`. Any failing leg reverts everything — the treasury can never keep a fee for a deposit that did not happen. The router holds no balance outside a transaction.

Three details in that function carry most of the design's weight:

**`maxFeeBps` is a consent ceiling.** The frontend passes back the exact rate it displayed. If an admin raises `feeBps` while the member's transaction is in flight, the call reverts with `FeeAboveQuoted()` instead of charging the higher rate. A member can never pay more than the number they saw on the confirm screen — enforced by the contract, not by UI politeness.

**A missing treasury skips the fee, never loses funds.** If `treasury` is `address(0)` on some network, the router deposits the full amount and emits `FeeSkippedNoTreasury`. An ops misconfiguration costs FairWins revenue; it never strands a member's principal.

**Zero shares reverts.** The router pulled principal and possibly took a fee; if the vault would mint nothing in return, `ZeroShares()` unwinds the whole action rather than breaking the fee-for-value guarantee.

The math floors in the member's favor — a fee that rounds to zero in the asset's smallest unit is charged as zero — and fee-on-transfer or rebasing tokens are explicitly unsupported, which is fine for the curated vault assets (plain ERC-20s like USDC).

## The disclosure contract: three outcomes, no fourth

The client half lives in `frontend/src/lib/fees/feeQuote.js`. Before the deposit sheet ever shows a confirm button, `fetchFeeQuote({ serviceId, chainId, provider })` reads the live rate from the router and resolves to exactly one of three states:

1. **No router on this chain** (or the service isn't registered): `{ available: false, bps: 0 }`. The flow proceeds fee-free — and `buildDepositCalls` emits a batch **byte-identical** to the pre-fee behavior: approve the vault, `deposit(amount, account)`. No fee line appears, because implying a fee that isn't charged is as dishonest as hiding one that is.
2. **Live rate obtained**: the `VaultSheet` (`frontend/src/components/earn/VaultSheet.jsx`) renders a named "FairWins platform fee" line — rate as a percent, absolute amount, and the net amount reaching the vault — with an info bubble, before any signature. The deposit reroutes through the router: approve the **router** for the gross amount, then `depositToVaultWithFee(earn.lend, vault, amount, account, quotedBps)`, pinning the transaction to the disclosed rate.
3. **The read failed on a chain that has a router**: the quote throws, and the sheet **blocks deposits** with an honest "the platform fee rate could not be confirmed right now" message. Proceeding on a possibly understated rate is not an option; neither is silently assuming zero.

There is deliberately no fourth state. The quote helper mirrors the contract's `quoteFee` math exactly — including the treasury-unset skip, so the UI never displays a fee the router would not actually charge.

Every rate change is public history: `FeeBpsChanged(serviceId, oldBps, newBps, actor)` events are the audit log the AdminPanel Fees tab renders, and `FeeCharged` is the reconciliation record — its `feeAmount` equals the ERC-20 transfer to the treasury in the same transaction.

## Design decisions

**Entry-only fee, not a performance fee.** The router skims basis points of the principal at deposit time and touches nothing afterward. A performance or management fee would require FairWins to sit in the yield path — Morpho's documented "distributor revenue" pattern of a treasury-owned wrapper vault does exactly that, and was considered and deferred precisely because it is a new value-bearing contract that would custody member deposits. An entry fee keeps the router stateless between transactions and keeps positions purely member-owned.

**One router, not per-integration fee logic.** The next wrapped integration (Lido, Polygon liquid staking, Uniswap) registers a `serviceId` — config, not code. Anything ERC-4626-shaped reuses `depositToVaultWithFee` as-is; differently shaped actions add a purpose-built entrypoint to the same router with the same cap re-check, consent ceiling, and event discipline. The alternative — each feature inventing its own fee store — is how platforms end up with rates hardcoded in three clients and no audit trail.

**Caps are immovable.** A wrapped service's `capBps` is fixed at registration, bounded at 250 bps, and re-checked on the charge path (defense in depth against a corrupted rate). The emergency lever is `setFeeBps(id, 0)`, not cap surgery. Members and integrators get a hard, on-chain upper bound on what the fee can ever become.

**Honest failure over graceful degradation.** Most of the fee system's complexity is in refusing to guess: a failed rate read blocks the action rather than defaulting to zero; an unregistered service is fee-free rather than fee-unknown; a missing treasury skips rather than reverts. The rule generalizing all of it: the member either sees the true number or the action doesn't happen.

The honest limits of the design are worth naming too. The fee only wraps deposits — withdrawals go straight to the vault, so the router can't ransom an exit, but also can't meter one. And the yield itself remains entirely Morpho's: FairWins guarantees neither APY nor the third-party vault's smart-contract risk, and the Earn UI says so under a mandated "Powered by Morpho" attribution.

## Sources

- `specs/050-earn-lending-rewards/spec.md` — Earn section requirements, custody model, FR-013 fee decision
- `specs/060-platform-fee-wrapper/spec.md` — fee wrapper requirements, caps, disclosure rules
- `docs/developer-guide/earn-integration.md` — Earn architecture, vault curation, safety rails
- `docs/developer-guide/platform-fees.md` — FeeRouter architecture, disclosure rules, service registration
- `contracts/fees/FeeRouter.sol`, `contracts/fees/IFeeRouter.sol` — router implementation and interface
- `frontend/src/lib/earn/vaultActions.js` — deposit/withdraw batch construction, fee routing
- `frontend/src/lib/fees/feeQuote.js` — live-rate quoting and the three-outcome contract
- `frontend/src/components/earn/VaultSheet.jsx` — fee-line disclosure and blocked-state UI
- `scripts/deploy/lib/feeServices.js` — `earn.lend` registration (cap 250 bps, Wrapped)
- ERC-4626 Tokenized Vaults: https://eips.ethereum.org/EIPS/eip-4626
- OpenZeppelin ERC-4626 / SafeERC20 / UUPS docs: https://docs.openzeppelin.com/contracts
- Morpho distributor revenue concepts: https://docs.morpho.org/build/earn/concepts/generate-revenue/
