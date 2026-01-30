const { ethers } = require("hardhat");

/**
 * Garden of Eden - Create Demonstration Markets
 *
 * Creates all 120+ demonstration markets in a single batch run.
 * Uses market templates covering 7 categories with 2026 events.
 *
 * Features:
 * - Single batch creation of all markets
 * - IPFS metadata upload via Pinata (optional)
 * - Dry run mode for testing
 * - Progress tracking and statistics
 *
 * Usage:
 *   npx hardhat run scripts/operations/create-demo-markets.js --network mordor
 *
 * Environment Variables:
 *   - PINATA_API_KEY: Pinata API key for IPFS uploads
 *   - PINATA_SECRET_KEY: Pinata secret key
 *   - DRY_RUN: Set to "true" to simulate without transactions
 *   - CREATOR_PRIVATE_KEY: Private key for market creation (or use SEED_PLAYER_1)
 */

const {
  getAllTemplates,
  getTemplateStats,
  filterTemplates,
  buildMarketParams,
  calculateTotalLiquidity,
  calculateTradingPeriod,
  generateProposalId,
  sleep,
  BET_TYPE_LABELS,
  CATEGORY_NAMES,
} = require("./market-templates");

const { batchUploadMetadata, verifyPinataConnection } = require("./market-templates/ipfs");

// Contract addresses (Mordor testnet)
// These addresses match frontend/src/config/contracts.js - keep in sync!
const CONTRACTS = {
  conditionalMarketFactory: "0xc56631DB29c44bb553a511DD3d4b90d64C95Cd9C",
  ctf1155: "0xc7b69289c70f4b2f8FA860eEdE976E1501207DD9",
  tieredRoleManager: "0x55e6346Be542B13462De504FCC379a2477D227f0",
  usc: "0xDE093684c796204224BC081f937aa059D903c52a",
  marketCorrelationRegistry: "0x2a820A38997743fC3303cDcA56b996598963B909",
};

// OUTDATED - Do not use. Markets created here need to be cancelled when trading ends.
// const OUTDATED_CONTRACTS = {
//   conditionalMarketFactory: "0xd6F4a7059Ed5E1dc7fC8123768C5BC0fbc54A93a",
//   ctf1155: "0xE56d9034591C6A6A5C023883354FAeB435E3b441",
//   tieredRoleManager: "0xA6F794292488C628f91A0475dDF8dE6cEF2706EF",
// };

// ABIs
const FACTORY_ABI = [
  "function owner() external view returns (address)",
  "function roleManager() external view returns (address)",
  "function ctf1155() external view returns (address)",
  "function marketCount() external view returns (uint256)",
  "function deployMarketPair(uint256 proposalId, address collateralToken, uint256 liquidityAmount, uint256 liquidityParameter, uint256 tradingPeriod, uint8 betType) external returns (uint256 marketId)",
  "function deployMarketPairWithMetadata(uint256 proposalId, address collateralToken, uint256 liquidityAmount, uint256 liquidityParameter, uint256 tradingPeriod, uint8 betType, string metadataUri) external returns (uint256 marketId)",
  "function getMarket(uint256 marketId) external view returns (tuple(uint256 proposalId, address passToken, address failToken, address collateralToken, uint256 tradingEndTime, uint256 liquidityParameter, uint256 totalLiquidity, bool resolved, uint256 passValue, uint256 failValue, uint8 status, uint8 betType, bool useCTF, bytes32 conditionId, bytes32 questionId, uint256 passPositionId, uint256 failPositionId, uint256 passQuantity, uint256 failQuantity))",
];

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const ROLE_MANAGER_ABI = [
  "function MARKET_MAKER_ROLE() external view returns (bytes32)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
];

const CORRELATION_REGISTRY_ABI = [
  "function owner() external view returns (address)",
  "function groupCount() external view returns (uint256)",
  "function correlationGroups(uint256 groupId) external view returns (string name, string description, address creator, uint256 createdAt, bool active)",
  "function getMarketGroup(uint256 marketId) external view returns (uint256)",
  "function isMarketInGroup(uint256 marketId) external view returns (bool)",
  "function createCorrelationGroup(string name, string description, string category) external returns (uint256 groupId)",
  "function addMarketToGroup(uint256 groupId, uint256 marketId) external",
];

