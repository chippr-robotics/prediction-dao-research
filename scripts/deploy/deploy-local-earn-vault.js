/**
 * LOCAL-ONLY fixture deploy: a `MockERC4626Vault` over the local payment token, so the spec-060
 * fee wrapper has something to wrap on a sandbox chain.
 *
 * Why this exists. `FeeRouter.depositToVaultWithFee` is the ONE on-chain path that charges a
 * platform fee, and its only member surface is Earn ▸ Lend, whose vaults are curated Morpho
 * vaults on Polygon/Ethereum. A local chain has no Morpho, so without a stand-in vault the
 * "member is never charged above the rate they were shown" invariant cannot be settled from
 * chain state — the full-tier fee spec (#1233) would be reduced to reading the modal, which is
 * exactly what the tiering policy calls a test that proves nothing.
 *
 * It is a MOCK and it is refused off a sandbox chain (see LOCAL_CHAIN_IDS below): nothing here
 * may ever reach a network where a member's funds are real. `contracts/mocks/` is test-only by
 * the repo's own rule; this script is the deploy-side half of that rule.
 *
 * The vault is recorded under `mocks.mockEarnVault` — beside `mocks.mockPolymarketCTF`, never in
 * `contracts`, so nothing that walks the real contract set can pick it up.
 *
 * Run (after `deploy:local`, which writes the record this appends to):
 *   npx hardhat run scripts/deploy/deploy-local-earn-vault.js --network localhost
 *   E2E_AMOY_LOCAL=1 npx hardhat run ... --network localhost   # the 80002-impersonating node
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");

// Sandbox chain ids. Identical in shape and reasoning to scripts/operations/seed-local.js: the
// full E2E tier boots hardhat AS chainId 80002 so the local node is the app's membership home,
// and 80002 is ALSO real Polygon Amoy — so the impersonation must be CLAIMED with
// E2E_AMOY_LOCAL=1 rather than allowlisted, or this guard would stop guarding the one chain id
// it most needs to.
const LOCAL_CHAIN_IDS = [1337, 31337];
if (process.env.E2E_AMOY_LOCAL === "1") LOCAL_CHAIN_IDS.push(80002);

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (!LOCAL_CHAIN_IDS.includes(chainId)) {
    throw new Error(
      `deploy-local-earn-vault.js refuses to run on chainId ${chainId} (network '${hre.network.name}'). ` +
        `It deploys a MOCK ERC-4626 vault from contracts/mocks/, which must never exist on a network ` +
        `where member funds are real. Allowed: ${LOCAL_CHAIN_IDS.join(", ")}` +
        (chainId === 80002 ? " — set E2E_AMOY_LOCAL=1 if this is the local Amoy-impersonating node." : "")
    );
  }

  const [deployer] = await ethers.getSigners();
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No deployment record at deployments/${filename}. Run \`npm run deploy:local\` first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));

  const asset = record.paymentToken;
  if (!asset || !ethers.isAddress(asset)) {
    throw new Error(`deployments/${filename} has no usable paymentToken — the vault needs an underlying asset.`);
  }

  console.log("=".repeat(60));
  console.log("Local Earn vault fixture (spec 060 / spec 050) — MOCK, sandbox only");
  console.log("=".repeat(60));
  console.log(`Network:  ${hre.network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Asset:    ${asset} (the local payment token)`);

  const mocks = record.mocks || (record.mocks = {});

  // Idempotent like every other targeted deploy here: a re-run after an interrupted setup must
  // not strand the first vault (member positions and the router's approval would be recorded
  // against an address nothing reads any more).
  if (mocks.mockEarnVault && (await ethers.provider.getCode(mocks.mockEarnVault)) !== "0x") {
    console.log(`\nmockEarnVault already deployed at ${mocks.mockEarnVault} — nothing to do.`);
    return;
  }

  const Vault = await ethers.getContractFactory("MockERC4626Vault");
  const vault = await Vault.deploy(asset);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  mocks.mockEarnVault = vaultAddress;
  record.mockEarnVaultDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log(`\n  ✓ MockERC4626Vault: ${vaultAddress}`);
  console.log(`    name/symbol: ${await vault.name()} / ${await vault.symbol()}`);
  console.log(`    decimals:    ${await vault.decimals()}`);
  console.log("\nRecorded as mocks.mockEarnVault. The full-tier fee spec reads it from there;");
  console.log("no frontend config points at it (the vault list is stubbed at the Morpho API).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
