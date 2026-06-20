/**
 * Generic UUPS proxy deploy / upgrade helpers (spec 025).
 *
 * Contract-agnostic by design (PR #724): the contract name + init args are parameters, so MembershipManager
 * (and any future value-bearing contract that inherits {UUPSManaged}) reuses these helpers as-is — no
 * reimplementation. Signing uses whatever signer hardhat's configured network provides (the air-gapped
 * floppy-keystore deployer on the live networks; the `.env` PRIVATE_KEY fallback in dev), so no special
 * key plumbing is needed here.
 *
 * Both helpers run OpenZeppelin's storage-layout / upgrade-safety validation before any on-chain action and
 * return the proxy + implementation addresses so the caller can record BOTH in `deployments/` (FR-014): the
 * proxy is the stable address the frontend/subgraph consume; the implementation changes on each upgrade.
 */

const { ethers, upgrades } = require("hardhat");

/**
 * Deploy `name` behind a fresh ERC1967 UUPS proxy, initialized with `initArgs`.
 * @returns {Promise<{ proxy: string, implementation: string, contract: import("ethers").Contract }>}
 */
async function deployProxy({ name, initArgs, kind = "uups" }) {
  const Factory = await ethers.getContractFactory(name);
  const proxy = await upgrades.deployProxy(Factory, initArgs, { kind });
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`  ✓ ${name} proxy: ${proxyAddress}`);
  console.log(`    ${name} implementation: ${implementation}`);
  return { proxy: proxyAddress, implementation, contract: proxy };
}

/**
 * Upgrade the implementation behind an existing proxy. Validates storage-layout compatibility (append-only)
 * against the currently-deployed implementation FIRST; an incompatible upgrade throws before anything is
 * sent on-chain. The proxy address is unchanged.
 * @returns {Promise<{ proxy: string, implementation: string, contract: import("ethers").Contract }>}
 */
async function upgradeProxy({ name, proxyAddress, kind = "uups", call } = {}) {
  const Factory = await ethers.getContractFactory(name);
  const opts = { kind };
  if (call) opts.call = call; // optional reinitializer to run during the upgrade, e.g. { fn, args }
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory, opts);
  await upgraded.waitForDeployment();
  const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`  ✓ ${name} upgraded — proxy unchanged: ${proxyAddress}`);
  console.log(`    new implementation: ${implementation}`);
  return { proxy: proxyAddress, implementation, contract: upgraded };
}

/** Read the current implementation address behind a proxy (for verification / deployments records). */
async function getImplementation(proxyAddress) {
  return upgrades.erc1967.getImplementationAddress(proxyAddress);
}

module.exports = { deployProxy, upgradeProxy, getImplementation };
