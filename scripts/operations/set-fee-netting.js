/**
 * Spec 035 ops: configure atomic fee netting on the payment-carrying contracts (FR-015/FR-016).
 *
 * Fee netting makes the `…WithAuthorization` twins consume a SECOND, bounded EIP-3009 authorization
 * from the signer and forward it on-chain to a segregated fee recipient — never the relayer hot key
 * (spec 036 SC-015). Disabled (sponsored mode) by default.
 *
 *   FEE_ENABLED=true \
 *   FEE_RECIPIENT=0x... \
 *   FEE_MAX=1000000            # 1 USDC (6 decimals) per-tx ceiling \
 *   npx hardhat run scripts/operations/set-fee-netting.js --network <net>
 *
 * Signed by the floppy-keystore admin (DEFAULT_ADMIN_ROLE on both proxies). Note the WagerRegistry
 * setter lives on the intents facet — call it AT THE PROXY ADDRESS (served via the fallback).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { getDeploymentFilename } = require("../deploy/lib/helpers");

async function main() {
  const network = await ethers.provider.getNetwork();
  const [admin] = await ethers.getSigners();

  const enabled = String(process.env.FEE_ENABLED || "false") === "true";
  const recipient = process.env.FEE_RECIPIENT || ethers.ZeroAddress;
  const cap = BigInt(process.env.FEE_MAX || "0");
  if (enabled && (!ethers.isAddress(recipient) || recipient === ethers.ZeroAddress)) {
    throw new Error("FEE_ENABLED=true requires a non-zero FEE_RECIPIENT (segregated sink — NOT the relayer hot key)");
  }

  const filename = getDeploymentFilename(network, "v2");
  const record = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployments", filename), "utf8"));
  const c = record.contracts || {};

  console.log(`Fee netting on ${hre.network.name}: enabled=${enabled} recipient=${recipient} cap=${cap}`);

  // WagerRegistry: setFeeNetting is served by the intents facet at the PROXY address.
  const regIntents = await ethers.getContractAt("WagerRegistryIntents", c.wagerRegistry, admin);
  await (await regIntents.setFeeNetting(enabled, recipient, cap)).wait();
  console.log(`  ✓ WagerRegistry (${c.wagerRegistry})`);

  const mgr = await ethers.getContractAt("MembershipManager", c.membershipManager, admin);
  await (await mgr.setFeeNetting(enabled, recipient, cap)).wait();
  console.log(`  ✓ MembershipManager (${c.membershipManager})`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
