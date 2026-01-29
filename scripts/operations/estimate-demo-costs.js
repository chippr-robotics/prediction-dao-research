/**
 * Garden of Eden - Estimate Funding Requirements
 *
 * Quick script to estimate USC and ETC needed for demo market creation
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
  uscDecimals: 6,
  estimatedGasPerMarket: 500000, // ~500k gas per market creation
  estimatedGasForApproval: 50000, // ~50k gas for ERC20 approval
  gasBufferMultiplier: 1.2, // 20% buffer
  assumedGasPriceGwei: 1, // 1 gwei default for ETC
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

  // Calculate USC requirements
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
  const etcCostGwei = bufferedGas * CONFIG.assumedGasPriceGwei;
  const etcCost = etcCostGwei / 1e9; // Convert gwei to ETC

  console.log("\n" + "=".repeat(60));
  console.log("FUNDING REQUIREMENTS");
  console.log("=".repeat(60));

  console.log("\n--- USC (Collateral for Liquidity) ---");
  console.log(`  Minimum:  ${totalUscMin.toLocaleString(undefined, { minimumFractionDigits: 2 })} USC`);
  console.log(`  Average:  ${totalUscAvg.toLocaleString(undefined, { minimumFractionDigits: 2 })} USC`);
  console.log(`  Maximum:  ${totalUscMax.toLocaleString(undefined, { minimumFractionDigits: 2 })} USC`);
  console.log(`\n  Recommended: ${Math.ceil(totalUscAvg * 1.1).toLocaleString()} USC (avg + 10% buffer)`);

  console.log("\n--- ETC (Gas for Transactions) ---");
  console.log(`  Markets to create: ${numMarkets}`);
  console.log(`  Estimated gas: ${bufferedGas.toLocaleString()} units`);
  console.log(`  At ${CONFIG.assumedGasPriceGwei} gwei: ${etcCost.toFixed(4)} ETC`);
  console.log(`\n  Recommended: ${(etcCost * 1.5).toFixed(4)} ETC (estimate + 50% buffer)`);

  console.log("\n--- SUMMARY ---");
  console.log(`  USC needed: ~${Math.ceil(totalUscAvg).toLocaleString()} USC`);
  console.log(`  ETC needed: ~${(etcCost * 1.5).toFixed(2)} ETC`);

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

  console.log("\n  Category          Count   Min USC    Max USC");
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
