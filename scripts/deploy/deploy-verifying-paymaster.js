/**
 * Deploy FairWinsVerifyingPaymaster (spec 050) — the FairWins-operated ERC-4337 v0.6 paymaster that
 * sponsors passkey smart-account UserOps.
 *
 * Records `verifyingPaymaster` + `verifyingPaymasterSigner` into the network's v2 deployments file
 * (source of truth; the frontend/gateway pick the address up from there / from PAYMASTER_ADDRESS_<id>).
 *
 * Args (env or CLI):
 *   PM_VERIFYING_SIGNER   (required)  the sponsorship signer's Ethereum address — the Cloud KMS key's
 *                                     derived address (paymaster-signer-polygon → 0x9Ec0…22CD). The
 *                                     gateway's PM_SIGNER_KMS_KEY MUST resolve to this same address.
 *   PM_OWNER              (optional)  withdraw/rotate authority (floppy keystore in prod). Default: deployer.
 *   PM_ENTRYPOINT         (optional)  EntryPoint v0.6 (default 0x5FF1…2789).
 *   PM_INITIAL_DEPOSIT    (optional)  native amount (ether) to fund the EntryPoint deposit after deploy.
 *   CONFIRM_MAINNET=true             required to deploy on Polygon 137 (safety gate).
 *
 * Usage:
 *   POLYGON_RPC_URL=https://polygon-bor-rpc.publicnode.com PM_VERIFYING_SIGNER=0x9Ec0…22CD \
 *   CONFIRM_MAINNET=true npx hardhat run scripts/deploy/deploy-verifying-paymaster.js --network polygon
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");

const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const network = hre.network.name;
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`VerifyingPaymaster deploy on ${network} (chainId ${chainId}) — deployer ${deployer.address}`);

  if (chainId === 137n && process.env.CONFIRM_MAINNET !== "true") {
    throw new Error("Refusing to deploy on Polygon mainnet (137) without CONFIRM_MAINNET=true.");
  }

  const verifyingSigner = process.env.PM_VERIFYING_SIGNER || argVal("--signer");
  if (!ADDRESS_RE.test(verifyingSigner || "")) {
    throw new Error(
      "PM_VERIFYING_SIGNER (or --signer) must be the sponsorship signer address — the KMS key's derived " +
        "Ethereum address (gcloud kms keys versions get-public-key … → computeAddress)."
    );
  }
  const owner = process.env.PM_OWNER || argVal("--owner") || deployer.address;
  if (!ADDRESS_RE.test(owner)) throw new Error(`PM_OWNER is not a valid address: ${owner}`);
  const entryPoint = process.env.PM_ENTRYPOINT || ENTRYPOINT_V06;

  console.log(`  entryPoint      ${entryPoint}`);
  console.log(`  verifyingSigner ${verifyingSigner}`);
  console.log(`  owner           ${owner}`);

  const PM = await ethers.getContractFactory("FairWinsVerifyingPaymaster");
  const pm = await PM.deploy(entryPoint, verifyingSigner, owner);
  await pm.waitForDeployment();
  const pmAddr = await pm.getAddress();
  console.log(`  ✓ FairWinsVerifyingPaymaster deployed at ${pmAddr}`);

  // Optional initial deposit (funds the sponsorship pool — the bounded loss cap).
  const depositEther = process.env.PM_INITIAL_DEPOSIT || argVal("--deposit");
  if (depositEther) {
    const value = ethers.parseEther(String(depositEther));
    console.log(`  funding EntryPoint deposit with ${depositEther} native…`);
    await (await pm.connect(deployer).deposit({ value })).wait();
    const bal = await pm.getDeposit();
    console.log(`  ✓ deposit now ${ethers.formatEther(bal)} native`);
  }

  // Record into the network's v2 deployment file (append-only; never clobber sibling contracts).
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  const record = fs.existsSync(filepath)
    ? JSON.parse(fs.readFileSync(filepath, "utf8"))
    : { chainId: Number(chainId), contracts: {} };
  record.contracts = record.contracts || {};
  record.contracts.verifyingPaymaster = pmAddr;
  record.contracts.verifyingPaymasterSigner = verifyingSigner;
  record.contracts.entryPoint = record.contracts.entryPoint || entryPoint;
  saveDeployment(filename, record);

  console.log("\nNext steps:");
  console.log(`  • gateway: set PAYMASTER_ADDRESS_${chainId}=${pmAddr} + PM_SIGNER_KMS_KEY (must derive ${verifyingSigner})`);
  console.log(`  • SPA:     set VITE_SPONSOR_PAYMASTER_<net>=https://relay.fairwins.app/v1/paymaster`);
  console.log(`  • fund the deposit + add paymasterDepositRunwayHrs to monitoring (see runbook)`);
  console.log(`  • npm run verify:${network}   (once the explorer indexes the contract)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
