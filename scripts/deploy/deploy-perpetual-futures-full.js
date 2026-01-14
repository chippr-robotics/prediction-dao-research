const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Full Deployment Script for Perpetual Futures Contracts
 *
 * Features:
 * - Deploys FundingRateEngine and PerpetualFuturesFactory
 * - Creates initial BTC, ETH, ETC perpetual markets
 * - Verifies contracts on Blockscout
 * - Automatically updates frontend/src/config/contracts.js
 * - Saves deployment info to deployments/ directory
 *
 * Usage:
 *   npx hardhat run scripts/deploy-perpetual-futures-full.js --network mordor
 *
 * Environment variables:
 *   VERIFY=true|false         Enable/disable Blockscout verification (default: true)
 *   VERIFY_RETRIES=6          Number of verification retries (default: 6)
 *   VERIFY_DELAY_MS=20000     Delay between retries in ms (default: 20000)
 *   SKIP_MARKETS=true|false   Skip initial market creation (default: false)
 *   UPDATE_FRONTEND=true|false Update frontend contracts.js (default: true)
 */

// Token addresses on ETC (same for mainnet and Mordor testnet)
const TOKENS = {
  USC: '0xDE093684c796204224BC081f937aa059D903c52a', // Classic USD Stablecoin
  WETC: '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a' // Wrapped ETC
};

// Utility functions
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLikelyAlreadyVerifiedError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("already verified") ||
    m.includes("contract source code already verified") ||
    m.includes("already been verified")
  );
}

function isLikelyNotIndexedYetError(message) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("contract not found") ||
    m.includes("unable to locate") ||
    m.includes("does not have bytecode") ||
    m.includes("doesn't have bytecode") ||
    m.includes("not verified") ||
    m.includes("unable to verify") ||
    m.includes("request failed") ||
    m.includes("timeout")
  );
}

/**
 * Verify contract on Blockscout with retries
 */
async function verifyOnBlockscout({ name, address, constructorArguments }) {
  const verifyEnabled = (process.env.VERIFY ?? "true").toLowerCase() !== "false";
  if (!verifyEnabled) {
    console.log(`  ⏭️  Verification skipped (VERIFY=false)`);
    return { status: "skipped" };
  }

  const networkName = hre.network.name;
  if (networkName === "hardhat" || networkName === "localhost") {
    console.log(`  ⏭️  Skipping verification on local network: ${networkName}`);
    return { status: "skipped" };
  }

  const retries = Number(process.env.VERIFY_RETRIES ?? 6);
  const delayMs = Number(process.env.VERIFY_DELAY_MS ?? 20000);

  console.log(`  Verifying ${name} on Blockscout...`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArguments ?? [],
      });
      console.log(`  ✓ Verified on Blockscout: ${address}`);
      return { status: "verified" };
    } catch (error) {
      const message = error?.message || String(error);

      if (isLikelyAlreadyVerifiedError(message)) {
        console.log(`  ✓ Already verified: ${address}`);
        return { status: "verified" };
      }

      const shouldRetry = attempt < retries && isLikelyNotIndexedYetError(message);
      console.warn(`  ⚠️  Verify attempt ${attempt}/${retries} failed`);
      console.warn(`      ${message.split("\n")[0]}`);

      if (!shouldRetry) {
        console.warn(`  ⚠️  Verification failed (continuing deployment)`);
        return { status: "failed", error: message.split("\n")[0] };
      }

      console.log(`  ⏳ Waiting ${delayMs / 1000}s before retry...`);
      await sleep(delayMs);
    }
  }

  return { status: "failed", error: "Verification failed after retries" };
}

/**
 * Update frontend contracts.js with new perpetual futures addresses
 */
