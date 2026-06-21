# Phase 0 Research: Membership Vouchers

All decisions below resolve the spec's locked clarifications into concrete, constitution-aligned mechanics.
Format: **Decision / Rationale / Alternatives considered.**

## D1 — Voucher contract is immutable (not upgradeable)

- **Decision**: `MembershipVoucher` is a plain, non-upgradeable contract. Only the **membership authority**
  (`MembershipManager`) is upgradeable.
- **Rationale**: A voucher is a tradable **bearer instrument**; immutability guarantees a buyer that the
  redemption rules cannot be changed out from under them after purchase — a trust property that matters for a
  resold asset and reinforces the "utility, honest" framing. It also presents the smallest possible upgrade
  attack surface on a contract that takes USDC. All the logic that legitimately evolves (sanctions screening,
  Terms, the grant) lives in the upgradeable `MembershipManager`, so we lose nothing by freezing the token.
- **Alternatives**: *Upgradeable voucher via `UUPSManaged`* (rejected — lets the issuer mutate a sold bearer
  asset's rules; larger surface; no concrete need). *Voucher state inside MembershipManager* (rejected — an
  ERC-721 must be its own contract for marketplace composability).

## D2 — Redeem-to-self in v1; relayer/recipient deferred but not precluded

- **Decision**: `redeemVoucher` grants the membership to `msg.sender` (who must own the voucher). Privacy comes
  from **redeeming from a fresh wallet** that received the voucher by transfer. No `to`/recipient parameter in
  v1. The function stores **no back-reference** to the voucher's purchase/transfer history (FR-018).
- **Rationale**: Screening and Terms must bind to the address that receives standing; making that `msg.sender`
  keeps both trivially correct and matches the existing direct-purchase semantics (`_screen`/`_recordTerms` are
  `msg.sender`-keyed). The fresh-wallet pattern already delivers the pseudonymity the spec promises (FR-017).
- **Alternatives**: *Recipient param now* (rejected for v1 — screening/Terms for a non-caller recipient needs an
  EIP-712 consent signature from that recipient, expanding surface; deferred). *ERC-2771 meta-tx / paymaster*
  (deferred per FR-019; the redeem interface is kept compatible so it can be added later without redesign —
  no stored caller assumptions beyond `msg.sender` ownership/standing).

## D3 — Mint payment: read config from manager, pay treasury, recognize at mint

- **Decision**: `mint(role, tier)` reads the price from `MembershipManager.getTierConfig(role, tier).priceUSDC`
  and the recipient from `MembershipManager.treasury()`, pulls that USDC from the minter via
  `SafeERC20.safeTransferFrom`, and sends it to the treasury **at mint** (recognized immediately, no escrow —
  clarification round 1). Mint requires the tier to be **active** with a non-zero price (FR-001).
