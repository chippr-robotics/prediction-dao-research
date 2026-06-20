# Contract: Generic deploy / upgrade / validate tooling

Contract-agnostic JS + CI tooling so any upgradeable contract (WagerRegistry now, MembershipManager next)
deploys, upgrades, and validates the **same way** (PR #724 ask). Nothing here names WagerRegistry in its
logic; the contract is a parameter.

## `scripts/deploy/lib/upgradeable.js` (new)

```
deployProxy(hre, { name, initArgs, deploymentsKey }) -> { proxy, implementation }
  // 1. validateImplementation(name)          (OZ hardhat-upgrades: unsafe-pattern check)
  // 2. deploy implementation `name`
  // 3. deploy ERC1967Proxy(impl, encode initialize(initArgs))   [signed via the floppy-keystore signer]
  // 4. record { [deploymentsKey]: proxy, [deploymentsKey+"Impl"]: impl } in deployments/<net>.json

upgradeProxy(hre, { name, proxyAddress, deploymentsKey }) -> { implementation }
  // 1. validateUpgrade(proxyAddress, name)   (OZ hardhat-upgrades: storage-layout + unsafe-pattern; FAILS on incompat)
  // 2. deploy new implementation `name`
  // 3. proxy.upgradeToAndCall(newImpl, "0x")  [UPGRADER_ROLE, signed via the floppy-keystore signer]
  // 4. update deployments/<net>.json: [deploymentsKey+"Impl"] = newImpl  (proxy key unchanged)
```

- Uses the existing floppy-keystore signer already wired in `hardhat.config` (no new key management;
  `.env PRIVATE_KEY` fallback when the floppy isn't mounted, per the repo's verify/deploy convention).
- `deployments/` stays the source of truth (FR-014): both `proxy` and `…Impl` are recorded; the proxy key is
  the address the frontend/subgraph consume.

## `npm run check:storage-layout` (new, gating in CI)

- Runs OZ `validateImplementation` (first deploy) / `validateUpgrade` (subsequent) for each registered
  upgradeable contract; non-zero exit on any unsafe pattern or storage-layout incompatibility (FR-010/SC-005).
- Wired into `.github/workflows/test.yml` as a required step (no `continue-on-error` — Principle IV).
- Contract-agnostic: a small list/registry of upgradeable contracts drives it, so adding `MembershipManager`
  is one list entry.

## `hardhat.config` change

```
require("@openzeppelin/hardhat-upgrades");   // composes with hardhat-toolbox + the floppy-keystore loader
```

## `scripts/deploy/deploy.js` change

The `-------- WagerRegistry --------` section deploys via `deployProxy(hre, { name: "WagerRegistry",
initArgs: [admin, membershipManager, polymarketAdapter, allowedTokens], deploymentsKey: "wagerRegistry" })`
instead of a direct constructor deploy. Everything downstream (allowlist wiring, role grants done in
`initialize`) is unchanged.

## `scripts/deploy/verify.js` change

Verify the **implementation** contract on the explorer (constructor args empty for UUPS impls), and record
the proxy under `wagerRegistry`. The explorer "is this a proxy?" linkage points the proxy at the impl.

## `package.json` change

```
"dependencies":   { "@openzeppelin/contracts-upgradeable": "^5.4.0", ... }
"devDependencies":{ "@openzeppelin/hardhat-upgrades": "^3", ... }
"scripts": { "check:storage-layout": "hardhat run scripts/deploy/check-storage-layout.js" }
```

(Pin `contracts-upgradeable` to **5.4.0** to match `contracts`; ignore the stray transitive 4.9.3.)

## Reusability contract (the point of this file)

`MembershipManager`'s sibling spec adds **one** entry to the upgradeable-contracts registry and calls the same
`deployProxy` / `upgradeProxy` / `check:storage-layout` — no new tooling. The voucher feature then ships as
`upgradeProxy({ name: "MembershipManager", ... })`, the first in-place membership upgrade.
