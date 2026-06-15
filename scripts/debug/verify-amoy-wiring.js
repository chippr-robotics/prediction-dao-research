/**
 * verify-amoy-wiring.js (READ-ONLY) — confirm the freshly deployed Amoy v2 set
 * is wired correctly: registry -> mgr/adapter/guard/oracles, mgr -> guard +
 * authorized caller.
 *   npx hardhat run scripts/debug/verify-amoy-wiring.js --network amoy
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const RT = { Polymarket: 4, ChainlinkDataFeed: 5, ChainlinkFunctions: 6, UMA: 7 };

async function main() {
  const rec = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "deployments", "amoy-chain80002-v2.json"), "utf8"));
  const c = rec.contracts;
  const reg = await ethers.getContractAt("WagerRegistry", c.wagerRegistry);
  const mgr = await ethers.getContractAt("MembershipManager", c.membershipManager);

  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const line = (label, got, want) => console.log(`  ${eq(got, want) ? "✓" : "✗"} ${label}: ${got}${eq(got, want) ? "" : `  (expected ${want})`}`);

  console.log("WagerRegistry wiring:");
  line("membershipManager", await reg.membershipManager(), c.membershipManager);
  line("sanctionsGuard", await reg.sanctionsGuard(), c.sanctionsGuard);
  line("oracle[Polymarket]", await reg.oracleAdapters(RT.Polymarket), c.polymarketAdapter);
  line("oracle[ChainlinkDataFeed]", await reg.oracleAdapters(RT.ChainlinkDataFeed), c.chainlinkDataFeedAdapter);
  line("oracle[ChainlinkFunctions]", await reg.oracleAdapters(RT.ChainlinkFunctions), c.chainlinkFunctionsAdapter);
  line("oracle[UMA]", await reg.oracleAdapters(RT.UMA), c.umaAdapter);

  console.log("MembershipManager wiring:");
  line("sanctionsGuard", await mgr.sanctionsGuard(), c.sanctionsGuard);
  console.log(`  ${(await mgr.authorizedCallers(c.wagerRegistry)) ? "✓" : "✗"} authorizedCallers[wagerRegistry] = ${await mgr.authorizedCallers(c.wagerRegistry)}`);

  // Token allowlist on the registry
  console.log("WagerRegistry stake-token allowlist:");
  console.log(`  ${(await reg.isAllowedToken(rec.paymentToken)) ? "✓" : "✗"} USDC ${rec.paymentToken}`);
  console.log(`  ${(await reg.isAllowedToken(rec.wmatic)) ? "✓" : "✗"} WMATIC ${rec.wmatic}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
