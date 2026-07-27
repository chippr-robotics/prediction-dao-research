/**
 * Deploy the FairWins admin Safe at the SAME address on every supported network.
 *
 * This vault is intended to hold DEFAULT_ADMIN / UPGRADER on the control-plane contracts, replacing
 * the single hot EOA (issue #966). It is a plain Safe v1.4.1 — we deploy it through the canonical
 * SafeProxyFactory with a FIXED initializer and salt, so CREATE2 lands it on an identical address
 * across chains. That matters operationally: one address to record, recognise and audit everywhere.
 *
 * ANY divergence in owners, order, threshold, fallback handler or salt produces a DIFFERENT address,
 * so all of those are pinned as constants below — never parameterise them per chain.
 *
 * Owner set is deliberate (see issue #966 discussion):
 *   0x5250…F6e1  hot EOA        — signs on every chain
 *   0x1215…8575  Ledger device  — signs on every chain
 *   0x4402…8eC5  passkey account — a CONTRACT, currently deployed on Polygon ONLY. A contract owner
 *                signs via EIP-1271, which requires code on that chain, so off Polygon this owner
 *                cannot approve. With threshold 2 that means the hot EOA and the Ledger are both
 *                required off Polygon — accepted knowingly; deploying passkeys to more chains
 *                restores the spare signer.
 *
 * Usage:
 *   npx hardhat run scripts/ops/deploy-admin-safe.js --network <net>            # deploy
 *   DRY_RUN=1 npx hardhat run scripts/ops/deploy-admin-safe.js --network <net>  # predict only
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;

// Canonical Safe v1.4.1 (identical on every Safe-Singleton-Factory chain).
const PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const SINGLETON_L2 = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

// ---- PINNED: changing ANY of these changes the resulting address on every chain ----
const OWNERS = [
  "0x52502d049571C7893447b86c4d8B38e6184bF6e1", // hot EOA
  "0x1215185387E70a48b07D73AcB67002A073F18575", // Ledger hardware device
  "0x4402e3A7ea161DC989bA8BD81d9ECA1bC2B58eC5", // passkey account (Polygon-only today)
];
const THRESHOLD = 2;
const SALT_NONCE = 68n; // spec 068
// -----------------------------------------------------------------------------------

const SAFE_SETUP_ABI = [
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
];
const FACTORY_ABI = [
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "function proxyCreationCode() view returns (bytes)",
];
const SAFE_READ_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function VERSION() view returns (string)",
];

const RECORD = path.join(__dirname, "..", "..", "deployments", "admin-safe.json");

function buildInitializer() {
  return new ethers.Interface(SAFE_SETUP_ABI).encodeFunctionData("setup", [
    OWNERS,
    THRESHOLD,
    ethers.ZeroAddress,
    "0x",
    FALLBACK_HANDLER,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);
}

/** Safe's own address derivation: salt = keccak(keccak(initializer) ++ saltNonce). */
async function predictAddress(factory, initializer) {
  const creationCode = await factory.proxyCreationCode();
  const deploymentData = ethers.concat([
    creationCode,
    ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [SINGLETON_L2]),
  ]);
  const salt = ethers.keccak256(
    ethers.concat([ethers.keccak256(initializer), ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [SALT_NONCE])]),
  );
  return ethers.getCreate2Address(PROXY_FACTORY, salt, ethers.keccak256(deploymentData));
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const dryRun = process.env.DRY_RUN === "1";
  const initializer = buildInitializer();
  const factory = new ethers.Contract(PROXY_FACTORY, FACTORY_ABI, ethers.provider);

  // Refuse to proceed on a chain without the canonical Safe set — a "deploy" there would either
  // revert or, worse, produce something that is not a Safe at the expected address.
  for (const [name, addr] of Object.entries({ PROXY_FACTORY, SINGLETON_L2, FALLBACK_HANDLER })) {
    if ((await ethers.provider.getCode(addr)) === "0x") {
      throw new Error(`${name} (${addr}) has no code on chain ${chainId} — refusing to deploy`);
    }
  }

  const predicted = await predictAddress(factory, initializer);
  console.log(`\nchain ${chainId} (${hre.network.name})`);
  console.log(`  owners:    ${OWNERS.join(", ")}`);
  console.log(`  threshold: ${THRESHOLD} of ${OWNERS.length}`);
  console.log(`  predicted: ${predicted}`);

  const existing = await ethers.provider.getCode(predicted);
  if (existing !== "0x") {
    const safe = new ethers.Contract(predicted, SAFE_READ_ABI, ethers.provider);
    const [owners, threshold, version] = await Promise.all([
      safe.getOwners(),
      safe.getThreshold(),
      safe.VERSION().catch(() => "?"),
    ]);
    console.log(`  ✓ already deployed — Safe v${version}, ${threshold}-of-${owners.length}`);
    return recordAddress(chainId, predicted, Number(threshold), owners);
  }

  if (dryRun) {
    console.log("  (DRY_RUN — nothing sent)");
    return;
  }

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`  deployer:  ${deployer.address} (${ethers.formatEther(bal)})`);

  const withSigner = factory.connect(deployer);
  const tx = await withSigner.createProxyWithNonce(SINGLETON_L2, initializer, SALT_NONCE);
  console.log(`  tx: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status === 0) throw new Error(`deploy reverted: ${receipt.hash}`);
  console.log(`  ✓ gas used: ${receipt.gasUsed}`);

  // Poll: a load-balanced RPC can serve the receipt from a node that has not yet indexed the code.
  let code = "0x";
  for (let i = 0; i < 10 && code === "0x"; i++) {
    code = await ethers.provider.getCode(predicted);
    if (code === "0x") await new Promise((r) => setTimeout(r, 3000));
  }
  if (code === "0x") throw new Error(`no code at ${predicted} after ${receipt.hash} — check an explorer`);

  const safe = new ethers.Contract(predicted, SAFE_READ_ABI, ethers.provider);
  const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
  console.log(`  ✓ deployed: ${predicted} — ${threshold}-of-${owners.length}`);
  recordAddress(chainId, predicted, Number(threshold), owners);
}

function recordAddress(chainId, address, threshold, owners) {
  const record = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, "utf8")) : { chains: {} };
  record.owners = OWNERS;
  record.threshold = THRESHOLD;
  record.saltNonce = String(SALT_NONCE);
  record.chains[chainId] = { address, threshold, owners: [...owners] };
  fs.writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n");
  console.log(`  recorded in deployments/admin-safe.json`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
