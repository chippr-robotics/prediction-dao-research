/**
 * Perpetual Futures Funding Settlement Script
 *
 * Resilient cron script that settles funding fees for all active perpetual futures markets.
 * Designed to handle timing errors, delays, and missed settlements gracefully.
 *
 * Features:
 * - Checks on-chain state to determine if settlement is due (not wall-clock time)
 * - Continues processing other markets if one fails
 * - Retry logic with exponential backoff
 * - Dry-run mode for testing
 * - Detailed logging for monitoring
 *
 * Usage:
 *   npx hardhat run scripts/cron/settle-funding.js --network mordor
 *   DRY_RUN=true npx hardhat run scripts/cron/settle-funding.js --network mordor
 *
 * Exit codes:
 *   0 - All settlements succeeded (or none were due)
 *   1 - Some settlements failed
 *   2 - All settlements failed or critical error
 *
 * Recommended cron schedule:
 *   Run every 30 minutes for resilience against timing errors
 *   Cron pattern: 0,30 * * * * /path/to/settle-funding.sh
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// =============================================================================
// CONFIGURATION
// =============================================================================

const DRY_RUN = process.env.DRY_RUN === "true";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000; // 5 seconds base delay

// =============================================================================
// LOGGING
// =============================================================================

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${timestamp}] [${level}] ${message}${dataStr}`);
}

function logInfo(message, data) {
  log("INFO", message, data);
}

function logWarn(message, data) {
  log("WARN", message, data);
}

function logError(message, data) {
  log("ERROR", message, data);
}

function logSuccess(message, data) {
  log("SUCCESS", message, data);
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function loadDeployment() {
  const network = hre.network.name;
  const deploymentPath = path.join(
    __dirname,
    "../../deployments",
    `${network}-perpetual-futures-v2.1-deployment.json`
  );

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

// =============================================================================
// MARKET STATUS CHECKING
// =============================================================================

async function getMarketFundingStatus(marketContract, marketName) {
  const metrics = await marketContract.getMetrics();
  const config = await marketContract.getConfig();
  const currentBlock = await ethers.provider.getBlock("latest");
  const currentTime = currentBlock.timestamp;

  const lastFundingTime = Number(metrics.lastFundingTime);
  const fundingInterval = Number(config.fundingInterval);
  const nextFundingTime = lastFundingTime + fundingInterval;
  const isDue = currentTime >= nextFundingTime;
  const timeRemaining = isDue ? 0 : nextFundingTime - currentTime;
  const timeOverdue = isDue ? currentTime - nextFundingTime : 0;

  return {
    marketName,
    lastFundingTime,
    fundingInterval,
    nextFundingTime,
    currentTime,
    isDue,
    timeRemaining,
    timeOverdue,
    currentFundingRate: metrics.currentFundingRate,
    totalLongSize: metrics.totalLongSize,
    totalShortSize: metrics.totalShortSize,
  };
}

// =============================================================================
// SETTLEMENT EXECUTION
// =============================================================================

async function settleFundingWithRetry(factory, marketId, marketName, maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logInfo(`Settling funding for ${marketName} (attempt ${attempt}/${maxRetries})`, { marketId });

      if (DRY_RUN) {
        logInfo(`[DRY RUN] Would call factory.settleFunding(${marketId})`);
        return { success: true, dryRun: true };
      }

      const tx = await factory.settleFunding(marketId);
      logInfo(`Transaction submitted`, { hash: tx.hash, marketId, marketName });

      const receipt = await tx.wait();
      logSuccess(`Funding settled for ${marketName}`, {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      });

      return { success: true, txHash: receipt.hash, receipt };
    } catch (error) {
      const errorMessage = error.message || error.toString();

      // Check if this is a "Funding interval not reached" error - this is expected
      if (errorMessage.includes("Funding interval not reached")) {
        logInfo(`Funding not yet due for ${marketName} (contract rejected - interval not reached)`);
        return { success: true, skipped: true, reason: "interval_not_reached" };
      }

      // Check if market is paused
      if (errorMessage.includes("paused")) {
        logWarn(`Market ${marketName} is paused, skipping`, { marketId });
        return { success: true, skipped: true, reason: "market_paused" };
      }

      // Check if market is not active
      if (errorMessage.includes("not active") || errorMessage.includes("Not active")) {
        logWarn(`Market ${marketName} is not active, skipping`, { marketId });
        return { success: true, skipped: true, reason: "market_not_active" };
      }

      logError(`Attempt ${attempt} failed for ${marketName}`, { error: errorMessage });

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        logInfo(`Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  logError(`All ${maxRetries} attempts failed for ${marketName}`);
  return { success: false };
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  logInfo("=".repeat(60));
  logInfo("Perpetual Futures Funding Settlement Script");
  logInfo("=".repeat(60));

  if (DRY_RUN) {
    logWarn("DRY RUN MODE - No transactions will be submitted");
  }

  // Load network info
  const network = await ethers.provider.getNetwork();
  logInfo(`Network: ${hre.network.name} (Chain ID: ${network.chainId})`);

  // Get signer
  const [signer] = await ethers.getSigners();
  logInfo(`Operator: ${signer.address}`);

  const balance = await ethers.provider.getBalance(signer.address);
  logInfo(`Operator balance: ${ethers.formatEther(balance)} ETC`);

  if (balance < ethers.parseEther("0.01")) {
    logWarn("Low balance! May not have enough gas for settlements");
  }

  // Load deployment
  let deployment;
  try {
    deployment = loadDeployment();
    logInfo("Loaded deployment config", {
      version: deployment.version,
      factory: deployment.contracts.perpFactory,
      marketCount: deployment.markets.length,
    });
  } catch (error) {
    logError("Failed to load deployment", { error: error.message });
    process.exit(2);
  }

  // Connect to factory
  const factory = await ethers.getContractAt(
    "PerpetualFuturesFactory",
    deployment.contracts.perpFactory
  );

  // Process each market
  const results = {
    processed: 0,
    settled: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const marketInfo of deployment.markets) {
    logInfo("-".repeat(40));
    logInfo(`Processing: ${marketInfo.name} (ID: ${marketInfo.id})`);

    try {
      // Connect to market contract
      const market = await ethers.getContractAt(
        "PerpetualFuturesMarket",
        marketInfo.address
      );

      // Get funding status
      const status = await getMarketFundingStatus(market, marketInfo.name);

      logInfo(`Funding status`, {
        lastFunding: new Date(status.lastFundingTime * 1000).toISOString(),
        interval: formatDuration(status.fundingInterval),
        isDue: status.isDue,
        timeRemaining: status.isDue ? "OVERDUE" : formatDuration(status.timeRemaining),
        timeOverdue: status.isDue ? formatDuration(status.timeOverdue) : "N/A",
        currentRate: status.currentFundingRate.toString(),
        longSize: ethers.formatEther(status.totalLongSize),
        shortSize: ethers.formatEther(status.totalShortSize),
      });

      results.processed++;

      if (!status.isDue) {
        logInfo(`Funding not due yet, skipping`, {
          nextSettlement: new Date(status.nextFundingTime * 1000).toISOString(),
        });
        results.skipped++;
        continue;
      }

      // Settlement is due - execute it
      logInfo(`Funding is due! Attempting settlement...`);
      const settlementResult = await settleFundingWithRetry(
        factory,
        marketInfo.id,
        marketInfo.name
      );

      if (settlementResult.success) {
        if (settlementResult.skipped) {
          results.skipped++;
        } else {
          results.settled++;
        }
      } else {
        results.failed++;
        results.errors.push({
          marketId: marketInfo.id,
          marketName: marketInfo.name,
        });
      }
    } catch (error) {
      logError(`Unexpected error processing ${marketInfo.name}`, {
        error: error.message,
      });
      results.failed++;
      results.errors.push({
        marketId: marketInfo.id,
        marketName: marketInfo.name,
        error: error.message,
      });
    }
  }

  // Summary
  logInfo("=".repeat(60));
  logInfo("Settlement Summary");
  logInfo("=".repeat(60));
  logInfo(`Markets processed: ${results.processed}`);
  logInfo(`Settlements executed: ${results.settled}`);
  logInfo(`Skipped (not due): ${results.skipped}`);
  logInfo(`Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    logError("Failed markets:", { errors: results.errors });
  }

  // Determine exit code
  if (results.failed === 0) {
    logSuccess("All operations completed successfully");
    process.exit(0);
  } else if (results.settled > 0) {
    logWarn("Some settlements failed");
    process.exit(1);
  } else {
    logError("All settlements failed");
    process.exit(2);
  }
}

main().catch((error) => {
  logError("Critical error", { error: error.message, stack: error.stack });
  process.exit(2);
});
