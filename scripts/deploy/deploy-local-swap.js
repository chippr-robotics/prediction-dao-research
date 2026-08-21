/**
 * LOCAL DEV / E2E ONLY — a Uniswap stand-in so the swap surface (spec 033) has something to quote
 * against and something to execute through.
 *
 * A local node has no Uniswap deployment. Real Polygon Amoy has none either, which is why
 * `networks.js` builds Amoy's `dex` block from `VITE_AMOY_UNISWAP_*` env vars and leaves it null
 * when they are absent — this script deploys what those vars point at, and nothing else changes.
 *
 * The doubles live in `contracts/mocks/MockUniswapSwap.sol` and are recorded under `mocks`, never
 * `contracts`, so nothing that reads a deployment record for a protocol address can pick them up.
 * The script REFUSES to run anywhere but a local network: the swap router hands out its own float
 * on demand, which on a public chain is a faucet.
 *
 *   npx hardhat run scripts/deploy/deploy-local-swap.js --network localhost
 *
 * Runs LAST in `setup:e2e` so every nonce-derived address above it is untouched.
 */
const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { saveDeployment, getDeploymentFilename } = require("./lib/helpers");

const LOCAL_NETWORKS = new Set(["hardhat", "localhost"]);

/**
 * The rate the local pair trades at, as tokenOut-wei per tokenIn-wei, scaled by 1e18.
 *
 * Both local tokens carry 18 decimals (the local USDC stand-in is an 18-decimal MockERC20, which is
 * why `dev:e2e` sets VITE_AMOY_USDC_DECIMALS=18), so "2 WMATIC per USDC" is 2e18 and the inverse is
 * 0.5e18. The exact number is arbitrary — what a flow asserts is that the member's balances moved by
 * what the quote SAID, so the only property that matters is that the two directions disagree, which
 * makes a swap that silently ran backwards visible.
 */
const WMATIC_PER_USDC = ethers.parseUnits("2", 18);
const USDC_PER_WMATIC = ethers.parseUnits("0.5", 18);

/** How much of each token the router holds to pay out with. */
const ROUTER_FLOAT = ethers.parseUnits("1000000", 18);

async function main() {
  const network = await ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const [deployer] = await ethers.getSigners();

  if (!LOCAL_NETWORKS.has(networkName)) {
    throw new Error(
      `deploy-local-swap.js is local-only (got network "${networkName}"). These are test doubles: ` +
        `the router pays out from its own float, which on a real network is a faucet.`
    );
  }

  console.log("=".repeat(60));
  console.log("Uniswap stand-ins (spec 033) — LOCAL DEV ONLY");
  console.log("=".repeat(60));
  console.log(`Network:  ${networkName} (chainId ${Number(network.chainId)})`);
  console.log(`Deployer: ${deployer.address}`);

  const filename = getDeploymentFilename(network, "v2");
  const filepath = path.join(process.cwd(), "deployments", filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`No existing deployment record at deployments/${filename}. Run the core deploy first.`);
  }
  const record = JSON.parse(fs.readFileSync(filepath, "utf8"));
  const mocks = record.mocks || (record.mocks = {});

  const usdc = record.paymentToken || mocks.mockUSDC;
  const wmatic = record.wmatic || mocks.mockWMATIC;
  if (!ethers.isAddress(usdc || "") || !ethers.isAddress(wmatic || "")) {
    throw new Error(`No local USDC/WMATIC stand-ins recorded in deployments/${filename}.`);
  }
  console.log(`Pair: USDC ${usdc}  <->  WMATIC ${wmatic}`);

  const deploy = async (name, args = []) => {
    const c = await (await ethers.getContractFactory(name)).deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  const rates = await deploy("MockUniswapRates");
  const quoter = await deploy("MockUniswapQuoter", [await rates.getAddress()]);
  const router = await deploy("MockUniswapSwapRouter", [await rates.getAddress()]);

  await (await rates.setRate(usdc, wmatic, WMATIC_PER_USDC)).wait();
  await (await rates.setRate(wmatic, usdc, USDC_PER_WMATIC)).wait();

  // Fund the router so it can actually pay out. Both stand-ins are open mints on a local chain.
  const routerAddress = await router.getAddress();
  for (const token of [usdc, wmatic]) {
    const erc20 = await ethers.getContractAt("MockERC20", token);
    await (await erc20.mint(routerAddress, ROUTER_FLOAT)).wait();
  }

  mocks.mockUniswapRates = await rates.getAddress();
  mocks.mockUniswapQuoter = await quoter.getAddress();
  mocks.mockUniswapSwapRouter = routerAddress;
  saveDeployment(filename, record);

  console.log("\n" + "=".repeat(60));
  console.log("Appended to deployments/" + filename + " under `mocks`");
  console.log("=".repeat(60));
  console.log(`  mockUniswapRates       ${mocks.mockUniswapRates}   (also the factory stand-in)`);
  console.log(`  mockUniswapQuoter      ${mocks.mockUniswapQuoter}`);
  console.log(`  mockUniswapSwapRouter  ${mocks.mockUniswapSwapRouter}`);
  console.log("\nThese are the addresses frontend/package.json's `dev:e2e` passes as");
  console.log("VITE_AMOY_UNISWAP_FACTORY / _QUOTER / _SWAP_ROUTER. They are nonce-derived:");
  console.log("keep this script LAST in `setup:e2e` and re-derive them if that ever changes.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