// Configuration
const CONFIG = {
  dryRun: process.env.DRY_RUN === "true",
  liquidityParameter: "100", // LMSR beta parameter
  delayBetweenMarkets: 2000, // ms between market creations
  delayBetweenIpfsUploads: 500, // ms between IPFS uploads
  // Gas estimation constants
  estimatedGasPerMarket: 500000n, // ~500k gas per market creation
  estimatedGasForApproval: 50000n, // ~50k gas for ERC20 approval
  gasBufferMultiplier: 1.2, // 20% buffer for gas estimates
};

/**
 * Load wallet from environment
 */
async function loadWallet() {
  // Try multiple sources for private key
  const privateKey =
    process.env.CREATOR_PRIVATE_KEY ||
    process.env.SEED_PLAYER_1 ||
    process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "No private key found. Set CREATOR_PRIVATE_KEY, SEED_PLAYER_1, or DEPLOYER_PRIVATE_KEY"
    );
  }

  const wallet = new ethers.Wallet(privateKey, ethers.provider);
  return wallet;
}

/**
 * Verify access to create markets
 */
async function verifyAccess(factory, wallet) {
  const owner = await factory.owner();
  const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();

  const roleManagerAddr = await factory.roleManager();
  let hasMarketMakerRole = false;

  if (roleManagerAddr !== ethers.ZeroAddress) {
    try {
      const roleManager = new ethers.Contract(roleManagerAddr, ROLE_MANAGER_ABI, ethers.provider);
      const marketMakerRole = await roleManager.MARKET_MAKER_ROLE();
      hasMarketMakerRole = await roleManager.hasRole(marketMakerRole, wallet.address);
    } catch (e) {
      // RoleManager may not be a valid contract or may not have expected interface
      console.log(`  Note: Could not verify MARKET_MAKER_ROLE (${e.message.split('\n')[0]})`);
    }
  }

  if (!isOwner && !hasMarketMakerRole) {
    throw new Error(
      `Wallet ${wallet.address} cannot create markets. ` +
        `Owner: ${owner}, Has MARKET_MAKER_ROLE: ${hasMarketMakerRole}`
    );
  }

  return { isOwner, hasMarketMakerRole };
}

/**
 * Display template statistics
 */
function displayStats(templates) {
  const stats = getTemplateStats();
  console.log("\n" + "=".repeat(60));
  console.log("Market Template Statistics");
  console.log("=".repeat(60));
  console.log(`Total templates: ${stats.total}`);
  console.log("\nBy Category:");
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`  ${CATEGORY_NAMES[category] || category}: ${count}`);
  }
  console.log("\nBy Timing:");
  console.log(`  Fixed events: ${stats.byTiming.fixed}`);
  console.log(`  Relative (evergreen): ${stats.byTiming.relative}`);
}

/**
 * Calculate and display funding requirements
 */
async function calculateRequirements(templates, uscDecimals, gasPrice) {
  // Calculate total USC needed for liquidity
  const totalUscLiquidity = calculateTotalLiquidity(templates, uscDecimals);

  // Calculate estimated gas costs
  const numMarkets = BigInt(templates.length);
  const totalGasForMarkets = CONFIG.estimatedGasPerMarket * numMarkets;
  const totalGasForApproval = CONFIG.estimatedGasForApproval;
  const totalGasEstimate = totalGasForMarkets + totalGasForApproval;

  // Apply buffer and calculate ETC cost
  const bufferedGas = (totalGasEstimate * BigInt(Math.floor(CONFIG.gasBufferMultiplier * 100))) / 100n;
  const estimatedEtcCost = bufferedGas * gasPrice;

  return {
    uscRequired: totalUscLiquidity,
    etcRequired: estimatedEtcCost,
    gasEstimate: bufferedGas,
    numMarkets: templates.length,
  };
}

/**
 * Display funding requirements summary
 */
