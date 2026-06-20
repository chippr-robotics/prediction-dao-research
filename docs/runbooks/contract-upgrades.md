# Runbook: Upgrading the contracts (UUPS proxies)

How to deploy and upgrade the upgradeable contracts (`WagerRegistry`, and any contract that inherits
`UUPSManaged`). Background: [ADR-004](../adr/004-upgradeable-registry-uups.md). Reuse guide for making a new
contract upgradeable: [developer-guide/upgradeable-contracts.md](../developer-guide/upgradeable-contracts.md).

> **Why this matters**: an upgrade replaces the code that custodies user funds. The proxy address never
> changes and all state is preserved — but a bad storage layout or a lost upgrade key is catastrophic. Follow
> this runbook exactly. Upgrades are authorized by `UPGRADER_ROLE`, held by the air-gapped floppy-keystore
> admin.

## Key facts

- Each upgradeable contract is an **ERC1967 UUPS proxy** in front of a swappable **implementation**.
- The **proxy** address is the stable one users / frontend / subgraph use; it is recorded in
  `deployments/<network>-chain<id>-v2.json` under e.g. `wagerRegistry`. The current implementation is under
  `wagerRegistryImpl` and changes on every upgrade.
- Storage is **append-only**: never insert, reorder, remove, or retype existing state variables; new state
  consumes the trailing `__gap`. The CI gate (`npm run check:storage-layout`) blocks an incompatible upgrade.
- Upgrade authorization is `UPGRADER_ROLE` (separate from `DEFAULT_ADMIN_ROLE`) and is **non-brickable** — no
  upgrade can remove the upgrade path.

## Pre-flight (every upgrade)

1. The new implementation MUST keep storage append-only. Validate locally:

   ```bash
   npm run compile
   npm run check:storage-layout        # OZ validateUpgrade vs the recorded deployed impl — FAILS on incompat
   ```

2. The full suite MUST pass (behavior preserved):

   ```bash
   npm test
   ```

3. Mount the floppy keystore so the admin (`UPGRADER_ROLE`) can sign:

   ```bash
   npm run floppy:mount
   ```

## First deploy (cutover — proxy with current logic)

This stands up the proxy running the **current** logic on a network for the first time. Testnet first.

```bash
# Amoy (testnet)
npm run deploy:amoy                     # deploys ERC1967Proxy + implementation, records both in deployments/
npm run verify:amoy                     # verifies the implementation; explorer links the proxy to it
npm run sync:frontend-contracts:amoy    # frontend points at the PROXY address (stable)
```

Validate on Amoy (see `specs/025-upgradeable-registry/quickstart.md` §5): run the full wager lifecycle
against the proxy and confirm parity with the legacy registry; confirm the deployments record has
`wagerRegistry` (proxy), `wagerRegistryImpl`, and the legacy address; confirm the frontend shows legacy
wagers as **settle-only** (coexistence) and new wagers on the proxy.

```bash
# Polygon (mainnet) — only after Amoy sign-off
npm run deploy:polygon && npm run verify:polygon && npm run sync:frontend-contracts:polygon
```

## In-place upgrade (ship new logic — e.g. feature 024)

The proxy address does NOT change; all state and funds are preserved.

1. Run the **Pre-flight** above (compile, `check:storage-layout`, `npm test`, mount floppy).
2. Upgrade via the generic tooling. From a one-off hardhat script or console using
   `scripts/deploy/lib/upgradeable.js`:

   ```js
   const { upgradeProxy } = require("./scripts/deploy/lib/upgradeable");
   // proxyAddress = deployments[...].contracts.wagerRegistry
   await upgradeProxy({ name: "WagerRegistry", proxyAddress });
   // optional reinitializer for new state needing seeding:
   // await upgradeProxy({ name: "WagerRegistry", proxyAddress, call: { fn: "initializeVN", args: [...] } });
   ```

   `upgradeProxy` runs `validateUpgrade` (storage-layout safety) BEFORE sending anything on-chain, deploys
   the new implementation, calls `upgradeToAndCall` (signed by the floppy `UPGRADER_ROLE` admin), and updates
   `wagerRegistryImpl` in the deployments record.
3. Verify the new implementation and re-sync the frontend ABI (address unchanged):

   ```bash
   npm run verify:<network>
   npm run sync:frontend-contracts:<network>
   ```

4. Post-upgrade checks: confirm the proxy address is unchanged; spot-check that existing wagers still read
   and resolve correctly; confirm new functions are live.

## Rollback / abort

- **Before `upgradeToAndCall`**: nothing changed on-chain — fix the implementation and re-run pre-flight.
- **After a bad upgrade**: deploy a corrected implementation and upgrade again (the upgrade path is
  non-brickable). There is no automatic downgrade; "rollback" = upgrade forward to a corrected impl. Keep the
  previous implementation address (recorded in git history of the deployments file) so you can re-point to it
  via `upgradeToAndCall` if the corrected build is byte-identical to the prior good one.

## Failure modes & gotchas

- **`check:storage-layout` fails** → the new layout reorders/removes/retypes existing state. Make the change
  append-only (add new vars at the end, drawing from `__gap`). Do NOT bypass the gate.
- **"Nonce too low" during deploy** → the OZ plugin sends txs the script's `NonceManager` doesn't observe;
  `deploy.js` resets the NonceManager after the proxy deploy. If scripting manually, re-fetch the nonce.
- **Re-running `deploy.js` mints a NEW proxy** (not idempotent, unlike the old CREATE2 deploy). To change
  logic on an existing deployment, run an **upgrade**, never the deploy script.
- **Lost `UPGRADER_ROLE` key** → the contract keeps working but can never be upgraded again. Protect the
  floppy keystore; consider moving `UPGRADER_ROLE` to a timelock/multisig before mainnet scale.
- **Mordor/ETC** are legacy read-only and out of scope.
