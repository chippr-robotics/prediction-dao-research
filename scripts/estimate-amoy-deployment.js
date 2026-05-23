/**
 * estimate-amoy-deployment.js — Estimate Amoy deployment cost in POL
 *
 * Deploys the current v2 contract set to an in-process Hardhat network,
 * captures real gas used for each contract and each post-deploy
 * configuration tx, then multiplies by the live Amoy gas price.
 *
 * Mirrors scripts/deploy/deploy.js, so the number reflects what
 *   npx hardhat run scripts/deploy/deploy.js --network amoy
 * actually spends.
 *
 * Usage:
 *   npx hardhat run scripts/estimate-amoy-deployment.js
 */

const { ethers } = require("hardhat");

const {
  WAGER_PARTICIPANT_TIERS,
  ROLE_HASHES,
  CHAINLINK_DATA_FEEDS,
  CHAINLINK_FUNCTIONS_ROUTER,
  UMA_OOV3,
} = require("./deploy/lib/constants");

const AMOY_RPC = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";

// Singleton-factory CALL adds a constant overhead per deterministic deploy
// (CALL + memory expansion + the factory's CREATE2). Empirically ~55k on top
// of the raw CREATE cost.
const SINGLETON_FACTORY_OVERHEAD = 55_000n;

// ResolutionType enum ordinals (must match IWagerRegistry.sol)
const RT = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4, ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7 };

const USDC_DECIMALS = 6;
function toUSDC(price18) { return price18 / (10n ** 12n); }

async function deploy(name, args = []) {
  const factory = await ethers.getContractFactory(name);
  const contract = await factory.deploy(...args);
  const receipt = await contract.deploymentTransaction().wait();
  return { name, gasUsed: receipt.gasUsed, address: await contract.getAddress(), contract };
}

