const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("../helpers/proxy");

// Integration (spec 026 FR-008/SC-003): a membership obtained by redeeming a voucher is INDISTINGUISHABLE
// from a directly purchased one for WagerRegistry gating. alice buys directly; bob redeems a voucher; both
// must be able to create/accept wagers identically.

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0 };
const Status = { Active: 2 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const TERMS = ethers.id("terms-v1");
const usdc = (n) => ethers.parseUnits(String(n), 6);

async function setup() {
  const [admin, alice, bob, treasury] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
  await usdcToken.waitForDeployment();

  const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
  await mgr.waitForDeployment();
  await mgr.connect(admin).setTier(
    WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true
  );

  const Voucher = await ethers.getContractFactory("MembershipVoucher");
  const voucher = await Voucher.deploy(admin.address, await mgr.getAddress());
  await voucher.waitForDeployment();
  await mgr.connect(admin).setVoucher(await voucher.getAddress());

  const reg = await deployWagerRegistry([
    admin.address, await mgr.getAddress(), ethers.ZeroAddress, [await usdcToken.getAddress()]
  ]);
  await reg.waitForDeployment();
  await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

  for (const u of [alice, bob]) {
    await usdcToken.mint(u.address, usdc(10_000));
    await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
    await usdcToken.connect(u).approve(await voucher.getAddress(), ethers.MaxUint256);
    await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
  }

  // alice: direct purchase. bob: voucher redemption.
  await mgr.connect(alice).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
  const tx = await voucher.connect(bob).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
  const rc = await tx.wait();
  const id = Number(rc.logs.map((l) => { try { return voucher.interface.parseLog(l); } catch { return null; } })
    .find((p) => p && p.name === "VoucherMinted").args.id);
  await mgr.connect(bob).redeemVoucher(id, TERMS);

  return { admin, alice, bob, usdcToken, mgr, reg };
}

async function createWager(reg, from, opponent, usdcToken) {
  const now = await time.latest();
  const tx = await reg.connect(from).createWager(
    opponent.address, ethers.ZeroAddress, await usdcToken.getAddress(),
    usdc(10), usdc(10), now + 3600, now + 86400,
    Resolution.Either, ethers.ZeroHash, false, ethers.id("terms"), "ipfs://cid"
  );
  const rc = await tx.wait();
  const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
    .find((p) => p && p.name === "WagerCreated");
  return Number(ev.args.wagerId);
}

describe("Voucher-redeemed membership == direct membership (integration)", function () {
  it("both rails are active members with identical gating", async function () {
    const { mgr, alice, bob } = await setup();
    expect(await mgr.hasActiveRole(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(true);
    expect(await mgr.hasActiveRole(bob.address, WAGER_PARTICIPANT_ROLE)).to.equal(true);
    expect(await mgr.getActiveTier(alice.address, WAGER_PARTICIPANT_ROLE))
      .to.equal(await mgr.getActiveTier(bob.address, WAGER_PARTICIPANT_ROLE));
    expect(await mgr.checkCanCreate(bob.address, WAGER_PARTICIPANT_ROLE)).to.equal(true);
  });

  it("the voucher-redeemed member can create and accept wagers like a direct member", async function () {
    const { reg, alice, bob, usdcToken } = await setup();
    // bob (redeemed) creates; alice (direct) accepts.
    const id1 = await createWager(reg, bob, alice, usdcToken);
    await (await reg.connect(alice).acceptWager(id1)).wait();
    expect((await reg.getWager(id1)).status).to.equal(Status.Active);

    // alice (direct) creates; bob (redeemed) accepts — symmetric.
    const id2 = await createWager(reg, alice, bob, usdcToken);
    await (await reg.connect(bob).acceptWager(id2)).wait();
    expect((await reg.getWager(id2)).status).to.equal(Status.Active);
  });
});
