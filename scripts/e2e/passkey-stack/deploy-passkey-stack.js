/**
 * Bootstrap the ERC-4337 prerequisites on the LOCAL e2e chain (spec 041 + spec 050).
 *
 *   HARDHAT_LOCAL_CHAIN_ID=80002 npx hardhat node
 *   npm run setup:e2e
 *   npx hardhat run scripts/e2e/passkey-stack/deploy-passkey-stack.js --network localhost
 *   npx hardhat run scripts/deploy/deploy-account-stack.js --network localhost
 *   PM_VERIFYING_SIGNER=… npx hardhat run scripts/deploy/deploy-verifying-paymaster.js --network localhost
 *
 * WHY THIS SCRIPT EXISTS AT ALL. `deploy-account-stack.js` deliberately REFUSES a chain that has
 * neither the Arachnid CREATE2 proxy nor EntryPoint v0.6 ("on local dev use the test fixtures"),
 * and it is right to: recording a non-deterministic factory address would break FR-023, and the
 * app's `ACCOUNT_INIT_CODE_HASH` is pinned to the implementation that the canonical salt produces.
 * So rather than fork that script for CI, this one makes the local chain LOOK like every other EVM
 * network — same CREATE2 proxy address, same EntryPoint address — and then the real deploy scripts
 * run unmodified. That is what makes the e2e stack a test of the shipped deployment path instead of
 * a parallel one.
 *
 * Two things are deployed here and neither is invented:
 *
 *  1. **The Arachnid deterministic-deployment proxy** at 0x4e59b448…4956C. Mainnet got it from a
 *     pre-EIP-155 presigned transaction; a CREATE address is a pure function of (sender, nonce), so
 *     impersonating that same sender at nonce 0 with the same init code lands the same address
 *     without needing the signature. The script ASSERTS the address rather than assuming it.
 *
 *  2. **EntryPoint v0.6** at 0x5FF1…2789, CREATE2'd through that proxy with the canonical zero salt
 *     — which is exactly how the live one was deployed, so the address falls out rather than being
 *     forced. Its creation bytecode comes from `npm pack @account-abstraction/contracts@0.6.0` into
 *     a temp dir: the package is NEVER added to package.json (spec 075 — a lockfile touch here
 *     drops the platform rolldown binary and breaks every Vite build). The address assertion is
 *     also the integrity check: a tampered or wrong-version tarball CANNOT produce 0x5FF1…2789.
 *     Do not "simplify" this to `hardhat_setCode` with the deployed runtime — EntryPoint's
 *     `senderCreator` is an immutable baked into that runtime, and a copied one points at a
 *     contract this chain does not have, so first-use account deployment (initCode) reverts.
 *
 * Nothing here is production code and nothing here may run against a public network: the guard
 * below refuses anything that is not a local node.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// The canonical deterministic-deployment proxy and the account that deployed it (Arachnid).
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const CREATE2_DEPLOYER_EOA = "0x3fAB184622Dc19b6109349B94811493BF2a45362";
// init = 14-byte prologue (return 69 bytes from offset 14) + the 69-byte runtime, which is exactly
// what `eth_getCode(0x4e59b448…)` returns on every live chain.
const CREATE2_PROXY_INITCODE =
  "0x604580600e600039806000f350fe" +
  "7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0" +
  "3601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const ENTRYPOINT_PKG = "@account-abstraction/contracts@0.6.0";
const ZERO_SALT = "0x" + "0".repeat(64);

// Chain ids this script will touch. 80002 is the Amoy-impersonating local node the full tier uses
// (see the E2E_AMOY_LOCAL seam); 1337 is the plain local sandbox.
const LOCAL_CHAIN_IDS = [80002, 1337, 31337];

function assertLocal(chainId) {
  const url = hre.network.config?.url || "";
  const isLoopback = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)\b/.test(url);
  if (!LOCAL_CHAIN_IDS.includes(chainId) || !isLoopback) {
    throw new Error(
      `Refusing to run: this script bootstraps a LOCAL e2e chain only (got chainId ${chainId} at "${url}"). ` +
        `On a real network the CREATE2 proxy and EntryPoint already exist.`
    );
  }
}

/** Fetch the pinned EntryPoint artifact WITHOUT touching the repo's dependency tree. */
function entryPointCreationBytecode() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fw-entrypoint-"));
  // `npm pack` only downloads a tarball; it writes nothing to package.json or package-lock.json.
  const out = execFileSync("npm", ["pack", ENTRYPOINT_PKG, "--pack-destination", dir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const tgz = out.trim().split("\n").pop().trim();
  execFileSync("tar", ["xzf", path.join(dir, tgz), "-C", dir, "package/artifacts/EntryPoint.json"], {
    stdio: "inherit",
  });
  const artifact = JSON.parse(fs.readFileSync(path.join(dir, "package/artifacts/EntryPoint.json"), "utf8"));
  if (!/^0x[0-9a-fA-F]+$/.test(artifact.bytecode || "")) {
    throw new Error(`${ENTRYPOINT_PKG}: artifacts/EntryPoint.json has no usable creation bytecode`);
  }
  return artifact.bytecode;
}

async function deployCreate2Proxy(funder) {
  if ((await ethers.provider.getCode(CREATE2_DEPLOYER)) !== "0x") {
    console.log(`CREATE2 proxy: already present at ${CREATE2_DEPLOYER}`);
    return;
  }
  const nonce = await ethers.provider.getTransactionCount(CREATE2_DEPLOYER_EOA);
  if (nonce !== 0) {
    throw new Error(
      `${CREATE2_DEPLOYER_EOA} has nonce ${nonce} but no proxy at ${CREATE2_DEPLOYER} — the CREATE address ` +
        `depends on that nonce, so this chain cannot reproduce the canonical proxy. Restart the node.`
    );
  }
  await funder.sendTransaction({ to: CREATE2_DEPLOYER_EOA, value: ethers.parseEther("1") });
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [CREATE2_DEPLOYER_EOA] });
  try {
    const signer = await ethers.getSigner(CREATE2_DEPLOYER_EOA);
    const tx = await signer.sendTransaction({ data: CREATE2_PROXY_INITCODE });
    const receipt = await tx.wait();
    const landed = receipt.contractAddress;
    if (!landed || landed.toLowerCase() !== CREATE2_DEPLOYER.toLowerCase()) {
      throw new Error(
        `CREATE2 proxy landed at ${landed}, not the canonical ${CREATE2_DEPLOYER}. ` +
          `Every deterministic address downstream (accountFactory, EntryPoint) would diverge.`
      );
    }
  } finally {
    await hre.network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [CREATE2_DEPLOYER_EOA] });
  }
  console.log(`CREATE2 proxy: deployed at ${CREATE2_DEPLOYER}`);
}

