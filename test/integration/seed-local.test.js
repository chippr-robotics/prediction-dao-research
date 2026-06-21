const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const { seedLocal } = require("../../scripts/operations/seed-local");
const { ROLE_HASHES } = require("../../scripts/deploy/lib/constants");
const { deployWagerRegistry, deployMembershipManager } = require("../helpers/proxy");

const ROLE = ROLE_HASHES.WAGER_PARTICIPANT_ROLE;

/**
 * Validates the post-seed invariants for the Local Dev Environment (feature 006).
 * Deploys a faithful v2 set in-process, runs the exported seedLocal() routine,
 * then asserts that the two developer wallets are fully wager-ready — without a
 * live node or the browser. See specs/006-local-dev-environment/data-model.md.
 */
describe("Local Dev Environment — seedLocal invariants", function () {
  async function deployFixture() {
    const [walletZero, walletOne, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 0);
    await usdc.waitForDeployment();
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);
    await wmatic.waitForDeployment();

    const mm = await deployMembershipManager([
      walletZero.address,
      await usdc.getAddress(),
      treasury.address
    ]);
    await mm.waitForDeployment();

    const reg = await deployWagerRegistry([
      walletZero.address,
      await mm.getAddress(),
      ethers.ZeroAddress, // polymarket adapter disabled for the local default flow
      [await usdc.getAddress(), await wmatic.getAddress()]
    ]);

    // Deployment record in the exact shape seedLocal() / sync expect.
    const deployment = {
      paymentToken: await usdc.getAddress(),
      wmatic: await wmatic.getAddress(),
      contracts: {
        wagerRegistry: await reg.getAddress(),
        membershipManager: await mm.getAddress(),
      },
    };

    return { usdc, wmatic, mm, reg, deployment, walletZero, walletOne };
  }

  // Asserts ALL five post-seed invariants for one wallet (FR-003..FR-006).
  async function assertWalletReady(fx, wallet) {
    const addr = wallet.address;
    const regAddr = await fx.reg.getAddress();
    const oneStake = ethers.parseUnits("10", Number(await fx.usdc.decimals()));
    // FR-003: native gas (supplied by the node, asserted here for traceability)
    expect(await ethers.provider.getBalance(addr)).to.be.gt(0n);
    // FR-004: test-token balances
    expect(await fx.usdc.balanceOf(addr)).to.be.gt(0n);
    expect(await fx.wmatic.balanceOf(addr)).to.be.gt(0n);
    // FR-005: active WAGER_PARTICIPANT membership → createWager gate passes
    expect(await fx.mm.checkCanCreate(addr, ROLE)).to.equal(true);
    // FR-006: pre-approved allowance to the WagerRegistry, both stake tokens
    expect(await fx.usdc.allowance(addr, regAddr)).to.be.gte(oneStake);
    expect(await fx.wmatic.allowance(addr, regAddr)).to.be.gte(oneStake);
  }

  it("funds both wallets: gas + tokens + active membership + registry allowance", async () => {
    const fx = await loadFixture(deployFixture);

    // Pre-condition: a fresh wallet has NO active membership, so the post-seed
    // checkCanCreate=true below proves grantMembership actually transitioned state
    // (Tier.None → Bronze), not a pre-existing grant.
    for (const wallet of [fx.walletZero, fx.walletOne]) {
      expect(await fx.mm.checkCanCreate(wallet.address, ROLE)).to.equal(false);
    }

    const summary = await seedLocal({
      deployment: fx.deployment,
      wallets: [fx.walletZero, fx.walletOne],
      log: () => {},
    });
    expect(summary).to.have.lengthOf(2);

    for (const wallet of [fx.walletZero, fx.walletOne]) {
      await assertWalletReady(fx, wallet);
    }
  });

  it("is idempotent: re-running keeps ALL invariants valid (FR-010/FR-011)", async () => {
    const fx = await loadFixture(deployFixture);

    await seedLocal({ deployment: fx.deployment, wallets: [fx.walletZero, fx.walletOne], log: () => {} });
    // Re-run (simulates re-seeding after a redeploy) — must not throw and must
    // leave the environment fully valid across every invariant, not just some.
    await seedLocal({ deployment: fx.deployment, wallets: [fx.walletZero, fx.walletOne], log: () => {} });

    for (const wallet of [fx.walletZero, fx.walletOne]) {
      await assertWalletReady(fx, wallet);
    }
  });

  it("rejects a malformed deployment record", async () => {
    await expect(seedLocal({ deployment: { paymentToken: ethers.ZeroAddress } })).to.be.rejectedWith(
      /deployment must include/
    );
  });
});
