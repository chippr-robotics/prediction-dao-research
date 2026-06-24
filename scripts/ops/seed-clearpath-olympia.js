/**
 * Spec 030 — seed the ClearPath ExternalDAORegistry with the real Olympia DAO so the feature has LIVE data.
 * Idempotent. Two steps, both as the deployer (which holds ROLE_MANAGER_ROLE on the MembershipManager):
 *   1. grant the deployer DAO_MEMBER_ROLE @ Silver (so it passes the registry's tier gate)
 *   2. register the live OlympiaGovernor as an external OZ-Governor DAO
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/ops/seed-clearpath-olympia.js --network mordor
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { getDeploymentFilename } = require("../deploy/lib/helpers");

// OlympiaGovernor — verified live on Mordor (name() == "OlympiaGovernor", answers IGovernor views).
const OLYMPIA_GOVERNOR_MORDOR = "0xB85dbc899472756470EF4033b9637ff8fa2FD23D";
const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };

async function main() {
  const network = await ethers.provider.getNetwork();
  const [deployer] = await ethers.getSigners();
  const filename = getDeploymentFilename(network, "v2");
  const record = JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployments", filename), "utf8"));
  const c = record.contracts || {};
  if (!c.externalDAORegistry) throw new Error("externalDAORegistry not deployed on this network");

  console.log(`Network ${hre.network.name} (${network.chainId}) · deployer ${deployer.address}`);
  const membership = await ethers.getContractAt("MembershipManager", c.membershipManager);
  const registry = await ethers.getContractAt("ExternalDAORegistry", c.externalDAORegistry);
  const role = await registry.DAO_MEMBER_ROLE();

  // 1) Ensure the deployer has >= Silver for DAO_MEMBER_ROLE.
  const tier = Number(await membership.getActiveTier(deployer.address, role));
  if (tier < Tier.Silver) {
    const roleMgr = await membership.ROLE_MANAGER_ROLE();
    if (!(await membership.hasRole(roleMgr, deployer.address))) {
      throw new Error("deployer lacks ROLE_MANAGER_ROLE on MembershipManager — cannot grant the tier");
    }
    console.log("Granting deployer DAO_MEMBER_ROLE @ Silver (365d)...");
    const tx = await membership.grantMembership(deployer.address, role, Tier.Silver, 365);
    await tx.wait();
    console.log("  ✓ granted");
  } else {
    console.log(`Deployer already has tier ${tier} for DAO_MEMBER_ROLE`);
  }

  // 2) Register Olympia (idempotent).
  if (await registry.isRegistered(OLYMPIA_GOVERNOR_MORDOR)) {
    console.log("Olympia already registered.");
  } else {
    console.log(`Registering OlympiaGovernor ${OLYMPIA_GOVERNOR_MORDOR}...`);
    const tx = await registry.registerExternalDAO(OLYMPIA_GOVERNOR_MORDOR, 0 /* OZGovernor */, "Olympia DAO");
    await tx.wait();
    console.log("  ✓ registered");
  }

  console.log(`externalCount now: ${(await registry.externalCount()).toString()}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
