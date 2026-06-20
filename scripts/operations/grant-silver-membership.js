/**
 * Grant a WAGER_PARTICIPANT membership for testing (default tier: Silver, so the grantee can create
 * open challenges — feature 024 FR-005a). Reads the MembershipManager address from the network's
 * deployments record. The signer must hold ROLE_MANAGER_ROLE (the deployer does).
 *
 * Usage:
 *   GRANT_TO=0xabc... GRANT_TIER=2 GRANT_DAYS=365 npx hardhat run scripts/operations/grant-silver-membership.js --network mordor
 *   (defaults: GRANT_TO = the signer, GRANT_TIER = 2 [Silver], GRANT_DAYS = 365)
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  // Find the deployments record for this chain.
  const dir = path.join(process.cwd(), "deployments");
  const file = fs.readdirSync(dir).find((f) => f.includes(`chain${chainId}`) && f.endsWith(".json"));
  if (!file) throw new Error(`No deployments record for chain ${chainId}`);
  const record = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const mmAddr = record.contracts?.membershipManager || record.membershipManager;
  if (!mmAddr) throw new Error("membershipManager not found in deployments record");

  const to = process.env.GRANT_TO || signer.address;
  const tier = Number(process.env.GRANT_TIER || 2); // Silver
  const days = Number(process.env.GRANT_DAYS || 365);

  const mm = await ethers.getContractAt("MembershipManager", mmAddr);
  console.log(`MembershipManager ${mmAddr} (chain ${chainId})`);
  console.log(`Granting ${TIER_NAMES[tier]} (tier ${tier}) WAGER_PARTICIPANT to ${to} for ${days} days…`);

  const overrides = process.env.GAS_PRICE_WEI ? { gasPrice: BigInt(process.env.GAS_PRICE_WEI) } : {};
  const tx = await mm.connect(signer).grantMembership(to, WAGER_PARTICIPANT_ROLE, tier, days, overrides);
  console.log(`  tx: ${tx.hash}`);
  await tx.wait();

  const active = await mm.getActiveTier(to, WAGER_PARTICIPANT_ROLE);
  console.log(`  ✓ active tier now: ${TIER_NAMES[Number(active)]} (${active})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
