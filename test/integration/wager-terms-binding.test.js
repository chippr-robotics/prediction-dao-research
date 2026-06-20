const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry } = require("../helpers/proxy");

// On-chain governing-terms binding for wagers (Spec 007 — FR-056/FR-057/FR-058, SC-017).
// createWagerWithTerms records & emits the version hash; the existing createWager ABI is
// unchanged (no binding); existing wagers keep their hash (prospective-only, never re-bound).

const Tier = { None: 0, Bronze: 1 };
const Resolution = { Either: 0 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);
const V1 = "0x" + "11".repeat(32);
const V2 = "0x" + "22".repeat(32);

describe("Wager terms-version binding (integration)", function () {
  async function deployFixture() {
    const [admin, alice, bob, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    await usdcToken.waitForDeployment();

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.waitForDeployment();
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true);

    const reg = await deployWagerRegistry([admin.address, await mgr.getAddress(), ethers.ZeroAddress, [await usdcToken.getAddress()]]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [alice, bob]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }
    return { reg, usdcToken, admin, alice, bob };
  }

  async function args(fx, hash) {
    const now = await time.latest();
    const base = [
      fx.bob.address, ethers.ZeroAddress, await fx.usdcToken.getAddress(),
      usdc(10), usdc(10), BigInt(now) + 86400n, BigInt(now) + 864000n,
      Resolution.Either, ethers.ZeroHash, false, ethers.ZeroHash, "ipfs://meta",
    ];
    return hash === undefined ? base : [...base, hash];
  }

  it("createWagerWithTerms records and emits the governing version hash", async function () {
    const fx = await loadFixture(deployFixture);
    await expect(fx.reg.connect(fx.alice).createWagerWithTerms(...(await args(fx, V1))))
      .to.emit(fx.reg, "WagerTermsBound")
      .withArgs(1, V1);
    expect(await fx.reg.wagerTermsVersionHash(1)).to.equal(V1);
  });

  it("legacy createWager records no binding (zero) and emits no WagerTermsBound", async function () {
    const fx = await loadFixture(deployFixture);
    await expect(fx.reg.connect(fx.alice).createWager(...(await args(fx))))
      .to.not.emit(fx.reg, "WagerTermsBound");
    expect(await fx.reg.wagerTermsVersionHash(1)).to.equal(ethers.ZeroHash);
  });

  it("is prospective-only: an existing wager keeps its bound version after a new version exists", async function () {
    const fx = await loadFixture(deployFixture);
    await fx.reg.connect(fx.alice).createWagerWithTerms(...(await args(fx, V1))); // wager 1 @ V1
    // A later wager binds V2; wager 1 is unaffected (no retroactive re-binding).
    await fx.reg.connect(fx.alice).createWagerWithTerms(...(await args(fx, V2))); // wager 2 @ V2
    expect(await fx.reg.wagerTermsVersionHash(1)).to.equal(V1);
    expect(await fx.reg.wagerTermsVersionHash(2)).to.equal(V2);
  });

  it("createWagerWithTerms still escrows the stake (parity with createWager)", async function () {
    const fx = await loadFixture(deployFixture);
    const before = await fx.usdcToken.balanceOf(await fx.reg.getAddress());
    await fx.reg.connect(fx.alice).createWagerWithTerms(...(await args(fx, V1)));
    const after = await fx.usdcToken.balanceOf(await fx.reg.getAddress());
    expect(after - before).to.equal(usdc(10));
  });
});
