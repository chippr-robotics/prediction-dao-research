/**
 * Deploy the spec-067 BridgeRouter + LiquidityRouter on Ethereum mainnet using plain ethers.
 *
 * Companion to deploy-fee-router-proxy-direct.js and it exists for the same reason: `hardhat run`
 * cannot send a contract-creation transaction on chain 1 — it broadcasts successfully, the
 * transaction mines, and then response parsing dies with `value.to = ""`, so the script exits after
 * spending gas and before recording anything. This path talks to the RPC directly with the same key
 * and the same compiled artifacts, and reuses any implementation already orphaned by that bug.
 *
 * It mirrors deploy-bridge-liquidity.js exactly for the parts that matter:
 *   - the R4b protocol-address guard runs FIRST and aborts before anything is deployed
 *   - identical initialize args: (admin, feeRouter, spokePool|positionManager, sanctionsGuard)
 *   - the same two fee services registered at cap 250 bps / rate 0
 * It does NOT curate any route or pool, so the routers land inert.
 *
 * Usage: RPC_URL=… node scripts/ops/deploy-routers-direct.js
 *        BRIDGE_IMPL=0x… LIQUIDITY_IMPL=0x… to reuse orphaned implementations
 *        DRY_RUN=1 to print the plan
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..", "..");
const art = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const PROXY = art("artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json");
const BRIDGE = art("artifacts/contracts/bridge/BridgeRouter.sol/BridgeRouter.json");
const LIQUIDITY = art("artifacts/contracts/liquidity/LiquidityRouter.sol/LiquidityRouter.json");
const { ServiceKind } = require("../deploy/lib/feeServices");

// Chain-1 protocol addresses — must match PROTOCOL_ADDRESSES in deploy-bridge-liquidity.js.
const SPOKE_POOL = "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5";
const POSITION_MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UNISWAP_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

const SERVICES = [
  { label: "bridge.transfer", capBps: 250, kind: ServiceKind.ConfigOnly },
  { label: "liquidity.deposit", capBps: 250, kind: ServiceKind.ConfigOnly },
];

async function deployOrReuse(wallet, label, artifact, envKey) {
  const existing = process.env[envKey];
  if (existing && ethers.isAddress(existing)) {
    const code = await wallet.provider.getCode(existing);
    if (code !== "0x") {
      console.log(`  reusing ${label} implementation ${existing} (${(code.length - 2) / 2} bytes)`);
      return existing;
    }
    console.log(`  ${envKey}=${existing} has no code — deploying a fresh implementation`);
  }
  const f = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const c = await f.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log(`  ✓ ${label} implementation: ${addr}`);
  return addr;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== 1) throw new Error(`this direct path is for Ethereum mainnet; got chain ${chainId}`);

  const file = path.join(ROOT, "deployments/mainnet-chain1-v2.json");
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  const feeRouter = record.contracts?.feeRouter;
  if (!ethers.isAddress(feeRouter || "")) throw new Error("no feeRouter recorded for chain 1");
  const sanctionsGuard = record.contracts?.sanctionsGuard || ethers.ZeroAddress;

  // R4b guard — every protocol address must carry bytecode on THIS chain before anything deploys.
  console.log("R4b guard — verifying protocol addresses on chain 1:");
  for (const [name, addr] of Object.entries({ SPOKE_POOL, POSITION_MANAGER, UNISWAP_FACTORY, feeRouter })) {
    const code = await provider.getCode(addr);
    if (code === "0x") throw new Error(`${name} (${addr}) has no bytecode on chain 1 — aborting`);
    console.log(`  ✓ ${name.padEnd(16)} ${addr}`);
  }
  // Cross-check the position manager reports the factory we expect (identity, not just presence).
  const pm = new ethers.Contract(POSITION_MANAGER, ["function factory() view returns (address)"], provider);
  const reported = await pm.factory();
  if (ethers.getAddress(reported) !== ethers.getAddress(UNISWAP_FACTORY)) {
    throw new Error(`positionManager.factory() = ${reported}, expected ${UNISWAP_FACTORY}`);
  }
  console.log(`  ✓ positionManager.factory() matches`);

  console.log(`\nadmin/deployer: ${wallet.address}`);
  console.log(`balance:        ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);
  if (process.env.DRY_RUN === "1") return console.log("(DRY_RUN)");

  const out = { ...record, contracts: { ...record.contracts } };

  for (const cfg of [
    { key: "bridgeRouter", label: "BridgeRouter", artifact: BRIDGE, envKey: "BRIDGE_IMPL", target: SPOKE_POOL },
    { key: "liquidityRouter", label: "LiquidityRouter", artifact: LIQUIDITY, envKey: "LIQUIDITY_IMPL", target: POSITION_MANAGER },
  ]) {
    if (out.contracts[cfg.key]) {
      console.log(`\n${cfg.label} already recorded (${out.contracts[cfg.key]}) — skipping`);
      continue;
    }
    console.log(`\nDeploying ${cfg.label}...`);
    const impl = await deployOrReuse(wallet, cfg.label, cfg.artifact, cfg.envKey);
    const initData = new ethers.Interface(cfg.artifact.abi).encodeFunctionData("initialize", [
      wallet.address,
      feeRouter,
      cfg.target,
      sanctionsGuard,
    ]);
    const pf = new ethers.ContractFactory(PROXY.abi, PROXY.bytecode, wallet);
    const proxy = await pf.deploy(impl, initData);
    await proxy.waitForDeployment();
    const addr = await proxy.getAddress();
    console.log(`  ✓ ${cfg.label} proxy: ${addr}`);
    out.contracts[cfg.key] = addr;
    out.contracts[`${cfg.key}Impl`] = impl;
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n"); // record BEFORE the next step
  }

  // Fee services on the existing FeeRouter — idempotent.
  const fr = new ethers.Contract(
    feeRouter,
    art("artifacts/contracts/fees/FeeRouter.sol/FeeRouter.json").abi,
    wallet,
  );
  console.log("\nRegistering spec-067 fee services...");
  for (const svc of SERVICES) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
    if (Number((await fr.getService(id)).kind) !== 0) {
      console.log(`  • ${svc.label} already registered`);
      continue;
    }
    await (await fr.registerService(id, svc.capBps, svc.kind)).wait();
    console.log(`  ✓ registered ${svc.label} (cap ${svc.capBps} bps, rate 0)`);
  }
  console.log(`\nrecorded in deployments/mainnet-chain1-v2.json`);
  console.log("Routers are INERT: no route or pool is curated, so no member action is possible yet.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
