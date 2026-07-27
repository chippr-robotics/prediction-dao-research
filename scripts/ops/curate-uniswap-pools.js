/**
 * Curate Uniswap V3 TradingLp pools on the LiquidityRouter.
 *
 * Pools are DISCOVERED from the chain's own Uniswap V3 factory, never from a hand-written table:
 * `factory.getPool(tokenA, tokenB, fee)` is asked for every supported pair × fee tier, and each hit
 * then has its `token0()`, `token1()` and `fee()` read back off the pool itself. Those exact values
 * are what get listed, so `listPool`'s cross-check (`PoolListingMismatch`) passes by construction
 * rather than by us guessing token ordering — the ordering is a property of the pool, not of our
 * table, and getting it wrong is how you list a pool whose metadata lies to the member.
 *
 * Pools with zero liquidity are SKIPPED. A pool can exist and be empty; offering one to a member
 * means a mint that succeeds into nothing useful and a position they cannot exit at a sane price.
 *
 * Only TradingLp is curated here. BridgeLp is deliberately out of scope: it is the path where an
 * arbitrary `poolAddress` becomes a direct member-call target with no on-chain validation (open HIGH
 * T150 finding), and listing one is exactly what makes it reachable.
 *
 * Usage:
 *   DRY_RUN=1 npx hardhat run scripts/ops/curate-uniswap-pools.js --network <net>
 *   CONFIRM=<net> [ENABLE=1] npx hardhat run scripts/ops/curate-uniswap-pools.js --network <net>
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = hre;
const { getDeploymentFilename } = require("../deploy/lib/helpers");

// Uniswap V3 factory per chain — Base is deliberately NOT the canonical address (research R4b).
const FACTORY = {
  1: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  10: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  137: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  8453: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  42161: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
};

/** Tokens the platform surfaces, per chain. Same set the bridge routes were curated over. */
const TOKENS = {
  1: {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  },
  10: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    USDT: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    WBTC: "0x68f180fcCe6836688e9084f035309E29Bf0A2095",
  },
  137: {
    WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  },
  8453: {
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
  42161: {
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    DAI: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  },
};

const FEE_TIERS = [100, 500, 3000, 10000];

// Rough unit prices, used ONLY to rank pools against each other so the cut keeps the deep ones.
// Uniswap's own `liquidity()` cannot do this job: it is an L value in sqrt(token0*token1) units, so
// it is comparable between fee tiers of the SAME pair and meaningless between different pairs — a
// DAI/WMATIC pool outranks a far deeper WETH/USDC one purely because its units are bigger. Nothing
// on-chain depends on these numbers; being off by 2x only nudges the ordering near the cut line.
const APPROX_USD = { WETH: 3000, WBTC: 60000, USDC: 1, USDT: 1, DAI: 1, WMATIC: 0.4 };

const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const POOL_KIND_TRADING = 2;

/**
 * What the pool actually holds, valued at APPROX_USD. Balances (not `liquidity()`) because balances
 * are in real token units and so are comparable between pairs, which is the only thing being asked.
 */
