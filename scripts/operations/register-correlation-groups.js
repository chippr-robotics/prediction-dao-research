const { ethers } = require("hardhat");

/**
 * Register Existing Markets with Correlation Groups
 *
 * This script reads IPFS metadata from existing markets and registers them
 * with the on-chain MarketCorrelationRegistry.
 *
 * Usage:
 *   npx hardhat run scripts/operations/register-correlation-groups.js --network mordor
 *
 * Environment Variables:
 *   - CREATOR_PRIVATE_KEY: Private key for transactions
 *   - DRY_RUN: Set to "true" to simulate without transactions
 *   - START_MARKET_ID: First market ID to process (default: 8)
 *   - END_MARKET_ID: Last market ID to process (default: 46)
 */

// Contract addresses (Mordor testnet)
const CONTRACTS = {
  conditionalMarketFactory: "0xc56631DB29c44bb553a511DD3d4b90d64C95Cd9C",
  marketCorrelationRegistry: "0x2a820A38997743fC3303cDcA56b996598963B909",
};

// ABIs
const FACTORY_ABI = [
  "function marketCount() external view returns (uint256)",
  "function getMarketMetadataUri(uint256 marketId) external view returns (string)",
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
  startMarketId: parseInt(process.env.START_MARKET_ID || "8", 10),
  endMarketId: parseInt(process.env.END_MARKET_ID || "46", 10),
  ipfsGateway: "https://gateway.pinata.cloud/ipfs/",
  delayBetweenTx: 1000, // ms between transactions
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Load wallet from environment
 */
async function loadWallet() {
  const privateKey =
    process.env.CREATOR_PRIVATE_KEY ||
    process.env.SEED_PLAYER_1 ||
    process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("No private key found. Set CREATOR_PRIVATE_KEY");
  }

  return new ethers.Wallet(privateKey, ethers.provider);
}

/**
 * Fetch IPFS metadata
 */
