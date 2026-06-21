/**
 * verify.js — Source-verify the deployed v2 FairWins contracts on the active
 * network's block explorer.
 *
 *   - Polygon (137) / Amoy (80002): Polygonscan via Etherscan API V2 (ETHERSCAN_API_KEY)
 *   - Mordor (63) / Ethereum Classic (61): Blockscout (no real API key needed)
 *
 * Reads the deployment record deployments/<network>-chain<id>-v2.json and submits
 * each contract WE deployed (not external tokens) with its constructor arguments.
 * Idempotent and re-runnable: "already verified" is treated as success, and it
 * retries with backoff while the explorer is still indexing fresh bytecode.
 *
 * The hardhat.config.js `etherscan` block auto-selects Etherscan-V2 vs Blockscout
 * from the --network flag, so no extra config is needed here.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/verify.js --network polygon   # needs ETHERSCAN_API_KEY
 *   npx hardhat run scripts/deploy/verify.js --network amoy      # needs ETHERSCAN_API_KEY
 *   npx hardhat run scripts/deploy/verify.js --network mordor    # Blockscout, no key
 *   npx hardhat run scripts/deploy/verify.js --network etc       # Blockscout, no key
 *   DRY_RUN=true npx hardhat run scripts/deploy/verify.js --network <net>   # print plan only
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { CHAINLINK_FUNCTIONS_ROUTER, UMA_OOV3 } = require("./lib/constants");

const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";
const ZERO = "0x0000000000000000000000000000000000000000";

// Real Chainalysis sanctions oracle per chain (mirrors deploy.js). Testnets deploy a
// MockSanctionsOracle instead, recorded under record.mocks.mockSanctionsOracle.
const CHAINALYSIS_ORACLE = { 137: "0x40C57923924B5c5c5455c48D93317139ADDaC8fb" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAddr = (a) => typeof a === "string" && ethers.isAddress(a) && a.toLowerCase() !== ZERO;

async function verifyOne(name, address, constructorArguments, contract) {
  const params = { address, constructorArguments };
  if (contract) params.contract = contract;

  if (DRY_RUN) {
    console.log(`  [dry-run] ${name} @ ${address}`);
    console.log(`            contract=${contract}`);
    console.log(`            args=${JSON.stringify(constructorArguments)}`);
    return "dry-run";
  }

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await hre.run("verify:verify", params);
      console.log(`  ✓ verified ${name} @ ${address}`);
      return "verified";
    } catch (err) {
      const msg = String((err && err.message) || err);

      // Already verified -> success (re-runnable). Covers Etherscan + Blockscout strings.
      if (/already verified|already been verified|smart-contract already verified/i.test(msg)) {
        console.log(`  • already verified ${name} @ ${address}`);
        return "already-verified";
      }

      // Explorer hasn't indexed the bytecode yet, or transient network error -> backoff.
      if (
        attempt < maxAttempts &&
        /does not have bytecode|has not been deployed|Unable to locate ContractCode|not found|Pending in queue|rate limit|ECONNRESET|ETIMEDOUT|50[23]/i.test(msg)
      ) {
        const wait = Math.min(2000 * 2 ** (attempt - 1), 30000); // 2s,4s,8s,16s,30s
        console.log(`  … ${name} attempt ${attempt} not ready (${msg.split("\n")[0]}); retry in ${wait}ms`);
        await sleep(wait);
        continue;
      }

      console.error(`  ✗ ${name} @ ${address} failed: ${msg.split("\n")[0]}`);
      throw err;
    }
  }
  throw new Error(`gave up verifying ${name} @ ${address}`);
}

async function main() {
  const networkName = hre.network.name;
  // Prefer the configured chainId (no RPC round-trip; works in DRY_RUN offline).
  const chainId = hre.network.config.chainId
    ? Number(hre.network.config.chainId)
    : Number((await ethers.provider.getNetwork()).chainId);
  const recordPath = path.join(__dirname, "..", "..", "deployments", `${networkName}-chain${chainId}-v2.json`);

  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `No deployment record at ${recordPath}.\n` +
        `Deploy first: npx hardhat run scripts/deploy/deploy.js --network ${networkName}`
    );
  }

  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const c = record.contracts || {};
  const m = record.mocks || {};
  const deployer = record.deployer;
  const treasury = record.treasury;

  console.log("=".repeat(60));
  console.log(`Verify v2 contracts — ${networkName} (chainId ${chainId})${DRY_RUN ? "  [DRY RUN]" : ""}`);
  console.log(`Record: ${recordPath}`);
  console.log("=".repeat(60) + "\n");

  // SanctionsGuard oracle arg: real Chainalysis on 137, else the deployed mock (testnets).
  const sanctionsOracle = chainId === 137
    ? (process.env.CHAINALYSIS_SANCTIONS_ORACLE_137 || CHAINALYSIS_ORACLE[137])
    : m.mockSanctionsOracle;

  // WagerRegistry stake-token allowlist, in deploy order: [paymentToken, wmatic].filter.
  const initialTokens = [record.paymentToken, record.wmatic].filter(isAddr);

  // Build the ordered plan. Only OUR contracts (skip external stable/wrapped tokens).
  // Entries whose address is absent (core-only Mordor omits oracle adapters + token
  // mocks) are silently skipped. Prefer the constructor args PERSISTED in the record
  // (exact deploy-time values); the fallback reconstruction is for older records that
  // predate record.constructorArgs (e.g. the current amoy/polygon records).
  const persisted = record.constructorArgs || {};
  const plan = [];
  const add = (name, address, key, fallbackArgs, fqn) => {
    if (!isAddr(address)) return;
    const args = persisted[key] !== undefined ? persisted[key] : fallbackArgs;
    plan.push({ name, address, args, fqn });
  };

  // MembershipManager is a UUPS proxy (spec 027): verify the IMPLEMENTATION (no constructor args — init data
  // lives in the proxy). Explorers detect the ERC1967 proxy and link it to this verified implementation.
  // Older (pre-027, non-proxy) records have no membershipManagerImpl: fall back to verifying the address under
  // `membershipManager` with the legacy constructor args.
  if (isAddr(c.membershipManagerImpl)) {
    add("MembershipManager", c.membershipManagerImpl, "membershipManagerImpl", [],
      "contracts/access/MembershipManager.sol:MembershipManager");
  } else {
    add("MembershipManager", c.membershipManager, "membershipManager",
      [deployer, record.paymentToken, treasury],
      "contracts/access/MembershipManager.sol:MembershipManager");
  }
  // WagerRegistry is a UUPS proxy: verify the IMPLEMENTATION (no constructor args — init data lives in the
  // proxy). Explorers detect the ERC1967 proxy and link it to this verified implementation automatically.
  // Older (pre-025, non-proxy) records have no wagerRegistryImpl: fall back to verifying the address under
  // `wagerRegistry` with the legacy constructor args.
  if (isAddr(c.wagerRegistryImpl)) {
    add("WagerRegistry", c.wagerRegistryImpl, "wagerRegistryImpl", [],
      "contracts/wagers/WagerRegistry.sol:WagerRegistry");
  } else {
    add("WagerRegistry", c.wagerRegistry, "wagerRegistry",
      [deployer, c.membershipManager, isAddr(c.polymarketAdapter) ? c.polymarketAdapter : ZERO, initialTokens],
      "contracts/wagers/WagerRegistry.sol:WagerRegistry");
  }
  add("MembershipVoucher", c.membershipVoucher, "membershipVoucher",
    [deployer, c.membershipManager],
    "contracts/access/MembershipVoucher.sol:MembershipVoucher");
  add("VoucherBatchMinter", c.voucherBatchMinter, "voucherBatchMinter",
    [c.membershipVoucher],
    "contracts/access/VoucherBatchMinter.sol:VoucherBatchMinter");
  add("KeyRegistry", c.keyRegistry, "keyRegistry", [],
    "contracts/privacy/KeyRegistry.sol:KeyRegistry");
  add("SanctionsGuard", c.sanctionsGuard, "sanctionsGuard", [deployer, sanctionsOracle],
    "contracts/access/SanctionsGuard.sol:SanctionsGuard");

  // Oracle adapters — present only on Polymarket/Chainlink/UMA-enabled networks.
  add("PolymarketOracleAdapter", c.polymarketAdapter, "polymarketAdapter", [deployer, record.polymarketCTF],
    "contracts/oracles/PolymarketOracleAdapter.sol:PolymarketOracleAdapter");
  add("ChainlinkDataFeedOracleAdapter", c.chainlinkDataFeedAdapter, "chainlinkDataFeedAdapter", [deployer],
    "contracts/oracles/ChainlinkDataFeedOracleAdapter.sol:ChainlinkDataFeedOracleAdapter");
  add("ChainlinkFunctionsOracleAdapter", c.chainlinkFunctionsAdapter, "chainlinkFunctionsAdapter", [deployer, CHAINLINK_FUNCTIONS_ROUTER[networkName]],
    "contracts/oracles/ChainlinkFunctionsOracleAdapter.sol:ChainlinkFunctionsOracleAdapter");
  add("UMAOptimisticOracleV3Adapter", c.umaAdapter, "umaAdapter", [deployer, UMA_OOV3[networkName]],
    "contracts/oracles/UMAOptimisticOracleV3Adapter.sol:UMAOptimisticOracleV3Adapter");

  // Mocks we deployed (testnets / no-real-token networks). Verifying them lets users
  // read the source on the explorer.
  add("MockSanctionsOracle", m.mockSanctionsOracle, "mockSanctionsOracle", [],
    "contracts/mocks/MockSanctionsOracle.sol:MockSanctionsOracle");
  add("MockERC20 (USDC)", m.mockUSDC, "mockUSDC", ["USD Coin", "USDC", 0],
    "contracts/mocks/MockERC20.sol:MockERC20");
  add("MockERC20 (WMATIC)", m.mockWMATIC, "mockWMATIC", ["Wrapped Matic", "WMATIC", 0],
    "contracts/mocks/MockERC20.sol:MockERC20");
  add("MockPolymarketCTF", m.mockPolymarketCTF, "mockPolymarketCTF", [],
    "contracts/test/MockPolymarketCTF.sol:MockPolymarketCTF");

  if (plan.length === 0) {
    console.log("Nothing to verify (no recorded contract addresses).");
    return;
  }

  // Guard against a SanctionsGuard with an unknown oracle arg (would mis-verify).
  const sg = plan.find((p) => p.name === "SanctionsGuard");
  if (sg && !isAddr(sg.args[1])) {
    throw new Error(
      `Cannot reconstruct SanctionsGuard oracle arg for chain ${chainId}. ` +
        `Expected record.mocks.mockSanctionsOracle (testnet) or CHAINALYSIS_ORACLE[137].`
    );
  }

  const results = { verified: 0, "already-verified": 0, "dry-run": 0 };
  for (const item of plan) {
    const outcome = await verifyOne(item.name, item.address, item.args, item.fqn);
    results[outcome] = (results[outcome] || 0) + 1;
  }

  console.log("\n" + "=".repeat(60));
  console.log(
    `Done — ${results.verified} verified, ${results["already-verified"]} already verified` +
      (DRY_RUN ? `, ${results["dry-run"]} planned (dry run)` : "")
  );
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