function displayRequirements(requirements, currentUsc, currentEtc, uscDecimals) {
  console.log("\n" + "=".repeat(60));
  console.log("FUNDING REQUIREMENTS SUMMARY");
  console.log("=".repeat(60));

  const uscRequired = parseFloat(ethers.formatUnits(requirements.uscRequired, uscDecimals));
  const etcRequired = parseFloat(ethers.formatEther(requirements.etcRequired));
  const currentUscFloat = parseFloat(ethers.formatUnits(currentUsc, uscDecimals));
  const currentEtcFloat = parseFloat(ethers.formatEther(currentEtc));

  console.log(`\nMarkets to create: ${requirements.numMarkets}`);
  console.log(`Estimated gas: ${requirements.gasEstimate.toLocaleString()} gas units`);

  console.log("\n--- USC (Collateral) ---");
  console.log(`  Required:  ${uscRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USC`);
  console.log(`  Current:   ${currentUscFloat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USC`);
  const uscShortfall = uscRequired - currentUscFloat;
  if (uscShortfall > 0) {
    console.log(`  SHORTFALL: ${uscShortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USC`);
  } else {
    console.log(`  Surplus:   ${Math.abs(uscShortfall).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USC`);
  }

  console.log("\n--- ETC (Gas) ---");
  console.log(`  Required:  ${etcRequired.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETC`);
  console.log(`  Current:   ${currentEtcFloat.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETC`);
  const etcShortfall = etcRequired - currentEtcFloat;
  if (etcShortfall > 0) {
    console.log(`  SHORTFALL: ${etcShortfall.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETC`);
  } else {
    console.log(`  Surplus:   ${Math.abs(etcShortfall).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ETC`);
  }

  console.log("\n--- TOTAL FUNDING NEEDED ---");
  if (uscShortfall > 0 || etcShortfall > 0) {
    if (uscShortfall > 0) {
      console.log(`  Acquire ${uscShortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more USC`);
    }
    if (etcShortfall > 0) {
      console.log(`  Acquire ${etcShortfall.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} more ETC`);
    }
  } else {
    console.log("  Account is sufficiently funded!");
  }

  console.log("=".repeat(60));

  return {
    uscSufficient: uscShortfall <= 0,
    etcSufficient: etcShortfall <= 0,
    uscShortfall: Math.max(0, uscShortfall),
    etcShortfall: Math.max(0, etcShortfall),
  };
}

/**
 * Register markets with correlation groups on-chain
 * @param {Array} createdMarkets - Markets with correlationGroupId
 * @param {ethers.Wallet} wallet - Wallet for transactions
 * @returns {Promise<Object>} Results of correlation registration
 */
