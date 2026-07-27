/**
 * Deploy + initialise a FeeRouter ERC1967 proxy over an ALREADY-DEPLOYED implementation, using
 * plain ethers rather than the hardhat provider.
 *
 * Why this exists: on Ethereum mainnet, `hardhat run` fails every contract-creation transaction with
 *   invalid value for value.to (invalid address, value="")
 * The transaction is broadcast and mines successfully — only the response parsing fails, so the
 * script dies after spending gas and before recording anything. The object in that error carries
 * `r/s/v = 0x0`, i.e. it is synthesised by hardhat's provider, not returned by the RPC (the
 * configured endpoint returns a compliant `to: null` when queried directly). Two implementations
 * were deployed and orphaned this way before we stopped using hardhat for this step.
 *
 * This script therefore talks to the RPC directly: same key, same artifacts, no hardhat provider.
 *
 * Usage:
 *   RPC_URL=… IMPL=0x… [TREASURY=0x…] node scripts/ops/deploy-fee-router-proxy-direct.js
 *   DRY_RUN=1 … to print the plan only.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..", "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const FEE_ROUTER = read("artifacts/contracts/fees/FeeRouter.sol/FeeRouter.json");
const PROXY = read("artifacts/@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol/ERC1967Proxy.json");
const { LAUNCH_FEE_SERVICES } = require("../deploy/lib/feeServices");

async function main() {
  const rpc = process.env.RPC_URL;
  const impl = process.env.IMPL;
  if (!rpc || !ethers.isAddress(impl || "")) throw new Error("RPC_URL and IMPL=0x… are required");

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const chainId = Number((await provider.getNetwork()).chainId);
  const record = read(`deployments/mainnet-chain${chainId}-v2.json`);
  const treasury = process.env.TREASURY || record.treasury;
  if (!ethers.isAddress(treasury || "")) throw new Error("no treasury (set TREASURY= or record it)");

  if ((await provider.getCode(impl)) === "0x") throw new Error(`no code at IMPL ${impl}`);

  const initData = new ethers.Interface(FEE_ROUTER.abi).encodeFunctionData("initialize", [
    wallet.address,
    treasury,
  ]);

  console.log(`chain ${chainId}`);
  console.log(`  impl:      ${impl}`);
  console.log(`  admin:     ${wallet.address}`);
  console.log(`  treasury:  ${treasury}`);
  console.log(`  balance:   ${ethers.formatEther(await provider.getBalance(wallet.address))}`);
  if (process.env.DRY_RUN === "1") return console.log("  (DRY_RUN)");

  const factory = new ethers.ContractFactory(PROXY.abi, PROXY.bytecode, wallet);
  const proxy = await factory.deploy(impl, initData);
  console.log(`  proxy tx:  ${proxy.deploymentTransaction().hash}`);
  await proxy.waitForDeployment();
  const address = await proxy.getAddress();
  console.log(`  ✓ proxy:   ${address}`);

  const router = new ethers.Contract(address, FEE_ROUTER.abi, wallet);
  console.log(`  treasury set to: ${await router.treasury()}`);

  // Register the launch services. Idempotent: a service already present is skipped, so this is safe
  // to re-run after a partial failure.
  for (const svc of LAUNCH_FEE_SERVICES) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
    const existing = await router.getService(id);
    if (Number(existing.kind) !== 0) {
      console.log(`  • ${svc.label} already registered`);
      continue;
    }
    const tx = await router.registerService(id, svc.capBps, svc.kind);
    await tx.wait();
    console.log(`  ✓ registered ${svc.label} (cap ${svc.capBps} bps, rate 0)`);
  }

  const file = path.join(ROOT, `deployments/mainnet-chain${chainId}-v2.json`);
  const out = JSON.parse(fs.readFileSync(file, "utf8"));
  out.contracts = out.contracts || {};
  out.contracts.feeRouter = address;
  out.contracts.feeRouterImpl = impl;
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`  recorded in deployments/mainnet-chain${chainId}-v2.json`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