async function fetchIpfsMetadata(uri) {
  if (!uri || uri.length === 0) return null;

  try {
    // Convert ipfs:// to HTTP gateway URL
    let url = uri;
    if (uri.startsWith("ipfs://")) {
      const cid = uri.replace("ipfs://", "");
      url = `${CONFIG.ipfsGateway}${cid}`;
    }

    const response = await fetch(url, { timeout: 10000 });
    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.warn(`  Failed to fetch metadata: ${error.message}`);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Register Existing Markets with Correlation Groups");
  console.log("=".repeat(60));

  if (CONFIG.dryRun) {
    console.log("\n*** DRY RUN MODE - No transactions will be executed ***\n");
  }

  console.log(`Market ID range: ${CONFIG.startMarketId} - ${CONFIG.endMarketId}`);

  // Load wallet
  console.log("\n[1/4] Loading wallet...");
  const wallet = await loadWallet();
  console.log(`Wallet address: ${wallet.address}`);

  // Connect to contracts
  console.log("\n[2/4] Connecting to contracts...");
  const factory = new ethers.Contract(
    CONTRACTS.conditionalMarketFactory,
    FACTORY_ABI,
    ethers.provider
  );
  const registry = new ethers.Contract(
    CONTRACTS.marketCorrelationRegistry,
    CORRELATION_REGISTRY_ABI,
    wallet
  );

  // Verify ownership/access
  const registryOwner = await registry.owner();
  const isOwner = registryOwner.toLowerCase() === wallet.address.toLowerCase();
  console.log(`Registry owner: ${isOwner ? "Yes" : "No"}`);

  // Get market count
  const marketCount = await factory.marketCount();
  console.log(`Total markets on factory: ${marketCount}`);

  // Collect market correlation data from IPFS metadata
  console.log("\n[3/4] Reading market metadata...");
  const marketData = [];

  for (let id = CONFIG.startMarketId; id <= CONFIG.endMarketId; id++) {
    if (id >= Number(marketCount)) {
      console.log(`Market ${id} does not exist (only ${marketCount} markets)`);
      break;
    }

    try {
      // Check if already in a group
      const inGroup = await registry.isMarketInGroup(id);
      if (inGroup) {
        console.log(`  Market ${id}: Already in a group, skipping`);
        continue;
      }

      // Fetch metadata URI
      const metadataUri = await factory.getMarketMetadataUri(id);
      if (!metadataUri || metadataUri.length === 0) {
        console.log(`  Market ${id}: No metadata URI`);
        continue;
      }

      // Fetch IPFS metadata
      const metadata = await fetchIpfsMetadata(metadataUri);
      if (!metadata) {
        console.log(`  Market ${id}: Could not fetch metadata`);
        continue;
      }

      // Extract correlation group info
      const correlationGroupId = metadata.properties?.correlation_group_id;
      const correlationGroupName = metadata.properties?.correlation_group_name;
      const category = metadata.attributes?.find(
        (a) => a.trait_type === "Category"
      )?.value?.toLowerCase();

      if (!correlationGroupId) {
        console.log(`  Market ${id}: No correlation group in metadata`);
        continue;
      }

      console.log(`  Market ${id}: ${correlationGroupName || correlationGroupId} (${category})`);

      marketData.push({
        id,
        correlationGroupId,
        correlationGroupName: correlationGroupName || correlationGroupId,
        category: category || "other",
        title: metadata.name?.slice(0, 50) || `Market #${id}`,
      });
    } catch (error) {
      console.error(`  Market ${id}: Error - ${error.message.split("\n")[0]}`);
    }

    await sleep(200); // Rate limit IPFS requests
  }

  console.log(`\nFound ${marketData.length} markets with correlation groups`);

  if (marketData.length === 0) {
    console.log("No markets to register.");
    return;
  }

  // Group markets by correlationGroupId
  const groupedMarkets = {};
  for (const market of marketData) {
    if (!groupedMarkets[market.correlationGroupId]) {
      groupedMarkets[market.correlationGroupId] = {
        name: market.correlationGroupName,
        category: market.category,
        markets: [],
      };
    }
    groupedMarkets[market.correlationGroupId].markets.push(market);
  }

  const uniqueGroups = Object.keys(groupedMarkets);
  console.log(`\nUnique correlation groups: ${uniqueGroups.length}`);
  for (const groupId of uniqueGroups) {
    const group = groupedMarkets[groupId];
    console.log(`  - ${group.name}: ${group.markets.length} markets`);
  }

  // Register correlation groups and add markets
  console.log("\n[4/4] Registering correlation groups on-chain...");

  const results = { groupsCreated: 0, marketsRegistered: 0, errors: [] };

  for (const groupId of uniqueGroups) {
    const group = groupedMarkets[groupId];
    console.log(`\n  Creating group: ${group.name}`);

    if (CONFIG.dryRun) {
      console.log(`    [DRY RUN] Would create group with ${group.markets.length} markets`);
      results.groupsCreated++;
      results.marketsRegistered += group.markets.length;
      continue;
    }

    try {
      // Create the correlation group
      const createTx = await registry.createCorrelationGroup(
        group.name,
        `Correlation group for ${group.name}`,
        group.category
      );
      await createTx.wait();

      // Get the new group ID
      const newGroupCount = await registry.groupCount();
      const onChainGroupId = newGroupCount - 1n;
      results.groupsCreated++;

      console.log(`    Created on-chain group ID: ${onChainGroupId}`);

      // Add each market to the group
      for (const market of group.markets) {
        try {
          const addTx = await registry.addMarketToGroup(onChainGroupId, market.id);
          await addTx.wait();
          results.marketsRegistered++;
          console.log(`    Added market ${market.id}: ${market.title}...`);
        } catch (addError) {
          console.error(`    Failed to add market ${market.id}: ${addError.message.split("\n")[0]}`);
          results.errors.push({ marketId: market.id, error: addError.message });
        }

        await sleep(CONFIG.delayBetweenTx);
      }
    } catch (error) {
      console.error(`    Failed to create group: ${error.message.split("\n")[0]}`);
      results.errors.push({ groupId, error: error.message });
    }

    await sleep(CONFIG.delayBetweenTx);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`Correlation groups created: ${results.groupsCreated}`);
  console.log(`Markets registered: ${results.marketsRegistered}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
    for (const err of results.errors.slice(0, 5)) {
      console.log(`  - ${err.marketId || err.groupId}: ${err.error.slice(0, 80)}`);
    }
  }
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFatal error:");
    console.error(error);
    process.exit(1);
  });
