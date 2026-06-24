/**
 * Targeted spec-028 deploy: add the TokenFactory + clone templates to an ALREADY-deployed network WITHOUT
 * touching the existing core contracts. Reuses the network's recorded SanctionsGuard and APPENDS the new
 * addresses to its `deployments/<net>-chain<id>-v2.json` record (never overwrites — so the live membership/
 * wager UUPS proxies are preserved).
 *
 * Use this (not deploy.js) to bring token issuance to a network where the rest of the stack already exists —
 * deploy.js mints fresh proxies and would strand the existing deployment.
 *
 *   GAS_PRICE_WEI=100000000000 npx hardhat run scripts/deploy/deploy-token-factory.js --network mordor
 *
 * Then: npm run sync:frontend-contracts:<net>  (frontend picks up the tokenFactory address).
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { SALT_PREFIXES } = require("./lib/constants");
const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
} = require("./lib/helpers");
const { deployProxy } = require("./lib/upgradeable");

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("=".repeat(60));
  console.log(`Token issuance (spec 028) — targeted append-only deploy`);
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)}`);

  // Load the existing deployment record; we APPEND to it.
  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const contracts = record.contracts || (record.contracts = {});

  const sanctionsGuard = contracts.sanctionsGuard;
  if (!sanctionsGuard || !ethers.isAddress(sanctionsGuard)) {
    throw new Error(`No sanctionsGuard in deployments/${filename}; cannot wire token sanctions screening.`);
  }
  console.log(`Reusing SanctionsGuard: ${sanctionsGuard}`);

  if (contracts.tokenFactory) {
    console.log(`\n⚠️  tokenFactory already recorded (${contracts.tokenFactory}). To change logic, run an`);
    console.log(`   in-place upgrade (lib/upgradeable.js upgradeProxy), not this script. Aborting.`);
    return;
  }

  await ensureSingletonFactory();

  // 1) Immutable clone templates (deterministic; constructors disable initializers).
  console.log("\nDeploying token templates...");
  const openERC20Tpl = await deployDeterministic("OpenERC20", [], generateSalt(SALT_PREFIXES.V2 + "OpenERC20"), deployer);
  const openERC721Tpl = await deployDeterministic("OpenERC721", [], generateSalt(SALT_PREFIXES.V2 + "OpenERC721"), deployer);
  const restrictedERC20Tpl = await deployDeterministic("RestrictedERC20", [], generateSalt(SALT_PREFIXES.V2 + "RestrictedERC20"), deployer);

  // 2) TokenFactory behind a UUPS proxy, wired to the existing guard.
  console.log("\nDeploying TokenFactory behind a UUPS proxy...");
  const proxy = await deployProxy({
    name: "TokenFactory",
    initArgs: [deployer.address, sanctionsGuard, openERC20Tpl.address, openERC721Tpl.address, restrictedERC20Tpl.address],
  });
  if (typeof deployer.reset === "function") deployer.reset();

  // 3) Grant the deployer the issuer role so issuance is usable immediately.
  const factory = proxy.contract;
  const issuerRole = await factory.TOKEN_ISSUER_ROLE();
  if (!(await factory.hasRole(issuerRole, deployer.address))) {
    const tx = await factory.connect(deployer).grantRole(issuerRole, deployer.address);
    await tx.wait();
    console.log("  ✓ TOKEN_ISSUER_ROLE granted to deployer");
  }

  // 4) APPEND to the record (preserve everything already there).
  contracts.tokenFactory = proxy.proxy;
  contracts.tokenFactoryImpl = proxy.implementation;
  contracts.openERC20Impl = openERC20Tpl.address;
  contracts.openERC721Impl = openERC721Tpl.address;
  contracts.restrictedERC20Impl = restrictedERC20Tpl.address;
  record.constructorArgs = record.constructorArgs || {};
  Object.assign(record.constructorArgs, {
    tokenFactoryImpl: [],
    openERC20Impl: [],
    openERC721Impl: [],
    restrictedERC20Impl: [],
  });
  record.tokenMintDeployedAt = new Date().toISOString();
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename);
  console.log("=".repeat(60));
  console.log(`  tokenFactory       ${contracts.tokenFactory}`);
  console.log(`  tokenFactoryImpl   ${contracts.tokenFactoryImpl}`);
  console.log(`  openERC20Impl      ${contracts.openERC20Impl}`);
  console.log(`  openERC721Impl     ${contracts.openERC721Impl}`);
  console.log(`  restrictedERC20Impl ${contracts.restrictedERC20Impl}`);
  console.log(`\nNext: npm run sync:frontend-contracts:${networkName === "mordor" ? "" : networkName} (frontend reads the address)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
