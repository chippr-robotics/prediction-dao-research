/**
 * Garden of Eden - Estimate Funding Requirements
 *
 * Quick script to estimate USDC and MATIC needed for demo market creation
 * without requiring network connection.
 *
 * Usage:
 *   node scripts/operations/estimate-demo-costs.js
 */

const {
  getAllTemplates,
  getTemplateStats,
  filterTemplates,
  CATEGORY_NAMES,
} = require("./market-templates");

// Configuration - same as create-demo-markets.js
const CONFIG = {
  usdcDecimals: 6,
  estimatedGasPerMarket: 500000, // ~500k gas per market creation
  estimatedGasForApproval: 50000, // ~50k gas for ERC20 approval
  gasBufferMultiplier: 1.2, // 20% buffer
  assumedGasPriceGwei: 1, // 1 gwei default for native gas
};

function main() {
  console.log("=".repeat(60));
  console.log("Garden of Eden - Funding Requirements Estimate");
  console.log("=".repeat(60));

  // Get all templates
  const allTemplates = getAllTemplates();
  const stats = getTemplateStats();

  console.log("\n--- Template Statistics ---");
  console.log(`Total templates: ${stats.total}`);
  console.log("\nBy Category:");
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`  ${CATEGORY_NAMES[category] || category}: ${count}`);
  }

  // Filter to active templates
  const activeTemplates = filterTemplates({ activeOnly: true });
  console.log(`\nActive templates (creatable now): ${activeTemplates.length}`);

  // Calculate USDC requirements
  let totalUscMin = 0;
  let totalUscMax = 0;
  let totalUscAvg = 0;

  for (const template of activeTemplates) {
    const min = parseFloat(template.liquidity?.min || "100");
    const max = parseFloat(template.liquidity?.max || "200");
    totalUscMin += min;
    totalUscMax += max;
    totalUscAvg += (min + max) / 2;
  }

  // Calculate gas requirements
  const numMarkets = activeTemplates.length;
  const totalGas = (CONFIG.estimatedGasPerMarket * numMarkets + CONFIG.estimatedGasForApproval);
  const bufferedGas = Math.ceil(totalGas * CONFIG.gasBufferMultiplier);
  const maticCostGwei = bufferedGas * CONFIG.assumedGasPriceGwei;
  const maticCost = maticCostGwei / 1e9; // Convert gwei to native units

  console.log("\n" + "=".repeat(60));
  console.log("FUNDING REQUIREMENTS");
  console.log("=".repeat(60));

  console.log("\n--- USDC (Collateral for Liquidity) ---");
  console.log(`  Minimum:  ${totalUscMin.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC`);
  console.log(`  Average:  ${totalUscAvg.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC`);
  console.log(`  Maximum:  ${totalUscMax.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC`);
  console.log(`\n  Recommended: ${Math.ceil(totalUscAvg * 1.1).toLocaleString()} USDC (avg + 10% buffer)`);

  console.log("\n--- MATIC (Gas for Transactions) ---");
  console.log(`  Markets to create: ${numMarkets}`);
  console.log(`  Estimated gas: ${bufferedGas.toLocaleString()} units`);
  console.log(`  At ${CONFIG.assumedGasPriceGwei} gwei: ${maticCost.toFixed(4)} MATIC`);
  console.log(`\n  Recommended: ${(maticCost * 1.5).toFixed(4)} MATIC (estimate + 50% buffer)`);

  console.log("\n--- SUMMARY ---");
  console.log(`  USDC needed: ~${Math.ceil(totalUscAvg).toLocaleString()} USDC`);
  console.log(`  MATIC needed: ~${(maticCost * 1.5).toFixed(2)} MATIC`);

  console.log("\n--- BY CATEGORY BREAKDOWN ---");
  const byCategory = {};
  for (const template of activeTemplates) {
    if (!byCategory[template.category]) {
      byCategory[template.category] = { count: 0, minUsc: 0, maxUsc: 0 };
    }
    byCategory[template.category].count++;
    byCategory[template.category].minUsc += parseFloat(template.liquidity?.min || "100");
    byCategory[template.category].maxUsc += parseFloat(template.liquidity?.max || "200");
  }

  console.log("\n  Category          Count   Min USDC    Max USDC");
  console.log("  " + "-".repeat(50));
  for (const [category, data] of Object.entries(byCategory)) {
    const name = (CATEGORY_NAMES[category] || category).padEnd(16);
    const count = data.count.toString().padStart(5);
    const min = data.minUsc.toFixed(0).padStart(9);
    const max = data.maxUsc.toFixed(0).padStart(10);
    console.log(`  ${name} ${count}   ${min}   ${max}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Note: Actual costs may vary based on gas prices and");
  console.log("randomized liquidity amounts within min/max ranges.");
  console.log("=".repeat(60));
}

main();
