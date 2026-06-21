# Quickstart: Membership Vouchers — validation guide

End-to-end scenarios proving the feature works. Run on local (1337) or Amoy (80002). This is a validation/run
guide; implementation lives in `tasks.md` and the contracts.

## Prerequisites

- **Sibling migration deployed first**: `MembershipManager` must already be behind its UUPS proxy (the
  "Upgradeable MembershipManager" spec). Confirm `deployments/<net>.json` lists a membership **proxy** address.
- `MembershipVoucher` deployed (immutable) and wired: `MembershipManager.setVoucher(voucher)` done; the voucher
  was constructed with the membership proxy address.
- At least one active paid tier configured (e.g. `WAGER_PARTICIPANT_ROLE` / Gold with `priceUSDC`,
  `durationDays`). A USDC balance + allowance for the minter.

```bash
npm run compile
npm test                                   # full suite incl. new voucher/redeem tests, all green
npm run check:storage-layout               # membership upgrade is append-only (must pass)
```

## Scenario 1 — Mint, gift, and resell (US1)

1. Minter approves USDC and calls `voucher.mint(role, Gold)`.
2. **Expect**: token minted to the minter; `priceUSDC` USDC moved minter→treasury; `VoucherMinted` emitted;
   `hasActiveRole(minter, role) == false` (no membership from holding) — SC-002.
3. Transfer the token to a friend (`safeTransferFrom`), then have the friend list/sell it. **Expect**: holder
   changes; still no membership anywhere; `royaltyInfo(id, price)` returns `(treasury, price*250/10000)` (2.5%).

## Scenario 2 — Redeem into a soulbound membership (US2)

1. The current holder calls `membership.redeemVoucher(voucherId, termsHash)`.
2. **Expect**: voucher burned (ERC-721 `Transfer` to zero); `hasActiveRole(holder, role) == true`;
   `getActiveTier == Gold`; `expiresAt == now + durationDays`; Terms recorded for the holder;
   `MembershipRedeemed` emitted.
3. Create/accept a wager as the holder. **Expect**: gating and limits behave **identically** to a directly
   purchased Gold membership — SC-003 / FR-008.
4. Change Gold's config (price/limits/active) between mint and redeem, then redeem an older voucher.
   **Expect**: still grants Gold for the snapshot `durationDays`, regardless of the config change — FR-009.

## Scenario 3 — Redeem privately to a fresh wallet (US3)

1. Transfer the voucher to a brand-new wallet unrelated to the buyer; that wallet calls `redeemVoucher`.
2. **Expect**: redemption succeeds (no relationship to the minter required — FR-017); the resulting membership
   record stores **no** back-reference to the minting/selling wallet (FR-018). The frontend redeem screen shows
   the honest privacy disclosure (public mints/transfers; pseudonymity, not ZK) — FR-020.

## Scenario 4 — Compliance & failure resilience (US4)

1. **Blocked redeemer**: a sanctioned/blocked address attempts `redeemVoucher`. **Expect**: revert (fail-closed);
   no membership; voucher **not** burned and still owned — FR-012/FR-015/SC-004.
2. **Already active**: an address with an active membership for `role` attempts redeem. **Expect**: revert;
   voucher intact — FR-011.
3. **Recovery**: sell that same voucher to a different, eligible buyer who redeems. **Expect**: success — SC-006.
4. **Double-redeem**: attempt to redeem a burned voucher. **Expect**: revert (single-use) — FR-010.
5. **No primary refund**: there is no function to refund mint USDC; value is recovered only by resale/redeem —
   FR-005a.

## Scenario 5 — Upgrade safety (membership proxy)

1. Run `npm run check:storage-layout` against the redeem upgrade. **Expect**: passes (only `voucher` appended).
2. Attempt an intentionally storage-incompatible variant. **Expect**: CI validation blocks it before apply —
   FR-024.
3. Confirm the membership proxy **address is unchanged** after applying the redeem upgrade; frontend/subgraph
   need no repoint (addresses via `sync:frontend-contracts`).

## Done / acceptance

All five scenarios pass, the full existing membership + wager suites pass unchanged (SC-008), `tokenURI`
renders on-chain (SC-009 royalty exposed), and the membership proxy address is stable across the upgrade.
