/**
 * validate-amoy-deployment.js  (READ-ONLY, network-aware)
 *
 * Computes the deterministic CREATE2 addresses for the CURRENT compiled
 * contracts — exactly as scripts/deploy/deploy.js would for the active network
 * — and checks on-chain which ones are actually deployed. Compares predicted vs
 * the deployment record vs the frontend config. Sends NO transactions.
 *
 *   npx hardhat run scripts/debug/validate-amoy-deployment.js --network amoy
 *   npx hardhat run scripts/debug/validate-amoy-deployment.js --network polygon   (method cross-check)
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const {
  SALT_PREFIXES,
  SINGLETON_FACTORY_ADDRESS,
  TOKENS,
  POLYMARKET_CTF,
  CHAINLINK_FUNCTIONS_ROUTER,
  UMA_OOV3,
} = require("../deploy/lib/constants");

const DEPLOYER = "0x52502d049571C7893447b86c4d8B38e6184bF6e1";
// Mirrors the inline map in deploy.js (real Chainalysis oracle on mainnet only).
const CHAINALYSIS_ORACLE = { 137: "0x40C57923924B5c5c5455c48D93317139ADDaC8fb" };
const V2 = SALT_PREFIXES.V2;
const salt = (suffix) => ethers.id(V2 + suffix);

async function predict(name, args, saltSuffix) {
  const f = await ethers.getContractFactory(name);
  const tx = await f.getDeployTransaction(...args);
  const initCodeHash = ethers.keccak256(tx.data);
  return ethers.getCreate2Address(SINGLETON_FACTORY_ADDRESS, salt(saltSuffix), initCodeHash);
}
async function codeLen(addr) {
  if (!addr || addr === "(absent)") return 0;
  const code = await ethers.provider.getCode(addr);
  return code === "0x" ? 0 : (code.length - 2) / 2;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const networkName = hre.network.name;
  console.log(`\nNetwork: ${networkName} (chainId ${chainId})`);

  const recordPath = path.join(__dirname, "..", "..", "deployments", `${networkName}-chain${chainId}-v2.json`);
  const record = fs.existsSync(recordPath)
    ? JSON.parse(fs.readFileSync(recordPath, "utf8"))
    : { contracts: {}, mocks: {}, treasury: DEPLOYER };

  const usdc = TOKENS[networkName].USC;
  const wmatic = TOKENS[networkName].WMATIC;
  // Use the treasury that was actually passed at deploy time (it's a ctor arg of
  // MembershipManager, so it affects the CREATE2 address). Falls back to deployer.
  const treasury = record.treasury || DEPLOYER;
  console.log(`treasury (ctor arg): ${treasury}`);
  console.log(`usdc=${usdc}  wmatic=${wmatic}`);

  // Resolve Polymarket CTF the way deploy.js does: configured real CTF, else a
  // deterministic MockPolymarketCTF.
  let polymarketCTF = POLYMARKET_CTF[networkName];
  if (!polymarketCTF) {
    polymarketCTF = await predict("MockPolymarketCTF", [], "MockPolymarketCTF");
    console.log(`polymarketCTF (mock): ${polymarketCTF}`);
  } else {
    console.log(`polymarketCTF (real): ${polymarketCTF}`);
  }

  // Resolve sanctions oracle: real Chainalysis on mainnet, else mock.
  let sanctionsOracle = CHAINALYSIS_ORACLE[chainId];
  if (!sanctionsOracle) {
    sanctionsOracle = await predict("MockSanctionsOracle", [], "MockSanctionsOracle");
    console.log(`sanctionsOracle (mock): ${sanctionsOracle}`);
  } else {
    console.log(`sanctionsOracle (real): ${sanctionsOracle}`);
  }

  // ---- predict in dependency order (mirrors deploy.js) ----
  const adapter = await predict("PolymarketOracleAdapter", [DEPLOYER, polymarketCTF], "PolymarketOracleAdapter");
  const mgr = await predict("MembershipManager", [DEPLOYER, usdc, treasury], "MembershipManager");
  const reg = await predict("WagerRegistry", [DEPLOYER, mgr, adapter, [usdc, wmatic]], "WagerRegistry-userindex");
  const guard = await predict("SanctionsGuard", [DEPLOYER, sanctionsOracle], "SanctionsGuard");
  const cl = await predict("ChainlinkDataFeedOracleAdapter", [DEPLOYER], "ChainlinkDataFeedOracleAdapter");
  const fn = await predict("ChainlinkFunctionsOracleAdapter", [DEPLOYER, CHAINLINK_FUNCTIONS_ROUTER[networkName]], "ChainlinkFunctionsOracleAdapter");
  const uma = await predict("UMAOptimisticOracleV3Adapter", [DEPLOYER, UMA_OOV3[networkName]], "UMAOptimisticOracleV3Adapter");
  const key = await predict("KeyRegistry", [], "KeyRegistry");

  const predicted = {
    polymarketAdapter: adapter,
    membershipManager: mgr,
    wagerRegistry: reg,
    sanctionsGuard: guard,
    chainlinkDataFeedAdapter: cl,
    chainlinkFunctionsAdapter: fn,
    umaAdapter: uma,
    keyRegistry: key,
  };

  console.log("\n" + "=".repeat(118));
  console.log("contract".padEnd(26), "predicted (current bytecode)".padEnd(44), "on-chain   record          match");
  console.log("=".repeat(118));
  let allMatch = true;
  for (const [k, addr] of Object.entries(predicted)) {
    const len = await codeLen(addr);
    const rec = (record.contracts && record.contracts[k]) || "(absent)";
    const matchRec = rec.toLowerCase() === addr.toLowerCase();
    if (!matchRec) allMatch = false;
    const status = len > 0 ? `LIVE ${String(len).padStart(5)}b` : "MISSING    ";
    console.log(`${k.padEnd(26)} ${addr}  ${status} ${matchRec ? "✓ rec-match" : "✗ rec-DIFF"}`);
  }
  console.log("=".repeat(118));
  console.log(allMatch
    ? "RESULT: every predicted address matches the deployment record → prediction method is SOUND."
    : "RESULT: some predicted addresses differ from the record (see ✗ rows above).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