async function deployEntryPoint(deployer) {
  if ((await ethers.provider.getCode(ENTRYPOINT_V06)) !== "0x") {
    console.log(`EntryPoint v0.6: already present at ${ENTRYPOINT_V06}`);
    return;
  }
  const initCode = entryPointCreationBytecode();
  const predicted = ethers.getCreate2Address(CREATE2_DEPLOYER, ZERO_SALT, ethers.keccak256(initCode));
  if (predicted.toLowerCase() !== ENTRYPOINT_V06.toLowerCase()) {
    // The address IS the checksum: the canonical EntryPoint was CREATE2'd from this proxy with the
    // zero salt, so a different address means different bytes than the network runs.
    throw new Error(
      `${ENTRYPOINT_PKG} does not reproduce the canonical EntryPoint: CREATE2 predicts ${predicted}, ` +
        `expected ${ENTRYPOINT_V06}. Refusing to run a bundler against an EntryPoint nobody else has.`
    );
  }
  const tx = await deployer.sendTransaction({
    to: CREATE2_DEPLOYER,
    data: ethers.concat([ZERO_SALT, initCode]),
    gasLimit: 6_000_000,
  });
  await tx.wait();
  if ((await ethers.provider.getCode(ENTRYPOINT_V06)) === "0x") {
    throw new Error(`EntryPoint deploy landed no code at ${ENTRYPOINT_V06} (tx ${tx.hash}).`);
  }
  console.log(`EntryPoint v0.6: deployed at ${ENTRYPOINT_V06}`);
}

async function main() {
  const { chainId: raw } = await ethers.provider.getNetwork();
  const chainId = Number(raw);
  assertLocal(chainId);

  const [deployer] = await ethers.getSigners();
  console.log(`passkey-stack bootstrap on ${hre.network.name} (chainId ${chainId}) — deployer ${deployer.address}`);

  await deployCreate2Proxy(deployer);
  await deployEntryPoint(deployer);

  /*
   * A BLOCK HEARTBEAT. alto drives its bundling loop off new blocks; a hardhat node in auto-mine
   * only produces one when someone sends a transaction, so a bundler with a queued UserOp and no
   * other traffic can sit waiting for a block that only it would cause. Interval mining gives it
   * the cadence a real chain has. Harmless here — this job runs only the passkey specs, none of
   * which assert on block height, and the full tier's snapshot/revert isolation does not apply to
   * `e2e/passkey/**`.
   */
  await hre.network.provider.send("evm_setIntervalMining", [1000]);
  console.log("interval mining: 1000ms");

  console.log("\nReady for: deploy-account-stack.js, then deploy-verifying-paymaster.js");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
