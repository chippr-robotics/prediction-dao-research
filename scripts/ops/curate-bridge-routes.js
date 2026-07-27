/**
 * Curate BridgeRouter routes from Across's OWN list of supported routes.
 *
 * Why driven by their API rather than a hand-written table: a route we list that Across does not
 * support is worse than no route — the member picks it, signs, and the deposit reverts (or worse,
 * succeeds into a token nobody fills). The set of supported (origin, token) → (destination, token)
 * pairs is Across's to define and it changes, so it is fetched, filtered to the chains and tokens
 * this platform actually offers, and only then written on-chain.
 *
 * Routes are listed DISABLED by default (`ENABLE=1` to list them enabled), so curation and going
 * live are separate decisions.
 *
 * Only routes ORIGINATING on the connected chain are written — a route lives on the origin chain's
 * router, and BridgeRouter.setRoute rejects `destinationChainId == block.chainid`.
 *
 * Usage:
 *   DRY_RUN=1 npx hardhat run scripts/ops/curate-bridge-routes.js --network <net>
 *   CONFIRM=<net> [ENABLE=1] npx hardhat run scripts/ops/curate-bridge-routes.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { getDeploymentFilename } = require("../deploy/lib/helpers");

const ACROSS_ROUTES_URL = "https://app.across.to/api/available-routes";

// The chains this platform offers bridging between (spec 067 control-plane mainnets).
const OUR_CHAINS = new Set([1, 10, 137, 8453, 42161]);

// Tokens the platform surfaces. WLD is deliberately excluded: Across supports it, we do not list it
// anywhere in the app, and curating an asset members cannot otherwise see invites confusion.
const OUR_TOKENS = new Set(["ETH", "WETH", "USDC", "USDT", "DAI", "WBTC"]);

// Across quotes fills in low minutes; the contract bounds are 60s..86400s. 20 minutes is a heavily
// conservative ADVISORY figure shown to members — the UI treats the real arrival as unknown until
// the destination chain confirms, so an over-estimate here is honest rather than optimistic.
const EXPECTED_FILL_SECONDS = 1200;

async function fetchRoutes() {
  const res = await fetch(ACROSS_ROUTES_URL);
  if (!res.ok) throw new Error(`Across route list unavailable: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const dryRun = process.env.DRY_RUN === "1";
  const confirmed = process.env.CONFIRM === hre.network.name;
  const enabled = process.env.ENABLE === "1";

  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "deployments", getDeploymentFilename(network, "v2")), "utf8"),
  );
  const routerAddress = record.contracts?.bridgeRouter;
  if (!routerAddress) throw new Error(`no bridgeRouter recorded on chain ${chainId}`);

  const [signer] = await ethers.getSigners();
  const router = await ethers.getContractAt("BridgeRouter", routerAddress);

  // Authority check up front: a curation run that dies halfway through 30 routes is worse than one
  // that refuses to start.
  const role = await router.LIQUIDITY_ADMIN_ROLE();
  if (!(await router.hasRole(role, signer.address))) {
    throw new Error(
      `${signer.address} lacks LIQUIDITY_ADMIN_ROLE on BridgeRouter ${routerAddress} (chain ${chainId}). ` +
        `Curate from an account that holds it.`,
    );
  }

  const all = await fetchRoutes();
  const mine = all.filter(
    (r) =>
      Number(r.originChainId) === chainId &&
      OUR_CHAINS.has(Number(r.destinationChainId)) &&
      OUR_TOKENS.has(r.originTokenSymbol) &&
      OUR_TOKENS.has(r.destinationTokenSymbol),
  );

  console.log(`chain ${chainId} (${hre.network.name}) — BridgeRouter ${routerAddress}`);
  console.log(`  curator: ${signer.address}`);
  console.log(`  Across offers ${mine.length} supported route(s) from here to our other chains`);
  console.log(`  listing them ${enabled ? "ENABLED" : "DISABLED (set ENABLE=1 to open them)"}`);

  let written = 0;
  let already = 0;
  for (const r of mine) {
    const route = {
      inputToken: ethers.getAddress(r.originToken),
      outputToken: ethers.getAddress(r.destinationToken),
      destinationChainId: Number(r.destinationChainId),
      maxAmount: 0n, // 0 = no per-transaction cap; tighten per route with setRouteLimit
      expectedFillSeconds: EXPECTED_FILL_SECONDS,
      nativeInput: Boolean(r.isNative),
      enabled,
    };
    const routeId = await router.computeRouteId(route.inputToken, route.outputToken, route.destinationChainId);
    const existing = await router.getRoute(routeId).catch(() => null);
    const isListed = existing && existing.inputToken && existing.inputToken !== ethers.ZeroAddress;

    const label = `${r.originTokenSymbol}→${r.destinationChainId} ${r.destinationTokenSymbol}${route.nativeInput ? " (native)" : ""}`;
    if (isListed && Boolean(existing.enabled) === enabled) {
      already++;
      console.log(`  · ${label.padEnd(34)} already listed`);
      continue;
    }
    if (dryRun || !confirmed) {
      console.log(`  → ${label.padEnd(34)} WOULD ${isListed ? "UPDATE" : "LIST"}`);
      continue;
    }
    await (await router.setRoute(route)).wait();
    written++;
    console.log(`  ✓ ${label.padEnd(34)} ${isListed ? "updated" : "listed"}`);
  }

  console.log(`\n  ${mine.length} route(s) considered · ${already} unchanged · ${written} written`);
  if (!confirmed && !dryRun) console.log(`  Nothing sent. Set CONFIRM=${hre.network.name} to execute.`);
}

main().catch((e) => {
  console.error("\n" + (e.message || e));
  process.exitCode = 1;
});