function updateFrontendContracts(deploymentInfo) {
  const updateEnabled = (process.env.UPDATE_FRONTEND ?? "true").toLowerCase() !== "false";
  if (!updateEnabled) {
    console.log("  ⏭️  Frontend update skipped (UPDATE_FRONTEND=false)");
    return false;
  }

  const contractsPath = path.join(__dirname, "../frontend/src/config/contracts.js");

  if (!fs.existsSync(contractsPath)) {
    console.warn(`  ⚠️  Frontend contracts.js not found at: ${contractsPath}`);
    return false;
  }

  try {
    let content = fs.readFileSync(contractsPath, "utf8");

    // Check if perpetual futures entries already exist
    const hasPerpFactory = content.includes("perpFactory:");
    const hasFundingRateEngine = content.includes("fundingRateEngine:");

    // Build new entries
    const newEntries = [];

    if (!hasFundingRateEngine) {
      newEntries.push(`  // Perpetual Futures - Deployed via: npx hardhat run scripts/deploy-perpetual-futures-full.js --network ${deploymentInfo.network}`);
      newEntries.push(`  fundingRateEngine: '${deploymentInfo.contracts.fundingRateEngine}',`);
    }

    if (!hasPerpFactory) {
      newEntries.push(`  perpFactory: '${deploymentInfo.contracts.perpFactory}',`);
    }

    if (newEntries.length === 0) {
      // Update existing entries
      content = content.replace(
        /fundingRateEngine:\s*'[^']+'/,
        `fundingRateEngine: '${deploymentInfo.contracts.fundingRateEngine}'`
      );
      content = content.replace(
        /perpFactory:\s*'[^']+'/,
        `perpFactory: '${deploymentInfo.contracts.perpFactory}'`
      );
      console.log("  ✓ Updated existing perpetual futures addresses in contracts.js");
    } else {
      // Find the closing brace of DEPLOYED_CONTRACTS and insert new entries before it
      const insertRegex = /(membershipPaymentManager:[^\n]+\n)/;
      const match = content.match(insertRegex);

      if (match) {
        const insertPoint = match.index + match[0].length;
        const beforeInsert = content.slice(0, insertPoint);
        const afterInsert = content.slice(insertPoint);
        content = beforeInsert + "\n" + newEntries.join("\n") + "\n" + afterInsert;
        console.log("  ✓ Added perpetual futures addresses to contracts.js");
      } else {
        console.warn("  ⚠️  Could not find insertion point in contracts.js");
        return false;
      }
    }

    fs.writeFileSync(contractsPath, content);
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to update contracts.js: ${error.message}`);
    return false;
  }
}

/**
 * Save deployment info to file
 */
function saveDeploymentInfo(deploymentInfo) {
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${deploymentInfo.network}-perpetual-futures-deployment.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`  ✓ Saved deployment info to: ${filepath}`);

  return filepath;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     Perpetual Futures Full Deployment Script               ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETC");
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log();

  const skipMarkets = (process.env.SKIP_MARKETS ?? "false").toLowerCase() === "true";
  const verificationResults = {};
  const deployedMarkets = [];

  try {
    // ═══════════════════════════════════════════════════════════════
    // Step 1: Deploy FundingRateEngine
    // ═══════════════════════════════════════════════════════════════
    console.log("Step 1: Deploying FundingRateEngine...");
    const FundingRateEngine = await hre.ethers.getContractFactory("FundingRateEngine");
    const fundingRateEngine = await FundingRateEngine.deploy();
    await fundingRateEngine.waitForDeployment();
    const fundingRateEngineAddress = await fundingRateEngine.getAddress();
    console.log(`  ✓ FundingRateEngine deployed: ${fundingRateEngineAddress}`);

    // Verify FundingRateEngine
    verificationResults.fundingRateEngine = await verifyOnBlockscout({
      name: "FundingRateEngine",
      address: fundingRateEngineAddress,
      constructorArguments: []
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Step 2: Deploy PerpetualFuturesFactory
    // ═══════════════════════════════════════════════════════════════
    console.log("Step 2: Deploying PerpetualFuturesFactory...");
    const constructorArgs = [
      fundingRateEngineAddress,  // Funding rate engine
      deployer.address,          // Fee recipient
      TOKENS.USC                 // Default collateral token (USC stablecoin)
    ];

    const PerpetualFuturesFactory = await hre.ethers.getContractFactory("PerpetualFuturesFactory");
    const perpFactory = await PerpetualFuturesFactory.deploy(...constructorArgs);
    await perpFactory.waitForDeployment();
    const perpFactoryAddress = await perpFactory.getAddress();
    console.log(`  ✓ PerpetualFuturesFactory deployed: ${perpFactoryAddress}`);

    // Verify PerpetualFuturesFactory
    verificationResults.perpFactory = await verifyOnBlockscout({
      name: "PerpetualFuturesFactory",
      address: perpFactoryAddress,
      constructorArguments: constructorArgs
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Step 3: Configure FundingRateEngine
    // ═══════════════════════════════════════════════════════════════
    console.log("Step 3: Configuring FundingRateEngine...");

    // Authorize the factory as price updater
    console.log("  - Setting factory as price updater...");
    let tx = await fundingRateEngine.setPriceUpdater(perpFactoryAddress, true);
    await tx.wait();
    console.log("  ✓ Factory authorized as price updater");
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Step 4: Configure allowed collateral tokens
    // ═══════════════════════════════════════════════════════════════
    console.log("Step 4: Configuring allowed collateral tokens...");

    console.log("  - Adding WETC as allowed collateral...");
    tx = await perpFactory.setAllowedCollateralToken(TOKENS.WETC, true);
    await tx.wait();
    console.log("  ✓ WETC allowed as collateral");
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Step 5: Create initial markets (optional)
    // ═══════════════════════════════════════════════════════════════
    if (!skipMarkets) {
      console.log("Step 5: Creating initial perpetual futures markets...");

      const creationFee = await perpFactory.creationFee();
      console.log(`  Creation fee: ${hre.ethers.formatEther(creationFee)} ETC`);

      // Market configurations
      const marketConfigs = [
        {
          name: "Bitcoin Perpetual",
          underlyingAsset: "BTC",
          collateralToken: TOKENS.USC,
          category: 0, // Crypto
          initialIndexPrice: hre.ethers.parseEther("100000"), // $100,000
          initialMarkPrice: hre.ethers.parseEther("100000"),
          linkedConditionalMarketId: 0,
          config: {
            maxLeverage: 20 * 10000,         // 20x
            initialMarginRate: 500,           // 5%
            maintenanceMarginRate: 250,       // 2.5%
            liquidationFeeRate: 100,          // 1%
            tradingFeeRate: 10,               // 0.1%
            fundingInterval: 8 * 3600,        // 8 hours
            maxFundingRate: 1000              // 0.1%
          }
        },
        {
          name: "Ethereum Perpetual",
          underlyingAsset: "ETH",
          collateralToken: TOKENS.USC,
          category: 0,
          initialIndexPrice: hre.ethers.parseEther("4000"),
          initialMarkPrice: hre.ethers.parseEther("4000"),
          linkedConditionalMarketId: 0,
          config: {
            maxLeverage: 20 * 10000,
            initialMarginRate: 500,
            maintenanceMarginRate: 250,
            liquidationFeeRate: 100,
            tradingFeeRate: 10,
            fundingInterval: 8 * 3600,
            maxFundingRate: 1000
          }
        },
        {
          name: "Ethereum Classic Perpetual",
          underlyingAsset: "ETC",
          collateralToken: TOKENS.USC,
          category: 0,
          initialIndexPrice: hre.ethers.parseEther("30"),
          initialMarkPrice: hre.ethers.parseEther("30"),
          linkedConditionalMarketId: 0,
          config: {
            maxLeverage: 20 * 10000,
            initialMarginRate: 500,
            maintenanceMarginRate: 250,
            liquidationFeeRate: 100,
            tradingFeeRate: 10,
            fundingInterval: 8 * 3600,
            maxFundingRate: 1000
          }
        }
      ];

      for (let i = 0; i < marketConfigs.length; i++) {
        const params = marketConfigs[i];
        console.log(`  - Creating ${params.underlyingAsset}-PERP market...`);

        const marketTx = await perpFactory.createMarket(params, { value: creationFee });
        await marketTx.wait();

        const marketInfo = await perpFactory.getMarket(i);
        console.log(`    ✓ ${params.underlyingAsset}-PERP deployed: ${marketInfo.marketAddress}`);

        deployedMarkets.push({
          id: i,
          name: `${params.underlyingAsset}-PERP`,
          fullName: params.name,
          address: marketInfo.marketAddress,
          underlyingAsset: params.underlyingAsset
        });

        // Verify market contract
        const marketConstructorArgs = [
          i,                          // marketId
          params.name,                // marketName
          params.underlyingAsset,     // underlyingAsset
          params.collateralToken,     // collateralToken
          deployer.address,           // feeRecipient
          hre.ethers.ZeroAddress      // roleManager (none set in factory)
        ];

        verificationResults[`market_${i}`] = await verifyOnBlockscout({
          name: `PerpetualFuturesMarket (${params.underlyingAsset})`,
          address: marketInfo.marketAddress,
          constructorArguments: marketConstructorArgs
        });
      }
      console.log();
    } else {
      console.log("Step 5: Skipping market creation (SKIP_MARKETS=true)");
      console.log();
    }

    // ═══════════════════════════════════════════════════════════════
    // Build deployment info
    // ═══════════════════════════════════════════════════════════════
    const deploymentInfo = {
      network: hre.network.name,
      chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      contracts: {
        fundingRateEngine: fundingRateEngineAddress,
        perpFactory: perpFactoryAddress
      },
      markets: deployedMarkets,
      tokens: TOKENS,
      verificationResults
    };

    // ═══════════════════════════════════════════════════════════════
    // Step 6: Update frontend contracts.js
    // ═══════════════════════════════════════════════════════════════
    console.log("Step 6: Updating frontend configuration...");
    updateFrontendContracts(deploymentInfo);
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Step 7: Save deployment info
    // ═══════════════════════════════════════════════════════════════
    console.log("Step 7: Saving deployment info...");
    const deploymentPath = saveDeploymentInfo(deploymentInfo);
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // Deployment Summary
    // ═══════════════════════════════════════════════════════════════
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║                    Deployment Summary                      ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("Core Contracts:");
    console.log(`  FundingRateEngine:      ${fundingRateEngineAddress}`);
    console.log(`  PerpetualFuturesFactory: ${perpFactoryAddress}`);
    console.log();

    if (deployedMarkets.length > 0) {
      console.log("Perpetual Markets:");
      for (const market of deployedMarkets) {
        console.log(`  ${market.name} (ID: ${market.id}): ${market.address}`);
      }
      console.log();
    }

    console.log("Verification Status:");
    for (const [name, result] of Object.entries(verificationResults)) {
      const icon = result.status === "verified" ? "✓" : result.status === "skipped" ? "⏭️" : "⚠️";
      console.log(`  ${icon} ${name}: ${result.status}`);
    }
    console.log();

    console.log("Configuration:");
    console.log(`  Default Collateral: ${TOKENS.USC} (USC)`);
    console.log(`  Allowed Collateral: WETC`);
    console.log(`  Max Leverage: 20x`);
    console.log(`  Funding Interval: 8 hours`);
    console.log();

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║            Deployment completed successfully!              ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    console.log("Next Steps:");
    console.log("1. Verify the frontend configuration was updated correctly");
    console.log("2. Set up a price oracle to update index prices periodically");
    console.log("3. Deposit to the insurance fund for each market");
    console.log("4. Test trading functionality with small amounts");
    console.log();

    // Output JSON for CI/CD integration
    console.log("Deployment JSON:");
    console.log(JSON.stringify(deploymentInfo, null, 2));

  } catch (error) {
    console.error("\n╔════════════════════════════════════════════════════════════╗");
    console.error("║                   Deployment failed!                       ║");
    console.error("╚════════════════════════════════════════════════════════════╝\n");
    console.error("Error:", error.message);

    if (error.data) {
      console.error("Error data:", error.data);
    }

    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
