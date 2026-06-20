# Quickstart: Validate the Upgradeable WagerRegistry

End-to-end validation that the registry is upgradeable, behavior-neutral at cutover, state-preserving across
upgrades, and safely gated. Design details live in [data-model.md](./data-model.md) and
[contracts/](./contracts/); this is the run/verify guide.

## Prerequisites

```bash
npm install                       # pulls @openzeppelin/contracts-upgradeable@^5.4.0 + @openzeppelin/hardhat-upgrades
npm run compile                   # WagerRegistry compiles as a UUPS implementation + UUPSManaged base
```

## 1. Behavior neutrality — existing suite passes against the proxy (primary gate)

```bash
npm test                          # full existing WagerRegistry suite, now deployed via proxy initialize()
```

Expected: **100% of the existing suite passes unchanged** (FR-003/SC-003). The only test-harness change is
deploying the registry behind an `ERC1967Proxy` + `initialize(...)` instead of the constructor; every
create/accept/cancel/decline/resolve/draw/refund/claim assertion is identical.

## 2. Upgrade lifecycle (new suite: `test/upgradeable/`)

```bash
npm test -- --grep "upgrade"
```

Assert:

- **Deploy (US1)**: proxy deploys with current logic; `initialize` runs once; `_nextWagerId == 1`; a wager
  created through the proxy reads back correctly; the implementation address is recorded separately from the
  proxy.
- **In-place upgrade (US2)**: create live wagers; upgrade to a new implementation (e.g. one adding a trivial
  view); assert the **proxy address is unchanged**, every pre-existing wager/balance/mapping reads back
  unchanged and is still operable, and the new logic is active (FR-001/002/003, SC-001/SC-002).
- **Authorization (US3)**: a non-`UPGRADER_ROLE` account calling `upgradeToAndCall` reverts; the role holder
  succeeds (FR-009/SC-004).
- **Re-init (US3)**: calling `initialize` again on the proxy reverts; calling `initialize` on a bare
  implementation reverts (`_disableInitializers`) (FR-011/SC-008).
- **Non-brickable (US3)**: after an upgrade, `_authorizeUpgrade`/`UPGRADER_ROLE` still exist and a further
  upgrade works (FR-012).
- **Pause interaction**: pausing operational entrypoints does not block an upgrade; an upgrade does not
  auto-unpause (FR-013).

## 3. Storage-layout safety (generic CI gate)

```bash
npm run check:storage-layout      # OZ validateImplementation / validateUpgrade
```

Assert: a deliberately **storage-incompatible** implementation (reordered/removed/retyped state) is **rejected
before deploy** (FR-010/SC-005); an append-only change (e.g. adding a mapping after `_userWagerIds`, drawing
from `__gap`) **passes**. This step is gating in `.github/workflows/test.yml`.

## 4. Static analysis

```bash
npm run slither                   # UUPS/proxy detectors — no new high/critical
# Medusa: invariants — impl cannot be initialized; upgrade entrypoint always present; escrow conservation across upgrade.
```

## 5. Deploy + cutover (Amoy first, then Polygon)

```bash
# Amoy (testnet) — proxy with CURRENT logic
npm run deploy:amoy                       # deploys ERC1967Proxy + impl via lib/upgradeable.js (floppy signer)
npm run verify:amoy                       # verify the implementation; link the proxy
npm run sync:frontend-contracts:amoy      # frontend points at the PROXY address (stable)
```

Validate on Amoy:
1. Run the full wager lifecycle against the proxy — identical to the legacy registry.
2. Confirm `deployments/amoy-chain80002-v2.json` records `wagerRegistry` (proxy), `wagerRegistryImpl`, and
   `wagerRegistryLegacy`.
3. Confirm the frontend shows legacy wagers as **settle-only** and new wagers on the proxy (coexistence,
   FR-007) — no implication that legacy wagers moved.
4. Perform a no-op/additive upgrade on Amoy and re-run step 1 to prove in-place upgradeability with preserved
   state (SC-006 dry run).

```bash
# Polygon (mainnet) — after Amoy sign-off
npm run deploy:polygon && npm run verify:polygon && npm run sync:frontend-contracts:polygon
```

## 6. Reusability check (no code, design assertion)

Confirm `UUPSManaged.sol`, `scripts/deploy/lib/upgradeable.js`, and `check:storage-layout` contain **no**
WagerRegistry-specific logic (contract name is a parameter), so the `MembershipManager` sibling spec can adopt
them by inheritance + one registry entry (PR #724).

## Done when

- Existing suite is green against the proxy; the upgrade-lifecycle suite passes; Slither/Medusa clean.
- `check:storage-layout` blocks an incompatible upgrade and passes an append-only one.
- Amoy cutover validated (lifecycle parity, coexistence shown honestly, an upgrade preserves state); Polygon
  deployed after sign-off.
- The shared primitives are demonstrably contract-agnostic (ready for the membership sibling spec).