- **Rationale**: Single source of truth for pricing/treasury (the manager's tier config), no price duplication
  or drift, and the same net economic basis as a direct purchase (FR-004). Recognizing at mint is safe because
  granting a membership later has zero marginal on-chain cost, so no escrow/solvency reserve is needed.
- **Alternatives**: *Route through `MembershipManager.accruedFees` + `withdrawFees`* (rejected — adds a
  cross-contract authorized-accrual call and coupling for no economic difference). *Escrow until redemption*
  (rejected by clarification). *Voucher stores its own price* (rejected — duplicates config, invites drift).

## D4 — Burn authority & redeem flow (manager-driven, CEI)

- **Decision**: The user calls `MembershipManager.redeemVoucher(voucherId, acceptedTermsHash)`. The manager:
  (1) checks `IMembershipVoucher(voucher).ownerOf(voucherId) == msg.sender`; (2) reads
  `VoucherInfo{role, tier, durationDays}`; (3) checks the redeemer has no active membership for `role` (else
  revert, FR-011); (4) `_screen(msg.sender)` fail-closed (FR-012); (5) **burns** the voucher via
  `IMembershipVoucher(voucher).burn(voucherId)`; (6) writes the soulbound membership and records Terms;
  (7) emits `MembershipRedeemed`. The voucher's `burn` is callable **only** by the configured manager.
- **Rationale**: Centralizes the grant in the authority contract (least privilege — the voucher gets no role),
  keeps the flow atomic/single-use, and follows checks-effects-interactions (all checks/screen before the burn
  and membership write; no external calls after effects). `nonReentrant` guards the path defensively.
- **Alternatives**: *Voucher calls into manager to grant* (rejected — would require giving the voucher a
  granting role, violating FR-025). *Two-step (burn then separate claim)* (rejected — not atomic, worse UX).

## D5 — On-chain `tokenURI` (Base64 JSON + SVG)

- **Decision**: `tokenURI` returns a `data:application/json;base64,...` document built fully on-chain (OZ
  `Base64` + `Strings`), embedding a small deterministic SVG that renders the voucher's tier and role label.
- **Rationale**: Self-contained, censorship-resistant, no IPFS pinning/availability dependency for a
  value-bearing token (clarification round 2), and aligns with Principle III (no external shortcuts). IPFS in
  this repo is reserved for *encrypted* per-wager payloads — a poor fit for public marketplace art.
- **Alternatives**: *Off-chain IPFS URI* (rejected — availability dependency, drift risk). *Hybrid on-chain
  JSON + static image* (rejected — still an external image dependency for marginal art quality).

## D6 — Royalty via ERC-2981 (2.5% default, 5% hard ceiling)

- **Decision**: `MembershipVoucher` implements ERC-2981 with a default `royaltyFraction = 250` bps (2.5%) and
  `receiver = treasury`. An admin setter may change the rate but **reverts above 500 bps (5%)**. No enforced
  royalties, no operator allowlist, no platform marketplace (FR-021/FR-021a).
- **Rationale**: Best-effort hint preserves open-market composability and privacy; the conservative flat rate
  and hard ceiling keep the utility framing defensible (clarifications).
- **Alternatives**: *ERC-721C / allowlisted operators* (rejected — re-centralizes and de-privatizes resale).
  *No royalty* (rejected by clarification — modest recapture is wanted).

## D7 — Voucher snapshots `{role, tier, durationDays}` at mint

- **Decision**: Each token stores `VoucherInfo{ bytes32 role, uint8 tier, uint32 durationDays }`, with
  `durationDays` **snapshotted from the tier config at mint**. Redemption sets
  `expiresAt = block.timestamp + durationDays * 1 days`. Redemption does **not** re-check tier active state or
  price (FR-009). Usage **limits** are *not* snapshotted — they are read live from current tier config at
  use-time (`checkCanCreate`), exactly as for a directly purchased membership.
- **Rationale**: Snapshotting duration makes the voucher a complete, self-describing bearer claim and avoids the
  footgun where a later tier-config change (e.g., duration set to 0 / tier deactivated) would strand or
  instantly-expire a redeemed membership. Limits remaining live matches existing membership behavior (limits are
  a per-tier property shared by all holders) and keeps FR-008 parity.
- **Alternatives**: *Read duration live at redemption* (rejected — config-drift footgun, violates the bearer
  guarantee). *Snapshot limits too* (rejected — would diverge from how direct memberships enforce limits,
  breaking FR-008 parity).

## D8 — Reject redemption when the redeemer already has an active membership

- **Decision**: `redeemVoucher` reverts if `hasActiveRole(msg.sender, role)` is true; the voucher is left intact
  (FR-011/FR-015). No stacking or extension in v1.
- **Rationale**: Mirrors the existing direct-purchase `AlreadyActive` guard; the redeem-to-fresh-wallet pattern
  is the intended escape hatch and also serves privacy.
- **Alternatives**: *Extend/stack onto the active membership* (rejected — out of scope; ambiguous economics).

## D9 — Membership append-only storage change

- **Decision**: The membership upgrade appends exactly one config slot — `address public voucher;` — after all
  existing state, drawing from the `__gap` introduced by the sibling migration. A `setVoucher(address)`
  (`DEFAULT_ADMIN_ROLE`) wires it. No existing slot is reordered/removed/retyped.
- **Rationale**: Minimal, append-only, validated by `check:storage-layout` (OZ `validateUpgrade`) before any
  upgrade applies. Matches 025's append-only discipline.
- **Alternatives**: *New mapping for redemption bookkeeping* (rejected — unnecessary; the burn + membership
  write are the only state effects; redemption needs no extra ledger).

## D10 — No new fund custody beyond mint; no new screening point

- **Decision**: USDC moves only at **mint** (minter → treasury). Redemption moves **no** funds. Screening
  occurs only at **redemption on the redeemer** (FR-012/FR-014); minting and transfers are **not** screened.
- **Rationale**: Keeps the control point identical to the existing model and matches the recorded compliance
  tradeoff (a sanctioned party may profit from resale without redeeming — FR-014).
- **Alternatives**: *Screen at mint/transfer* (rejected by clarification).

## D11 — Subgraph & frontend integration

- **Decision**: Subgraph adds a `Voucher` entity (`status: Held | Redeemed`) and indexes `VoucherMinted`,
  ERC-721 `Transfer`, and `MembershipRedeemed`. Frontend adds mint (choose role+tier, approve+pay USDC), a
  gift/resell hint (standard transfer / marketplace), and a redeem flow (connect the redeeming wallet, accept
  Terms, screen, redeem-to-this-wallet) with an **honest privacy disclosure** banner and royalty display — all
  via `sync:frontend-contracts`.
- **Rationale**: Observability (FR-026) + honest UX (FR-020, Principle III/V).
- **Alternatives**: *No subgraph entity* (rejected — secondary-market/redemption visibility is required).

## D12 — Dependency on the sibling Upgradeable-MembershipManager migration

- **Decision**: 026 is authored as the **first append-only upgrade** of the upgradeable `MembershipManager`. The
  behavior-neutral migration onto `UUPSManaged` is a **separate prerequisite spec** that must land first; 026
  does not include it.
- **Rationale**: Respects the spec's out-of-scope boundary and keeps WagerRegistry-first/membership-second
  sequencing; avoids fusing two reviews. Surfaced as the one material sequencing risk.
- **Alternatives**: *Fold the migration into 026* (rejected — contradicts spec scope, bloats the PR/review).
  *Redeploy a fresh non-proxy MembershipManager with redeem built in* (rejected — abandons the proxy direction
  the project just adopted and would strand existing memberships, however short-lived).

## D13 — EthTrust / security tooling reuse

- **Decision**: Reuse the merged Slither config + Medusa + `check:storage-layout` (OZ `validateUpgrade`) CI
  steps; add the voucher and redeem contracts to their scope; target EthTrust-SL ≥ L2; security-agent review
  before merge.
- **Rationale**: The redeem path is access-control-adjacent and the mint path is fund-handling — both warrant
  the existing high-risk tooling with no new pipeline.
- **Alternatives**: none (constitution-mandated).
