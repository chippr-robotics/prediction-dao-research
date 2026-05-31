/**
 * deploy.js - P2P Betting v2 Deployment
 *
 * Replaces 01-06. Deploys the three-contract architecture deterministically
 * via the Safe Singleton Factory, seeds tier configs, and writes the deployment
 * record to deployments/<network>-chain<id>-v2.json.
 *
 * Deployed:
 *   - PolymarketOracleAdapter (or MockPolymarketCTF first if needed)
 *   - MembershipManager (seeds WAGER_PARTICIPANT tiers at $2/$8/$25/$100)
 *   - WagerRegistry (allowlists USDC + WMATIC; admin seeded with GUARDIAN +
 *     ACCOUNT_MODERATOR + DEFAULT_ADMIN roles)
 *   - KeyRegistry
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy.js --network localhost
 *   npx hardhat run scripts/deploy/deploy.js --network amoy
 *
 *   MOCK_POLYMARKET=true     - force deploy a MockPolymarketCTF (used on Amoy
 *                              when no canonical Polymarket CTF exists)
 *   POLYMARKET_CTF=0x...     - override CTF address
 *   TREASURY=0x...           - treasury address (defaults to deployer)
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const path = require("path");

const {
  SALT_PREFIXES,
  TOKENS,
  POLYMARKET_CTF,
  CHAINLINK_FUNCTIONS_ROUTER,
  CHAINLINK_DATA_FEEDS,
  UMA_OOV3,
  WAGER_PARTICIPANT_TIERS,
  MAINNET_CHAIN_IDS,
  ROLE_HASHES,
  SINGLETON_FACTORY_ADDRESS,
} = require("./lib/constants");

// ResolutionType enum ordinals (must match IWagerRegistry.sol)
const RT = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4, ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7 };

const {
  generateSalt,
  deployDeterministic,
  ensureSingletonFactory,
  saveDeployment,
  getDeploymentFilename,
} = require("./lib/helpers");

const USDC_DECIMALS = 6;

// Convert a tier config's price (currently in 18-decimal ethers) to 6-decimal USDC.
// e.g. ethers.parseEther("50") → 50 * 10^6 = 50000000
function toUSDC(price18) {
  return price18 / (10n ** 12n);
}

async function resolvePolymarketCTF(networkName, deployer, saltPrefix) {
  const envOverride = process.env.POLYMARKET_CTF;
  if (envOverride && ethers.isAddress(envOverride)) {
    console.log(`Using POLYMARKET_CTF override: ${envOverride}`);
    return envOverride;
  }

  const configured = POLYMARKET_CTF[networkName];
  if (configured) {
    console.log(`Using configured Polymarket CTF for ${networkName}: ${configured}`);
    return configured;
  }

  const mockFlag = String(process.env.MOCK_POLYMARKET || "").toLowerCase() === "true";
  const isProd = networkName === "polygon";
  if (!mockFlag && !isProd) {
    console.log(`No Polymarket CTF configured for ${networkName}; deploying MockPolymarketCTF (set MOCK_POLYMARKET=false to skip)`);
  } else if (!mockFlag && isProd) {
    throw new Error(`Polymarket CTF address required for production network '${networkName}'. Set POLYMARKET_CTF env var.`);
  }

  const mock = await deployDeterministic(
    "MockPolymarketCTF",
    [],
    generateSalt(saltPrefix + "MockPolymarketCTF"),
    deployer
  );
  return mock.address;
}

async function seedTiers(membershipManager, deployer, role, label, tierConfigs) {
  console.log(`\nSeeding tiers for ${label}...`);
  for (const cfg of tierConfigs) {
    const priceUSDC = toUSDC(cfg.price);
    const limits = {
      monthlyMarketCreation:
        cfg.limits.monthlyMarketCreation > 2n ** 32n - 1n
          ? 0  // unlimited
          : Number(cfg.limits.monthlyMarketCreation),
      maxConcurrentMarkets:
        cfg.limits.maxConcurrentMarkets > 2n ** 32n - 1n
          ? 0
          : Number(cfg.limits.maxConcurrentMarkets),
    };
    const tierNames = ["NONE", "BRONZE", "SILVER", "GOLD", "PLATINUM"];
    console.log(`  ${label} ${tierNames[cfg.tier]}: ${ethers.formatUnits(priceUSDC, USDC_DECIMALS)} USDC, ${limits.monthlyMarketCreation || "∞"}/mo, ${limits.maxConcurrentMarkets || "∞"} concurrent`);
    const tx = await membershipManager.connect(deployer).setTier(
      role,
      cfg.tier,
      priceUSDC,
      30, // durationDays
      limits,
      true // active
    );
    await tx.wait();
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("P2P Betting v2 Deployment");
  console.log("=".repeat(60));

  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);
  console.log(`\nNetwork: ${networkName} (chainId ${chainId})`);

  if (MAINNET_CHAIN_IDS.includes(chainId)) {
    if (!process.env.CONFIRM_MAINNET) {
      throw new Error("Mainnet deployment requires CONFIRM_MAINNET=true env var.");
    }
  }

  await ensureSingletonFactory();

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error(`No signer for network '${networkName}'`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`\nDeployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} ${networkName === "amoy" ? "POL" : "ETH"}`);

  const treasury = process.env.TREASURY && ethers.isAddress(process.env.TREASURY)
    ? process.env.TREASURY
    : deployer.address;
  console.log(`Treasury: ${treasury}`);

  // -------- Resolve token addresses --------
  let usdc = TOKENS[networkName]?.USC;
  let wmatic = TOKENS[networkName]?.WMATIC;
  const deployments = {};

  // Never let a mainnet deployment fall back to a worthless MockERC20 as the
  // stake token. On a recognised mainnet (see MAINNET_CHAIN_IDS) a real token
  // address is mandatory — configure TOKENS[network] in lib/constants.js.
  const isMainnet = MAINNET_CHAIN_IDS.includes(chainId);
  if (isMainnet && (!usdc || !wmatic)) {
    throw new Error(
      `Real token addresses are required on mainnet '${networkName}' (chainId ${chainId}). ` +
        `Missing: ${[!usdc && "USDC", !wmatic && "WMATIC"].filter(Boolean).join(", ")}. ` +
        `Set TOKENS["${networkName}"] in scripts/deploy/lib/constants.js.`
    );
  }

  if (!usdc) {
    console.log(`\nNo USDC configured for ${networkName}; deploying MockERC20...`);
    const mock = await deployDeterministic(
      "MockERC20",
      ["USD Coin", "USDC", 0],
      generateSalt(SALT_PREFIXES.V2 + "MockUSDC"),
      deployer
    );
    usdc = mock.address;
    deployments.mockUSDC = mock.address;
  }
  if (!wmatic) {
    console.log(`\nNo WMATIC configured for ${networkName}; deploying MockERC20 (18 dec)...`);
    const mock = await deployDeterministic(
      "MockERC20",
      ["Wrapped Matic", "WMATIC", 0],
      generateSalt(SALT_PREFIXES.V2 + "MockWMATIC"),
      deployer
    );
    wmatic = mock.address;
    deployments.mockWMATIC = mock.address;
  }
  console.log(`USDC:   ${usdc}`);
  console.log(`WMATIC: ${wmatic}`);

  // -------- Polymarket CTF + Adapter --------
  const polymarketCTF = await resolvePolymarketCTF(networkName, deployer, SALT_PREFIXES.V2);
  console.log(`Polymarket CTF: ${polymarketCTF}`);
  if (deployments.mockUSDC || polymarketCTF !== POLYMARKET_CTF[networkName]) {
    deployments.polymarketCTF = polymarketCTF;
  }

  const adapter = await deployDeterministic(
    "PolymarketOracleAdapter",
    [polymarketCTF],
    generateSalt(SALT_PREFIXES.V2 + "PolymarketOracleAdapter"),
    deployer
  );
  deployments.polymarketAdapter = adapter.address;

  // -------- MembershipManager --------
  const mgrDeploy = await deployDeterministic(
    "MembershipManager",
    [deployer.address, usdc, treasury],
    generateSalt(SALT_PREFIXES.V2 + "MembershipManager"),
    deployer
  );
  deployments.membershipManager = mgrDeploy.address;
  const membershipManager = mgrDeploy.contract;

  if (!mgrDeploy.alreadyDeployed) {
    await seedTiers(membershipManager, deployer, ROLE_HASHES.WAGER_PARTICIPANT_ROLE, "WAGER_PARTICIPANT", WAGER_PARTICIPANT_TIERS);
  } else {
    console.log("\nMembershipManager already deployed — skipping tier seed (idempotent re-runs should re-seed manually if config changed)");
  }

  // -------- WagerRegistry --------
  // Salt suffix bumped (`-userindex`) when the per-user EnumerableSet index was added
  // to force a fresh deterministic address; old wagers stay on the prior registry.
  const regDeploy = await deployDeterministic(
    "WagerRegistry",
    [deployer.address, mgrDeploy.address, adapter.address, [usdc, wmatic]],
    generateSalt(SALT_PREFIXES.V2 + "WagerRegistry-userindex"),
    deployer
  );
  deployments.wagerRegistry = regDeploy.address;

  if (!regDeploy.alreadyDeployed) {
    console.log("\nAuthorizing WagerRegistry on MembershipManager...");
    const tx = await membershipManager.connect(deployer).setAuthorizedCaller(regDeploy.address, true);
    await tx.wait();
    console.log("  ✓ WagerRegistry can call recordCreate/recordClose");
  }
  const wagerRegistry = regDeploy.contract;

  // -------- Chainlink + UMA oracle adapters --------
  // Each adapter is only deployed when its required network config resolves.
  // Skipped adapters log a reason; the WagerRegistry just won't accept that
  // ResolutionType on this network until the address gets filled in later.
  const oracleDeployments = {};

  // Chainlink Data Feeds
  const feedMap = CHAINLINK_DATA_FEEDS[networkName] || {};
  if (Object.keys(feedMap).length > 0) {
    const cl = await deployDeterministic(
      "ChainlinkDataFeedOracleAdapter",
      [deployer.address],
      generateSalt(SALT_PREFIXES.V2 + "ChainlinkDataFeedOracleAdapter"),
      deployer
    );
    oracleDeployments.chainlinkDataFeedAdapter = cl.address;
    deployments.chainlinkDataFeedAdapter = cl.address;
    if (!cl.alreadyDeployed) {
      // Allowlist every feed configured for this network
      for (const [pair, addr] of Object.entries(feedMap)) {
        const tx = await cl.contract.connect(deployer).setFeedAllowed(addr, true);
        await tx.wait();
        console.log(`  ✓ allowlisted Chainlink ${pair}: ${addr}`);
      }
    }
    if (!cl.alreadyDeployed || !regDeploy.alreadyDeployed) {
      const wireTx = await wagerRegistry.connect(deployer).setOracleAdapter(RT.ChainlinkDataFeed, cl.address);
      await wireTx.wait();
      console.log(`  ✓ ChainlinkDataFeedOracleAdapter wired into WagerRegistry`);
    }
  } else {
    console.log(`Skipping ChainlinkDataFeedOracleAdapter on ${networkName}: no feeds configured`);
  }

  // Chainlink Functions
  const fnRouter = CHAINLINK_FUNCTIONS_ROUTER[networkName];
  if (fnRouter && ethers.isAddress(fnRouter)) {
    const fn = await deployDeterministic(
      "ChainlinkFunctionsOracleAdapter",
      [deployer.address, fnRouter],
      generateSalt(SALT_PREFIXES.V2 + "ChainlinkFunctionsOracleAdapter"),
      deployer
    );
    oracleDeployments.chainlinkFunctionsAdapter = fn.address;
    deployments.chainlinkFunctionsAdapter = fn.address;
    if (!fn.alreadyDeployed || !regDeploy.alreadyDeployed) {
      const wireTx = await wagerRegistry.connect(deployer).setOracleAdapter(RT.ChainlinkFunctions, fn.address);
      await wireTx.wait();
      console.log(`  ✓ ChainlinkFunctionsOracleAdapter wired into WagerRegistry`);
      if (!fn.alreadyDeployed) {
        console.log(`  ⚠️  add ${fn.address} as a consumer on your LINK subscription before calling registerCondition`);
      }
    }
  } else {
    console.log(`Skipping ChainlinkFunctionsOracleAdapter on ${networkName}: no router configured`);
  }

  // UMA Optimistic Oracle V3
  const ooAddr = UMA_OOV3[networkName];
  if (ooAddr && ethers.isAddress(ooAddr)) {
    const uma = await deployDeterministic(
      "UMAOptimisticOracleV3Adapter",
      [deployer.address, ooAddr],
      generateSalt(SALT_PREFIXES.V2 + "UMAOptimisticOracleV3Adapter"),
      deployer
    );
    oracleDeployments.umaAdapter = uma.address;
    deployments.umaAdapter = uma.address;
    if (!uma.alreadyDeployed || !regDeploy.alreadyDeployed) {
      const wireTx = await wagerRegistry.connect(deployer).setOracleAdapter(RT.UMA, uma.address);
      await wireTx.wait();
      console.log(`  ✓ UMAOptimisticOracleV3Adapter wired into WagerRegistry`);
    }
  } else {
    console.log(`Skipping UMAOptimisticOracleV3Adapter on ${networkName}: no OOv3 address configured`);
  }

  // -------- KeyRegistry --------
  const keyDeploy = await deployDeterministic(
    "KeyRegistry",
    [],
    generateSalt(SALT_PREFIXES.V2 + "KeyRegistry"),
    deployer
  );
  deployments.keyRegistry = keyDeploy.address;

  // -------- Summary --------
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Summary");
  console.log("=".repeat(60));
  console.log(`Network:           ${networkName} (chainId ${chainId})`);
  console.log(`Deployer:          ${deployer.address}`);
  console.log(`Treasury:          ${treasury}`);
  console.log(`Singleton Factory: ${SINGLETON_FACTORY_ADDRESS}`);
  console.log("\nAddresses:");
  for (const [k, v] of Object.entries(deployments)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log(`  USDC                   ${usdc}`);
  console.log(`  WMATIC                 ${wmatic}`);

  const record = {
    network: networkName,
    chainId,
    deployer: deployer.address,
    treasury,
    paymentToken: usdc,
    wmatic,
    polymarketCTF,
    contracts: {
      polymarketAdapter: adapter.address,
      membershipManager: mgrDeploy.address,
      wagerRegistry: regDeploy.address,
      keyRegistry: keyDeploy.address,
      ...oracleDeployments,
    },
    mocks: deployments.mockUSDC || deployments.mockWMATIC || deployments.polymarketCTF
      ? {
          mockUSDC: deployments.mockUSDC,
          mockWMATIC: deployments.mockWMATIC,
          mockPolymarketCTF: deployments.polymarketCTF,
        }
      : null,
    saltPrefix: SALT_PREFIXES.V2,
    timestamp: new Date().toISOString(),
  };

  saveDeployment(getDeploymentFilename(network, "v2"), record);
  console.log("\n✓ Deployment record saved");
  console.log("\nNext: run `npm run sync:frontend-contracts -- --network " + networkName + " --chainId " + chainId + "`");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
