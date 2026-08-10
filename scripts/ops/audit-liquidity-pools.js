/**
 * Read back every curated LiquidityRouter pool on a chain and report it.
 * Read-only — the independent check that curation landed, is enabled, and points at a real pool.
 *
 * Each listing is re-verified against the pool contract itself: a listing whose token0/token1/fee
 * disagree with the pool would be one that describes a different market to the member than the one
 * their funds enter. `listPool` enforces this at write time; this asserts it still holds at read time.
 *
 * Usage: npx hardhat run scripts/ops/audit-liquidity-pools.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { getDeploymentFilename } = require("../deploy/lib/helpers");

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
];

const KIND = { 1: "BridgeLp", 2: "TradingLp" };

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "deployments", getDeploymentFilename(network, "v2")), "utf8"),
  );
  const address = record.contracts?.liquidityRouter;
  if (!address) throw new Error(`no liquidityRouter on chain ${chainId}`);
  const router = await ethers.getContractAt("LiquidityRouter", address);

  const count = Number(await router.poolCount());
  let enabled = 0;
  let mismatched = 0;
  const byKind = {};

  console.log(`chain ${chainId} (${hre.network.name}) — LiquidityRouter ${address}`);
  for (let i = 0; i < count; i++) {
    const p = await router.getPool(await router.poolAt(i));
    if (p.enabled) enabled++;
    const kind = KIND[Number(p.kind)] || `kind:${p.kind}`;
    byKind[kind] = (byKind[kind] || 0) + 1;

    // Ask the pool what it is, rather than trusting what we recorded about it.
    let agrees = "?";
    try {
      const pool = new ethers.Contract(p.poolAddress, POOL_ABI, ethers.provider);
      const [t0, t1, f] = await Promise.all([pool.token0(), pool.token1(), pool.fee()]);
      const ok =
        ethers.getAddress(t0) === ethers.getAddress(p.token0) &&
        ethers.getAddress(t1) === ethers.getAddress(p.token1) &&
        Number(f) === Number(p.feeTier);
      agrees = ok ? "✓" : "MISMATCH";
      if (!ok) mismatched++;
    } catch {
      agrees = "unreadable";
      mismatched++;
    }
    console.log(
      `  ${agrees.padEnd(10)} ${kind.padEnd(10)} fee ${String(p.feeTier).padStart(5)}  ` +
        `${p.enabled ? "enabled " : "disabled"}  ${p.poolAddress}`,
    );
  }

  console.log(
    `\n  ${count} pool(s), ${enabled} enabled  → ${Object.entries(byKind)
      .map(([k, n]) => `${k}:${n}`)
      .join(" ")}`,
  );
  const paused = await router.paused().catch(() => null);
  if (paused !== null) console.log(`  paused: ${paused}`);
  if (mismatched) {
    console.log(`  ${mismatched} listing(s) DISAGREE with their pool — investigate before members trade them`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