async function approxTvlUsd(poolAddress, syms, tokens, decimalsOf) {
  let total = 0;
  for (const sym of syms) {
    const price = APPROX_USD[sym];
    if (price === undefined) return 0; // unpriced token — cannot rank it, so it never makes the cut
    const erc20 = new ethers.Contract(tokens[sym], ERC20_ABI, ethers.provider);
    const [bal, dec] = await Promise.all([erc20.balanceOf(poolAddress), decimalsOf(sym, erc20)]);
    total += Number(ethers.formatUnits(bal, dec)) * price;
  }
  return total;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const dryRun = process.env.DRY_RUN === "1";
  const confirmed = process.env.CONFIRM === hre.network.name;
  const enabled = process.env.ENABLE === "1";

  const factoryAddress = FACTORY[chainId];
  const tokens = TOKENS[chainId];
  if (!factoryAddress || !tokens) throw new Error(`no Uniswap config for chain ${chainId}`);

  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "deployments", getDeploymentFilename(network, "v2")), "utf8"),
  );
  const routerAddress = record.contracts?.liquidityRouter;
  if (!routerAddress) throw new Error(`no liquidityRouter recorded on chain ${chainId}`);

  const [signer] = await ethers.getSigners();
  const router = await ethers.getContractAt("LiquidityRouter", routerAddress);
  const role = await router.LIQUIDITY_ADMIN_ROLE();
  if (!(await router.hasRole(role, signer.address))) {
    throw new Error(`${signer.address} lacks LIQUIDITY_ADMIN_ROLE on ${routerAddress} (chain ${chainId})`);
  }

  // The factory the router will actually mint through must be the one we discovered against.
  const pmFactory = await (
    await ethers.getContractAt(["function factory() view returns (address)"], await router.positionManager())
  ).factory();
  if (ethers.getAddress(pmFactory) !== ethers.getAddress(factoryAddress)) {
    throw new Error(
      `positionManager.factory() = ${pmFactory} but discovering against ${factoryAddress} — refusing to curate`,
    );
  }

  console.log(`chain ${chainId} (${hre.network.name}) — LiquidityRouter ${routerAddress}`);
  console.log(`  factory ${factoryAddress} (matches positionManager) ✓`);
  console.log(`  listing ${enabled ? "ENABLED" : "DISABLED (set ENABLE=1 to open them)"}`);

  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, ethers.provider);
  const symbols = Object.keys(tokens);
  const seen = new Set();
  const found = [];
  const decimalCache = new Map();
  const decimalsOf = async (sym, erc20) => {
    if (!decimalCache.has(sym)) decimalCache.set(sym, Number(await erc20.decimals()));
    return decimalCache.get(sym);
  };

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      for (const fee of FEE_TIERS) {
        const addr = await factory.getPool(tokens[symbols[i]], tokens[symbols[j]], fee).catch(() => ethers.ZeroAddress);
        if (addr === ethers.ZeroAddress || seen.has(addr)) continue;
        seen.add(addr);
        const pool = new ethers.Contract(addr, POOL_ABI, ethers.provider);
        try {
          // Read the pool's OWN view of itself — this is what listPool cross-checks against.
          const [t0, t1, f, liq] = await Promise.all([pool.token0(), pool.token1(), pool.fee(), pool.liquidity()]);
          if (liq === 0n) {
            console.log(`  · ${symbols[i]}/${symbols[j]} ${fee}  empty pool — skipped`);
            continue;
          }
          const tvl = await approxTvlUsd(addr, [symbols[i], symbols[j]], tokens, decimalsOf);
          found.push({
            addr,
            t0: ethers.getAddress(t0),
            t1: ethers.getAddress(t1),
            fee: Number(f),
            tvl,
            label: `${symbols[i]}/${symbols[j]} ${fee}`,
          });
        } catch {
          console.log(`  · ${symbols[i]}/${symbols[j]} ${fee}  unreadable — skipped`);
        }
      }
    }
  }

  // `liquidity() > 0` only proves a pool is not empty — plenty hold dust. Offering a member a pool
  // with no depth is offering them a position they cannot exit at a sane price, so keep the deepest
  // by approximate TVL and say out loud what was dropped: a silent top-N reads as "we listed
  // everything good". MIN_TVL_USD floors it so a thin chain lists few pools rather than bad ones.
  found.sort((a, b) => b.tvl - a.tvl);
  const cap = Number(process.env.MAX_POOLS || 12);
  const floor = Number(process.env.MIN_TVL_USD || 250000);
  const deep = found.filter((p) => p.tvl >= floor);
  const keep = deep.slice(0, cap);
  const dropped = found.filter((p) => !keep.includes(p));
  console.log(`  ${found.length} non-empty pool(s); curating the ${keep.length} deepest`);
  console.log(`  cut: TVL >= $${floor.toLocaleString()} (approx), at most ${cap} pools`);
  if (dropped.length) {
    console.log(
      `  NOT curated — too thin or below the cut:\n` +
        dropped.map((d) => `      ${d.label.padEnd(18)} ~$${Math.round(d.tvl).toLocaleString()}`).join("\n"),
    );
  }

  let written = 0;
  let already = 0;
  for (const p of keep) {
    const poolId = await router.computePoolId(POOL_KIND_TRADING, p.addr, p.t0, p.t1);
    const existing = await router.getPool(poolId).catch(() => null);
    const isListed = existing && Number(existing.kind) === POOL_KIND_TRADING;
    if (isListed && Boolean(existing.enabled) === enabled) {
      already++;
      console.log(`  · ${p.label.padEnd(18)} already listed`);
      continue;
    }
    if (dryRun || !confirmed) {
      console.log(
      `  → ${p.label.padEnd(18)} WOULD ${isListed ? "UPDATE" : "LIST"}  ${p.addr}  ~$${Math.round(p.tvl).toLocaleString()}`,
    );
      continue;
    }
    await (
      await router.listPool({
        kind: POOL_KIND_TRADING,
        enabled,
        feeTier: p.fee,
        token0: p.t0,
        token1: p.t1,
        poolAddress: p.addr,
        maxDeposit0PerTx: 0n, // 0 = no cap; tighten per pool with setPoolLimit
        maxDeposit1PerTx: 0n,
      })
    ).wait();
    written++;
    console.log(`  ✓ ${p.label.padEnd(18)} ${isListed ? "updated" : "listed"}  ${p.addr}`);
  }

  console.log(`\n  ${keep.length} curated · ${already} unchanged · ${written} written · ${dropped.length} left out`);
  if (!confirmed && !dryRun) console.log(`  Nothing sent. Set CONFIRM=${hre.network.name} to execute.`);
}

main().catch((e) => {
  console.error("\n" + (e.message || e));
  process.exitCode = 1;
});