async function registerCorrelationGroups(createdMarkets, wallet) {
  const registry = new ethers.Contract(
    CONTRACTS.marketCorrelationRegistry,
    CORRELATION_REGISTRY_ABI,
    wallet
  );

  // Group markets by correlationGroupId
  const marketsByGroup = {};
  for (const market of createdMarkets) {
    if (market.correlationGroupId) {
      if (!marketsByGroup[market.correlationGroupId]) {
        marketsByGroup[market.correlationGroupId] = {
          name: market.correlationGroupName || market.correlationGroupId,
          category: market.category,
          markets: [],
        };
      }
      marketsByGroup[market.correlationGroupId].markets.push(market);
    }
  }

  const groupIds = Object.keys(marketsByGroup);
  if (groupIds.length === 0) {
    console.log("No correlation groups to register.");
    return { created: 0, registered: 0 };
  }

  console.log(`\nRegistering ${groupIds.length} correlation groups...`);

  const results = { created: 0, registered: 0, errors: [] };

  for (const groupId of groupIds) {
    const group = marketsByGroup[groupId];
    console.log(`\n  Group: ${group.name} (${group.markets.length} markets)`);

    try {
      // Create the correlation group on-chain
      const createTx = await registry.createCorrelationGroup(
        group.name,
        `Correlation group for ${group.name}`,
        group.category
      );
      await createTx.wait();

      // Get the new group ID from groupCount (it's groupCount - 1)
      const newGroupCount = await registry.groupCount();
      const onChainGroupId = newGroupCount - 1n;
      results.created++;

      console.log(`    Created on-chain group ID: ${onChainGroupId}`);

      // Add each market to the group
      for (const market of group.markets) {
        try {
          const addTx = await registry.addMarketToGroup(onChainGroupId, market.id);
          await addTx.wait();
          results.registered++;
          console.log(`    Added market ${market.id} to group`);
        } catch (addError) {
          console.error(`    Failed to add market ${market.id}: ${addError.message.split("\n")[0]}`);
          results.errors.push({ marketId: market.id, error: addError.message });
        }

        // Small delay between transactions
        await sleep(500);
      }
    } catch (error) {
      console.error(`    Failed to create group: ${error.message.split("\n")[0]}`);
      results.errors.push({ groupId, error: error.message });
    }

    // Delay between groups
    await sleep(1000);
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Garden of Eden - Create Demonstration Markets");
  console.log("=".repeat(60));

  if (CONFIG.dryRun) {
    console.log("\n*** DRY RUN MODE - No transactions will be executed ***\n");
  }

  // Get all templates
  const allTemplates = getAllTemplates();
  displayStats(allTemplates);

  // Filter to active templates (creatable now)
  const templates = filterTemplates({ activeOnly: true });
  console.log(`\nActive templates (creatable now): ${templates.length}`);

  if (templates.length === 0) {
    console.log("No templates are currently active. Check timing configurations.");
    return;
  }

  // Load wallet
  console.log("\n[1/8] Loading wallet...");
  const wallet = await loadWallet();
  console.log(`Wallet address: ${wallet.address}`);

  // Connect to contracts
  console.log("\n[2/8] Connecting to contracts...");
  const factory = new ethers.Contract(CONTRACTS.conditionalMarketFactory, FACTORY_ABI, wallet);
  const usc = new ethers.Contract(CONTRACTS.usc, ERC20_ABI, wallet);

  // Verify access
  const access = await verifyAccess(factory, wallet);
  console.log(`Owner: ${access.isOwner}, MARKET_MAKER_ROLE: ${access.hasMarketMakerRole}`);

  // Get current balances
  const uscBalance = await usc.balanceOf(wallet.address);
  const uscDecimals = await usc.decimals();
  const etcBalance = await ethers.provider.getBalance(wallet.address);

  // Get current gas price
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");

  // Calculate and display funding requirements
  console.log("\n[3/8] Calculating funding requirements...");
  const requirements = await calculateRequirements(templates, uscDecimals, gasPrice);
  const fundingStatus = displayRequirements(requirements, uscBalance, etcBalance, uscDecimals);

  // Check if we can proceed
  if (!fundingStatus.uscSufficient || !fundingStatus.etcSufficient) {
    console.error("\nInsufficient funds to create all markets!");
    if (!CONFIG.dryRun) {
      console.log("\nPlease fund the account and try again.");
      process.exit(1);
    } else {
      console.log("\n[DRY RUN] Would exit due to insufficient funds, continuing for simulation...");
    }
  }

  const totalLiquidity = requirements.uscRequired;

  // Upload metadata to IPFS
  console.log("\n[4/8] Uploading metadata to IPFS...");
  let metadataUris = [];

  const pinataConnected = await verifyPinataConnection();
  if (pinataConnected) {
    metadataUris = await batchUploadMetadata(
      templates,
      { creatorAddress: wallet.address },
      CONFIG.delayBetweenIpfsUploads
    );
  } else {
    console.log("Pinata not configured. Skipping IPFS uploads.");
    metadataUris = templates.map(() => null);
  }

  // Approve USC spending
  console.log("\n[5/8] Approving USC spending...");
  if (!CONFIG.dryRun) {
    const currentAllowance = await usc.allowance(wallet.address, CONTRACTS.conditionalMarketFactory);
    if (currentAllowance < totalLiquidity) {
      const approveTx = await usc.approve(CONTRACTS.conditionalMarketFactory, totalLiquidity);
      await approveTx.wait();
      console.log(`Approved ${ethers.formatUnits(totalLiquidity, uscDecimals)} USC`);
    } else {
      console.log("Already approved");
    }
  } else {
    console.log("[DRY RUN] Would approve USC spending");
  }

  // Create markets
  console.log("\n[6/8] Creating markets...");
  const currentDate = new Date();
  const createdMarkets = [];
  const failedMarkets = [];

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const metadataUri = metadataUris[i];

    // Build market parameters
    const proposalId = generateProposalId(template, currentDate);
    const tradingPeriod = calculateTradingPeriod(template, currentDate);

    // Calculate liquidity for this template
    const minLiq = parseFloat(template.liquidity?.min || "100");
    const maxLiq = parseFloat(template.liquidity?.max || "200");
    const liquidity = minLiq + Math.random() * (maxLiq - minLiq);
    const liquidityWei = ethers.parseUnits(liquidity.toFixed(2), uscDecimals);
    const liquidityParam = ethers.parseUnits(CONFIG.liquidityParameter, uscDecimals);

    console.log(`\n[${i + 1}/${templates.length}] ${template.category}: ${template.question.slice(0, 50)}...`);
    console.log(`  Liquidity: ${liquidity.toFixed(2)} USC, Trading: ${Math.floor(tradingPeriod / 86400)} days`);

    if (CONFIG.dryRun) {
      console.log("  [DRY RUN] Would create market");
      createdMarkets.push({
        id: `dry-run-${i}`,
        question: template.question,
        category: template.category,
      });
    } else {
      try {
        let tx;
        if (metadataUri) {
          tx = await factory.deployMarketPairWithMetadata(
            proposalId,
            CONTRACTS.usc,
            liquidityWei,
            liquidityParam,
            tradingPeriod,
            template.betType,
            metadataUri
          );
        } else {
          tx = await factory.deployMarketPair(
            proposalId,
            CONTRACTS.usc,
            liquidityWei,
            liquidityParam,
            tradingPeriod,
            template.betType
          );
        }

        const receipt = await tx.wait();
        const newCount = await factory.marketCount();
        const marketId = newCount - 1n;

        console.log(`  Created: Market ID ${marketId}, Tx: ${tx.hash.slice(0, 18)}...`);

        createdMarkets.push({
          id: marketId.toString(),
          question: template.question,
          category: template.category,
          txHash: tx.hash,
          correlationGroupId: template.correlationGroupId || null,
          correlationGroupName: template.correlationGroupName || null,
        });
      } catch (error) {
        console.error(`  Failed: ${error.message.split("\n")[0]}`);
        failedMarkets.push({
          question: template.question,
          error: error.message,
        });
      }
    }

    // Delay between creations
    if (i < templates.length - 1) {
      await sleep(CONFIG.delayBetweenMarkets);
    }
  }

  // Register correlation groups
  console.log("\n[7/8] Registering correlation groups...");
  let correlationResults = { created: 0, registered: 0, errors: [] };
  if (!CONFIG.dryRun && createdMarkets.length > 0) {
    correlationResults = await registerCorrelationGroups(createdMarkets, wallet);
    console.log(`\nCorrelation groups created: ${correlationResults.created}`);
    console.log(`Markets registered to groups: ${correlationResults.registered}`);
    if (correlationResults.errors.length > 0) {
      console.log(`Errors: ${correlationResults.errors.length}`);
    }
  } else if (CONFIG.dryRun) {
    // Count unique correlation groups for dry run
    const uniqueGroups = new Set(createdMarkets.filter(m => m.correlationGroupId).map(m => m.correlationGroupId));
    console.log(`[DRY RUN] Would create ${uniqueGroups.size} correlation groups`);
  }

  // Summary
  console.log("\n[8/8] Summary");
  console.log("=".repeat(60));
  console.log(`Total templates: ${templates.length}`);
  console.log(`Created: ${createdMarkets.length}`);
  console.log(`Failed: ${failedMarkets.length}`);

  // Group by category
  const byCategory = {};
  for (const market of createdMarkets) {
    if (!byCategory[market.category]) byCategory[market.category] = 0;
    byCategory[market.category]++;
  }
  console.log("\nMarkets by Category:");
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`  ${CATEGORY_NAMES[category] || category}: ${count}`);
  }

  // Show failed markets
  if (failedMarkets.length > 0) {
    console.log("\nFailed Markets:");
    for (const failed of failedMarkets.slice(0, 5)) {
      console.log(`  - ${failed.question.slice(0, 50)}...`);
      console.log(`    Error: ${failed.error.slice(0, 100)}`);
    }
    if (failedMarkets.length > 5) {
      console.log(`  ... and ${failedMarkets.length - 5} more`);
    }
  }

  // Final balance
  if (!CONFIG.dryRun) {
    const finalUsc = await usc.balanceOf(wallet.address);
    const finalEtc = await ethers.provider.getBalance(wallet.address);
    console.log("\nFinal Balances:");
    console.log(`  USC: ${ethers.formatUnits(finalUsc, uscDecimals)} USC`);
    console.log(`  ETC: ${ethers.formatEther(finalEtc)} ETC`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Garden of Eden setup complete!");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFatal error:");
    console.error(error);
    process.exit(1);
  });