async function sendTx(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return { name: label, gasUsed: receipt.gasUsed };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = deployer.address;
  const NETWORK = "amoy";

  console.log("Deploying current v2 contracts to in-process Hardhat to measure gas...\n");
  const deploys = [];
  const txs = [];

  // Amoy has no canonical Polymarket CTF — deploy a mock per deploy.js.
  const mockCTF = await deploy("MockPolymarketCTF"); deploys.push(mockCTF);

  // PolymarketOracleAdapter
  const adapter = await deploy("PolymarketOracleAdapter", [mockCTF.address]);
  deploys.push(adapter);

  // Configured Amoy tokens (used in ctors only; no transfers happen here)
  const AMOY_USDC = "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582";
  const AMOY_WMATIC = "0x0ae690AAD8663aaB12a671A6A0d74242332de85f";

  // MembershipManager (now AccessControl-based — "role manager" refactor lives here)
  const mgr = await deploy("MembershipManager", [deployer.address, AMOY_USDC, treasury]);
  deploys.push(mgr);

  // Seed WAGER_PARTICIPANT tiers (4 transactions — replaces the old 8 from
  // FRIEND_MARKET + MARKET_MAKER).
  for (const cfg of WAGER_PARTICIPANT_TIERS) {
    const limits = {
      monthlyMarketCreation: cfg.limits.monthlyMarketCreation > 2n ** 32n - 1n ? 0 : Number(cfg.limits.monthlyMarketCreation),
      maxConcurrentMarkets:  cfg.limits.maxConcurrentMarkets  > 2n ** 32n - 1n ? 0 : Number(cfg.limits.maxConcurrentMarkets),
    };
    txs.push(await sendTx(
      `setTier WAGER_PARTICIPANT tier=${cfg.tier}`,
      mgr.contract.setTier(ROLE_HASHES.WAGER_PARTICIPANT_ROLE, cfg.tier, toUSDC(cfg.price), 30, limits, true),
    ));
  }

  // WagerRegistry (AccessControl + GUARDIAN + ACCOUNT_MODERATOR roles)
  const reg = await deploy("WagerRegistry", [deployer.address, mgr.address, adapter.address, [AMOY_USDC, AMOY_WMATIC]]);
  deploys.push(reg);

  txs.push(await sendTx(
    "setAuthorizedCaller(WagerRegistry)",
    mgr.contract.setAuthorizedCaller(reg.address, true),
  ));

  // --- Chainlink Data Feed adapter (Amoy has ETH/USD configured) ---
  const cl = await deploy("ChainlinkDataFeedOracleAdapter"); deploys.push(cl);
  const feedMap = CHAINLINK_DATA_FEEDS[NETWORK] || {};
  for (const [pair, addr] of Object.entries(feedMap)) {
    txs.push(await sendTx(`setFeedAllowed Chainlink ${pair}`, cl.contract.setFeedAllowed(addr, true)));
  }
  txs.push(await sendTx(
    "setOracleAdapter(ChainlinkDataFeed)",
    reg.contract.setOracleAdapter(RT.ChainlinkDataFeed, cl.address),
  ));

  // --- Chainlink Functions adapter ---
  const fnRouter = CHAINLINK_FUNCTIONS_ROUTER[NETWORK];
  // deploy.js requires a real router; on Amoy this is the canonical address.
  // To measure deploy gas on in-process Hardhat where that router doesn't
  // exist, deploy MockFunctionsRouter and use its address.
  const mockRouter = await deploy("MockFunctionsRouter"); deploys.push(mockRouter);
  const fn = await deploy("ChainlinkFunctionsOracleAdapter", [mockRouter.address]); deploys.push(fn);
  txs.push(await sendTx(
    "setOracleAdapter(ChainlinkFunctions)",
    reg.contract.setOracleAdapter(RT.ChainlinkFunctions, fn.address),
  ));

  // --- UMA Optimistic Oracle V3 adapter ---
  // Same mock-routing trick — UMA OOv3 on Amoy is real, but here we use a mock
  // to satisfy the constructor and measure deploy gas faithfully.
  const mockOO = await deploy("MockOptimisticOracleV3"); deploys.push(mockOO);
  const uma = await deploy("UMAOptimisticOracleV3Adapter", [mockOO.address]); deploys.push(uma);
  txs.push(await sendTx(
    "setOracleAdapter(UMA)",
    reg.contract.setOracleAdapter(RT.UMA, uma.address),
  ));

  // KeyRegistry
  const key = await deploy("KeyRegistry"); deploys.push(key);

  // One-time Safe Singleton Factory bootstrap on a clean network (~60k @ 100 gwei).
  const SINGLETON_FACTORY_DEPLOY_GAS = 60_000n;

  // --- Live Amoy gas price ---
  console.log("\nFetching Amoy gas price from", AMOY_RPC);
  const amoy = new ethers.JsonRpcProvider(AMOY_RPC);
  const fee = await amoy.getFeeData();
  const gasPriceWei = fee.maxFeePerGas ?? fee.gasPrice;
  console.log("Amoy maxFeePerGas:", ethers.formatUnits(gasPriceWei, "gwei"), "gwei");
  console.log("Amoy gasPrice:    ", ethers.formatUnits(fee.gasPrice, "gwei"), "gwei");

  // --- Drop mock-only rows from the cost roll-up but show them in the table ---
  // On real Amoy, MockFunctionsRouter and MockOptimisticOracleV3 are NOT
  // deployed (the real router/OO already exist). We exclude them from the
  // total but list them for transparency.
  const MOCKS_NOT_ON_AMOY = new Set(["MockFunctionsRouter", "MockOptimisticOracleV3"]);

  console.log("\nContract deploys (gas, including singleton-factory CALL overhead):");
  console.log("─".repeat(82));
  console.log("%s  %s  %s  %s", "Contract".padEnd(40), "Gas (raw)".padStart(12), "Gas +fac".padStart(12), "On Amoy?".padStart(10));
  console.log("─".repeat(82));
  let deployGas = 0n;
  for (const r of deploys) {
    const adjusted = r.gasUsed + SINGLETON_FACTORY_OVERHEAD;
    const includeOnAmoy = !MOCKS_NOT_ON_AMOY.has(r.name);
    if (includeOnAmoy) deployGas += adjusted;
    console.log(
      "%s  %s  %s  %s",
      r.name.padEnd(40),
      r.gasUsed.toString().padStart(12),
      adjusted.toString().padStart(12),
      (includeOnAmoy ? "yes" : "skip").padStart(10),
    );
  }

  console.log("\nPost-deploy configuration txs:");
  console.log("─".repeat(82));
  let txGas = 0n;
  for (const t of txs) {
    txGas += t.gasUsed;
    console.log("%s  %s", t.name.padEnd(50), t.gasUsed.toString().padStart(12));
  }

  const totalGas = deployGas + txGas + SINGLETON_FACTORY_DEPLOY_GAS;
  console.log("\n" + "─".repeat(82));
  console.log("%s  %s", "Contract-deploy gas subtotal (Amoy)".padEnd(50), deployGas.toString().padStart(12));
  console.log("%s  %s", "Post-deploy tx gas subtotal".padEnd(50), txGas.toString().padStart(12));
  console.log("%s  %s", "Safe Singleton Factory bootstrap (one-time)".padEnd(50), SINGLETON_FACTORY_DEPLOY_GAS.toString().padStart(12));
  console.log("%s  %s", "TOTAL".padEnd(50), totalGas.toString().padStart(12));

  // --- Cost in POL ---
  const lowGwei = 30n;
  const highGwei = 100n;

  const costLow  = totalGas * lowGwei * 10n**9n;
  const costMid  = totalGas * gasPriceWei;
  const costHigh = totalGas * highGwei * 10n**9n;

  console.log("\nDeployment cost estimates (total gas =", totalGas.toString(), ")");
  console.log("─".repeat(82));
  console.log(`  @  30 gwei (low):      ${ethers.formatEther(costLow)} POL`);
  console.log(`  @ ~${ethers.formatUnits(gasPriceWei, "gwei")} gwei (live):  ${ethers.formatEther(costMid)} POL`);
  console.log(`  @ 100 gwei (high):     ${ethers.formatEther(costHigh)} POL`);

  console.log("\nNotes:");
  console.log("  • Excludes MockFunctionsRouter + MockOptimisticOracleV3 (real ones exist on Amoy).");
  console.log("  • Assumes Amoy USDC + WMATIC are used (no MockERC20 deploys).");
  console.log("  • Re-running on already-deployed CREATE2 addresses is free (SingletonFactory short-circuits).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
