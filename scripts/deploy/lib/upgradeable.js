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

const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/**
 * Read the implementation address of a freshly deployed proxy, tolerating RPC read lag.
 *
 * `upgrades.erc1967.getImplementationAddress` reads the EIP-1967 slot once and throws
 * "doesn't look like an ERC 1967 proxy with a logic contract address" when it comes back zero. On a
 * load-balanced endpoint that happens even though the deploy SUCCEEDED — the node serving the read
 * has not yet applied the block that the deploy receipt came from. Observed repeatedly on Base,
 * where it aborted three separate multi-contract runs mid-way, each time leaving a correctly
 * deployed and initialised proxy unrecorded and the remaining contracts undeployed.
 *
 * Retrying is safe: this is a pure read of a slot that is already written on-chain.
 */
async function readImplementationWithRetry(proxyAddress, { attempts = 10, delayMs = 3000 } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await upgrades.erc1967.getImplementationAddress(proxyAddress);
    } catch (e) {
      lastError = e;
      // Fall back to reading the slot directly — the plugin's own read may be the stale one.
      const raw = await ethers.provider.getStorage(proxyAddress, EIP1967_IMPL_SLOT).catch(() => null);
      if (raw && /[1-9a-f]/.test(raw.slice(-40))) return ethers.getAddress("0x" + raw.slice(-40));
      if (i === 0) console.log("    … implementation slot not visible yet; waiting for the RPC to catch up");
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

/**
 * Deploy `name` behind a fresh ERC1967 UUPS proxy, initialized with `initArgs`.
 * @returns {Promise<{ proxy: string, implementation: string, contract: import("ethers").Contract }>}
 */
async function deployProxy({ name, initArgs, kind = "uups" }) {
  const Factory = await ethers.getContractFactory(name);
  const proxy = await upgrades.deployProxy(Factory, initArgs, { kind });
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const implementation = await readImplementationWithRetry(proxyAddress);
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
