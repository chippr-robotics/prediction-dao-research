/**
 * estimate-amoy-deployment.js — Estimate Amoy deployment cost in POL
 *
 * Deploys every contract from scripts/deploy/01..04 to an in-process Hardhat
 * network, captures real gas used, then multiplies by the live Amoy gas price.
 *
 * Usage:
 *   npx hardhat run scripts/estimate-amoy-deployment.js
 *   DEPLOY_PERPETUALS=true npx hardhat run scripts/estimate-amoy-deployment.js
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");

const AMOY_RPC = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";

// Singleton-factory CALL adds a constant overhead per deterministic deploy
// (CALL + memory expansion + the factory's CREATE2). Empirically ~55k on top
// of the raw CREATE cost. We add it per contract below.
const SINGLETON_FACTORY_OVERHEAD = 55_000n;

async function deploy(name, args = [], libraries = {}) {
  const factory = await ethers.getContractFactory(name, { libraries });
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  const receipt = await tx.wait();
  return { name, gasUsed: receipt.gasUsed, address: await contract.getAddress(), contract };
}

async function tryInit(c, ...args) {
  try {
    if (typeof c.initialize === "function") {
      const tx = await c.initialize(...args);
      await tx.wait();
    }
  } catch {}
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const includePerpetuals = (process.env.DEPLOY_PERPETUALS ?? "false").toLowerCase() === "true";
  const PLACEHOLDER = "0xec6Ed68627749b9C244a25A6d0bAC8962043fdcB";
  const TREASURY = "0x93F7ee39C02d99289E3c29696f1F3a70656d0772";

  console.log("Deploying contracts to in-process Hardhat to measure gas...\n");
  const results = [];

  // 01-core
  const rmc = await deploy("RoleManagerCore"); results.push(rmc);
  const welfare = await deploy("WelfareMetricRegistry"); results.push(welfare);
  const proposals = await deploy("ProposalRegistry"); results.push(proposals);
  const cmf = await deploy("ConditionalMarketFactory"); results.push(cmf);
  const privacy = await deploy("PrivacyCoordinator"); results.push(privacy);
  const oracle = await deploy("OracleResolver"); results.push(oracle);
  const ragequit = await deploy("RagequitModule"); results.push(ragequit);
  await tryInit(ragequit.contract, deployer.address, PLACEHOLDER, TREASURY);
  const futarchy = await deploy("FutarchyGovernor"); results.push(futarchy);
  const tmf = await deploy("TokenMintFactory", [rmc.address]); results.push(tmf);
  const daoFactory = await deploy(
    "DAOFactory",
    [welfare.address, proposals.address, cmf.address, privacy.address, oracle.address, ragequit.address, futarchy.address]
  );
  results.push(daoFactory);

  // 02-rbac
  const trm = await deploy("TieredRoleManager"); results.push(trm);
  const tierRegistry = await deploy("TierRegistry"); results.push(tierRegistry);
  const usage = await deploy("UsageTracker"); results.push(usage);
  const membership = await deploy("MembershipManager"); results.push(membership);
  const payment = await deploy("PaymentProcessor"); results.push(payment);
  const mpm = await deploy("MembershipPaymentManager", [TREASURY]); results.push(mpm);

  // 03-markets (libraries first)
  const ctf = await deploy("CTF1155"); results.push(ctf);
  const fgrLib = await deploy("FriendGroupResolutionLib"); results.push(fgrLib);
  const fgcLib = await deploy("FriendGroupClaimsLib"); results.push(fgcLib);
  const fgcrLib = await deploy("FriendGroupCreationLib"); results.push(fgcrLib);
  const fgmf = await deploy(
    "FriendGroupMarketFactory",
    [cmf.address, ragequit.address, trm.address, mpm.address, deployer.address],
    {
      FriendGroupResolutionLib: fgrLib.address,
      FriendGroupClaimsLib: fgcLib.address,
      FriendGroupCreationLib: fgcrLib.address,
    }
  );
  results.push(fgmf);

  // 04-registries
  const correlation = await deploy("MarketCorrelationRegistry"); results.push(correlation);
  const nullifier = await deploy("NullifierRegistry"); results.push(nullifier);

  // Optional perpetuals
  if (includePerpetuals) {
    const fre = await deploy("FundingRateEngine"); results.push(fre);
    const perp = await deploy(
      "PerpetualFuturesFactory",
      [fre.address, deployer.address, deployer.address]
    );
    results.push(perp);
  }

  // Fetch live Amoy gas price
  console.log("\nFetching Amoy gas price from", AMOY_RPC);
  const amoy = new ethers.JsonRpcProvider(AMOY_RPC);
  const fee = await amoy.getFeeData();
  // Use maxFeePerGas (EIP-1559 ceiling) if available, else gasPrice
  const gasPriceWei = fee.maxFeePerGas ?? fee.gasPrice;
  console.log("Amoy maxFeePerGas:", ethers.formatUnits(gasPriceWei, "gwei"), "gwei");
  console.log("Amoy gasPrice:    ", ethers.formatUnits(fee.gasPrice, "gwei"), "gwei");

  // Report
  let totalGas = 0n;
  console.log("\n%s  %s  %s", "Contract".padEnd(34), "Gas (raw)".padStart(12), "Gas +factory".padStart(14));
  console.log("─".repeat(66));
  for (const r of results) {
    const adjusted = r.gasUsed + SINGLETON_FACTORY_OVERHEAD;
    totalGas += adjusted;
    console.log(
      "%s  %s  %s",
      r.name.padEnd(34),
      r.gasUsed.toString().padStart(12),
      adjusted.toString().padStart(14)
    );
  }
  console.log("─".repeat(66));
  console.log("%s  %s  %s", "TOTAL".padEnd(34), "".padStart(12), totalGas.toString().padStart(14));

  // Cost in POL using two gas-price scenarios
  const lowGwei = 30n;       // typical Amoy floor
  const midPriceWei = gasPriceWei;
  const highGwei = 100n;     // congested

  const costLow  = totalGas * lowGwei * 10n**9n;
  const costMid  = totalGas * midPriceWei;
  const costHigh = totalGas * highGwei * 10n**9n;

  console.log("\nDeployment cost estimates (total gas =", totalGas.toString(), ")");
  console.log("─".repeat(66));
  console.log(`  @  30 gwei (low):     ${ethers.formatEther(costLow)} POL`);
  console.log(`  @ ~${ethers.formatUnits(midPriceWei, "gwei")} gwei (live): ${ethers.formatEther(costMid)} POL`);
  console.log(`  @ 100 gwei (high):    ${ethers.formatEther(costHigh)} POL`);

  console.log("\nNote: gas figures include constructor execution but exclude post-deploy");
  console.log("configuration txs (setCTF1155, setDefaultCollateralToken, role grants, etc).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
