/**
 * Read back every curated BridgeRouter route on a chain and report it.
 * Read-only — the independent check that curation actually landed and is enabled.
 *
 * Usage: npx hardhat run scripts/ops/audit-bridge-routes.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { getDeploymentFilename } = require("../deploy/lib/helpers");

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "deployments", getDeploymentFilename(network, "v2")), "utf8"),
  );
  const address = record.contracts?.bridgeRouter;
  if (!address) throw new Error(`no bridgeRouter on chain ${chainId}`);
  const router = await ethers.getContractAt("BridgeRouter", address);

  const count = Number(await router.routeCount());
  const ids = [];
  for (let i = 0; i < count; i++) ids.push(await router.routeAt(i));
  let enabled = 0;
  const byDest = {};
  for (const id of ids) {
    const r = await router.getRoute(id);
    if (r.enabled) enabled++;
    const d = Number(r.destinationChainId);
    byDest[d] = (byDest[d] || 0) + (r.enabled ? 1 : 0);
  }
  console.log(
    `chain ${chainId} (${hre.network.name}) — ${ids.length} route(s), ${enabled} enabled` +
      `  → ${Object.entries(byDest).map(([d, n]) => `${d}:${n}`).join(" ")}`,
  );
  const paused = await router.paused().catch(() => null);
  if (paused !== null) console.log(`  paused: ${paused}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
