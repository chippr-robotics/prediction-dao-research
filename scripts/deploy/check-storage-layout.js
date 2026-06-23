/**
 * Storage-layout & upgrade-safety gate (spec 025, FR-010/SC-005).
 *
 * Validates every upgradeable contract's implementation for unsafe patterns (missing
 * `_disableInitializers`, `delegatecall`, `selfdestruct`, non-namespaced base storage, etc.) using OpenZeppelin
 * `hardhat-upgrades`. When a prior implementation address is recorded in `deployments/`, it additionally checks
 * the new implementation is storage-layout COMPATIBLE (append-only) with the deployed one — blocking a
 * state-corrupting upgrade BEFORE it can be applied.
 *
 * Contract-agnostic: add a contract to UPGRADEABLE_CONTRACTS and it is covered (MembershipManager joins here
 * when it adopts UUPSManaged — PR #724 reuse). Exit non-zero on any failure so CI fails loudly (Principle IV).
 *
 * Usage: `npm run check:storage-layout`  (optionally `--network <net>` to diff against that network's deploy)
 */
const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgradeable contracts and the deployments key holding their PROXY address (impl is `<key>Impl`).
const UPGRADEABLE_CONTRACTS = [
  { name: "WagerRegistry", deploymentsKey: "wagerRegistry" },
  { name: "MembershipManager", deploymentsKey: "membershipManager" }, // spec 027 — second adopter of UUPSManaged
  { name: "TokenFactory", deploymentsKey: "tokenFactory" }, // spec 028 — token-issuance authority/registry
];

function loadDeployedImpl(deploymentsKey) {
  const dir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(dir)) return null;
  const chainId = network.config?.chainId;
  // Match a deployments file for this network/chain and read the recorded implementation address.
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    if (chainId && !file.includes(`chain${chainId}`)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const impl = data[`${deploymentsKey}Impl`] || data.contracts?.[`${deploymentsKey}Impl`];
      if (impl) return impl;
    } catch {
      /* ignore malformed files */
    }
  }
  return null;
}

async function main() {
  let failed = false;
  for (const { name, deploymentsKey } of UPGRADEABLE_CONTRACTS) {
    const Factory = await ethers.getContractFactory(name);
    const deployedImpl = loadDeployedImpl(deploymentsKey);
    try {
      if (deployedImpl) {
        // Compare against the currently-deployed implementation: enforces append-only storage compatibility.
        await upgrades.validateUpgrade(deployedImpl, Factory, { kind: "uups" });
        console.log(`✓ ${name}: upgrade is storage-compatible with deployed impl ${deployedImpl}`);
      } else {
        // No prior deployment to diff against: run the unsafe-pattern checks on the implementation.
        await upgrades.validateImplementation(Factory, { kind: "uups" });
        console.log(`✓ ${name}: implementation is upgrade-safe (no deployed impl to diff against)`);
      }
    } catch (e) {
      failed = true;
      console.error(`✗ ${name}: ${e.message}`);
    }
  }
  if (failed) {
    console.error("\nStorage-layout / upgrade-safety check FAILED.");
    process.exit(1);
  }
  console.log("\nAll upgradeable contracts passed the storage-layout / upgrade-safety check.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
