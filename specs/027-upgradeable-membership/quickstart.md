# Quickstart: Upgradeable MembershipManager — validation guide

End-to-end scenarios proving the migration is behavior-neutral and the proxy is upgrade-safe. Run on local
(1337) or Amoy (80002). Validation/run guide only; implementation lives in `tasks.md` and the contract.

## Prerequisites

- 025 primitives present (merged): `contracts/upgradeable/UUPSManaged.sol`, `scripts/deploy/lib/upgradeable.js`,
  `npm run check:storage-layout`, `@openzeppelin/contracts-upgradeable`, `@openzeppelin/hardhat-upgrades`.
- `MembershipManager` converted (inherits `UUPSManaged`; `initialize` replaces constructor; trailing `__gap`).
- `MembershipManager` registered in `check-storage-layout.js`'s `UPGRADEABLE_CONTRACTS`.

```bash
npm run compile
npm test                         # full suite incl. new membership upgrade-lifecycle test, all green
npm run check:storage-layout     # MembershipManager implementation is upgrade-safe (append-only)
```

## Scenario 1 — Behavior-neutral cutover (US1)

1. Deploy `MembershipManager` as proxy+impl via `lib/upgradeable.js` with current logic; confirm
   `deployments/<net>.json` records `membershipManager` (proxy) + `membershipManagerImpl`.
2. Run the **full existing membership suite** against the proxy. **Expect**: 100% pass, no changes (FR-003/SC-003).
3. Configure a tier, purchase a membership, exercise upgrade/extend/grant/revoke and the create/close hooks.
   **Expect**: outcomes identical to the non-upgradeable contract; accrued fees fully accounted for (FR-008).

## Scenario 2 — WagerRegistry repoint (US1 / FR-009)

1. Call `WagerRegistry.setMembershipManager(membershipProxy)` as admin (floppy keystore on live nets).
2. Create/accept a wager as a member. **Expect**: membership gating
   (`hasActiveRole`/`checkCanCreate`/`recordCreate`/`recordClose`) resolves against the proxy and behaves
   exactly as before; the **wager suite passes** with the proxy-pointed registry.

## Scenario 3 — In-place upgrade preserves state (US2)

1. With live memberships + accrued fees on the proxy, deploy a v2 implementation that adds an additive change
   and apply the upgrade via `lib/upgradeable.js` (`UPGRADER_ROLE`).
2. **Expect**: proxy address unchanged; every pre-existing membership, accrued fee, and config mapping reads
   back unchanged and remains operable; new logic active; frontend/subgraph/`WagerRegistry` need no repoint
   (SC-001/SC-002).

## Scenario 4 — Authorization & safety (US3)

1. **Non-admin upgrade**: attempt an upgrade from a non-`UPGRADER_ROLE` account. **Expect**: revert; logic
   unchanged (SC-004).
2. **Storage-incompatible impl**: run `check:storage-layout` against an impl that reorders/removes a slot.
   **Expect**: validation fails and blocks it before apply (SC-005).
3. **Re-init**: call `initialize` again on the proxy. **Expect**: revert (SC-008).
4. **Auditability**: confirm the upgrade is observable on-chain and the new impl is recorded in `deployments/`
   (SC-007).
5. **Bare impl**: confirm the standalone implementation cannot be initialized (FR-015).

## Scenario 5 — Coexistence (FR-007)

1. Confirm a membership created on the legacy authority before cutover remains readable/usable on the legacy
   address until expiry, and the app shows it as legacy (not implied to have moved). New purchases land on the
   proxy. No double-counting of fees across the two.

## Done / acceptance

All scenarios pass, the full existing membership + wager suites pass unchanged (SC-003), the proxy address is
stable across the upgrade, and the membership proxy is ready to receive feature 026's `redeemVoucher` as its
first in-place, append-only upgrade (SC-006).
