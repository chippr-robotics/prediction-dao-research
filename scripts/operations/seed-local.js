/**
 * seed-local.js — Fund two developer wallets on a LOCAL Hardhat chain so the
 * full create -> accept -> resolve wager lifecycle can be exercised end-to-end.
 *
 * For each target wallet it:
 *   1. mints the test ERC20 stake tokens (MockERC20 USDC + WMATIC),
 *   2. grants an active WAGER_PARTICIPANT membership (so MembershipManager
 *      .checkCanCreate passes — the gate in WagerRegistry.createWager/acceptWager),
 *   3. approves the WagerRegistry to pull the stake (removes UI approval friction).
 *
 * Native gas is already supplied by the Hardhat node (100k ETH per account), so
 * it is not minted here — it is asserted by the integration test instead.
 *
 * Idempotent: re-running after a node restart / redeploy restores the funded
 * state (mint adds, grantMembership overwrites, approve resets).
 *
 * Run:   npm run seed:local            # hardhat run ... --network localhost
 * Test:  const { seedLocal } = require('.../seed-local'); await seedLocal({ deployment })
 *
 * See specs/006-local-dev-environment/ for the spec, plan, and runbook.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers } = require("hardhat");
const { ROLE_HASHES, MembershipTier } = require("../deploy/lib/constants");

// Local-only chain ids. The script refuses to run anywhere else so it can never
// mint/grant against a real network.
const LOCAL_CHAIN_IDS = [1337, 31337];

// Defaults (human units; scaled by each token's on-chain decimals). Overridable.
const DEFAULTS = {
  usdc: process.env.SEED_USDC_AMOUNT || "1000000", // 1,000,000 USDC
  wmatic: process.env.SEED_WMATIC_AMOUNT || "1000", // 1,000 WMATIC
  membershipDays: Number(process.env.SEED_MEMBERSHIP_DAYS || 365),
};

function deploymentRecordPath(networkName, chainId) {
  return path.join(
    __dirname,
    "..",
    "..",
    "deployments",
    `${networkName}-chain${chainId}-v2.json`
  );
}

function loadDeployment(networkName, chainId) {
  const file = deploymentRecordPath(networkName, chainId);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No deployment record at ${file}.\n` +
        `Run \`npm run deploy:local\` first (with \`npm run node\` running in another terminal).`
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Core seeding routine — exported so the integration test can drive it against
 * an in-process deployment without a live node.
 *
 * @param {object}   opts
 * @param {object}   opts.deployment  { paymentToken, wmatic, contracts: { wagerRegistry, membershipManager } }
 * @param {object[]} [opts.wallets]   Signers to fund (default: signers[0] and signers[1])
 * @param {object}   [opts.amounts]   { usdc, wmatic, membershipDays }
 * @param {function} [opts.log]       Logger (default console.log; pass () => {} to silence)
 * @returns {Promise<object[]>}       Per-wallet summary
 */
async function seedLocal({ deployment, wallets, amounts = {}, log = console.log } = {}) {
  if (!deployment || !deployment.paymentToken || !deployment.wmatic || !deployment.contracts) {
    throw new Error(
      "seedLocal: deployment must include paymentToken, wmatic, and contracts.{wagerRegistry,membershipManager}"
    );
  }
  const { wagerRegistry, membershipManager } = deployment.contracts;
  if (!wagerRegistry || !membershipManager) {
    throw new Error("seedLocal: deployment.contracts must include wagerRegistry and membershipManager");
  }

  const cfg = { ...DEFAULTS, ...amounts };
  const signers = await ethers.getSigners();
  const deployer = signers[0]; // MembershipManager admin → holds ROLE_MANAGER_ROLE
  // Default to wallets #0 and #1 when not provided; an explicit non-empty array overrides.
  const targets = Array.isArray(wallets) && wallets.length > 0 ? wallets : [signers[0], signers[1]];

  const usdc = await ethers.getContractAt("MockERC20", deployment.paymentToken);
  const wmatic = await ethers.getContractAt("MockERC20", deployment.wmatic);
  const mm = await ethers.getContractAt("MembershipManager", membershipManager);

  // MockERC20 returns 18 decimals (OZ default); read it rather than assume.
  const usdcDecimals = Number(await usdc.decimals());
  const wmaticDecimals = Number(await wmatic.decimals());
  const usdcAmount = ethers.parseUnits(String(cfg.usdc), usdcDecimals);
  const wmaticAmount = ethers.parseUnits(String(cfg.wmatic), wmaticDecimals);
  const role = ROLE_HASHES.WAGER_PARTICIPANT_ROLE;

  const summary = [];
  for (const w of targets) {
    const addr = w.address;
    // 1. Mint test stake tokens (MockERC20.mint is permissionless).
    await (await usdc.connect(deployer).mint(addr, usdcAmount)).wait();
    await (await wmatic.connect(deployer).mint(addr, wmaticAmount)).wait();
    // 2. Grant an active WAGER_PARTICIPANT membership so checkCanCreate passes.
    await (
      await mm.connect(deployer).grantMembership(addr, role, MembershipTier.BRONZE, cfg.membershipDays)
    ).wait();
    // 3. Pre-approve the WagerRegistry to pull the stake.
    await (await usdc.connect(w).approve(wagerRegistry, ethers.MaxUint256)).wait();
    await (await wmatic.connect(w).approve(wagerRegistry, ethers.MaxUint256)).wait();

    const membershipActive = await mm.checkCanCreate(addr, role);
    const row = {
      address: addr,
      usdc: (await usdc.balanceOf(addr)).toString(),
      wmatic: (await wmatic.balanceOf(addr)).toString(),
      membershipActive,
      usdcAllowance: (await usdc.allowance(addr, wagerRegistry)).toString(),
    };
    summary.push(row);
    log(
      `  ✓ ${addr}  USDC=${ethers.formatUnits(row.usdc, usdcDecimals)}  ` +
        `WMATIC=${ethers.formatUnits(row.wmatic, wmaticDecimals)}  ` +
        `member=${membershipActive}  approved=${row.usdcAllowance !== "0"}`
    );
  }
  return summary;
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const networkName = hre.network.name;
  if (!LOCAL_CHAIN_IDS.includes(chainId)) {
    throw new Error(
      `seed-local is for local chains only (chainId ${LOCAL_CHAIN_IDS.join("/")}); ` +
        `refusing to run on chainId ${chainId} (${networkName}).`
    );
  }
  console.log(`\nSeeding local environment: ${networkName} (chainId ${chainId})`);
  const deployment = loadDeployment(networkName, chainId);
  const summary = await seedLocal({ deployment });
  console.log(
    `\nLocal environment seeded — ${summary.length} wallet(s) funded, ` +
      `membership granted, and WagerRegistry approved.`
  );
}

// Run main() when invoked as a script. `hardhat run` loads this file via require
// (so require.main !== module); detect the script path in argv as well so the
// guard fires under `hardhat run` but NOT when the test imports seedLocal.
const invokedDirectly =
  require.main === module || process.argv.some((a) => a.endsWith("seed-local.js"));
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exitCode = 1;
  });
}

module.exports = { seedLocal, loadDeployment, deploymentRecordPath };
