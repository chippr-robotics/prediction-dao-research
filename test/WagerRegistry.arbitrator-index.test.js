const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("./helpers/proxy");

// Spec Kit 005: an assigned arbitrator must be able to DISCOVER the wagers they
// oversee. createWager now indexes the arbitrator into the per-user set so
// getUserWagers(arbitrator) returns them. This ships in the same v3 as 004's
// draw work, so we also assert no interaction regression with declareDraw.
const Tier = { None: 0, Bronze: 1 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry — arbitrator discovery index", function () {
  async function deployFixture() {
    const [admin, alice, bob, charlie, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    const wmatic = await MockERC20.deploy("Wrapped Matic", "WMATIC", 0);

    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const adapter = await PolymarketAdapter.deploy(admin.address, await ctf.getAddress());

    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    await mgr.connect(admin).setTier(
      WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30,
      { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true
    );

    const reg = await deployWagerRegistry([
      admin.address, await mgr.getAddress(), await adapter.getAddress(),
      [await usdcToken.getAddress(), await wmatic.getAddress()]
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [alice, bob, charlie]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    }

    return { reg, usdcToken, admin, alice, bob, charlie };
  }

  // Create (and optionally accept) a wager. ThirdParty wagers name `charlie` as arbitrator.
  async function create(fx, { resolutionType = Resolution.Either, arbitrator = ethers.ZeroAddress, accept = true } = {}) {
    const { reg, alice, bob, usdcToken } = fx;
    const now = await time.latest();
    const tx = await reg.connect(alice).createWager(
      bob.address, arbitrator, await usdcToken.getAddress(),
      usdc(10), usdc(10), now + 1800, now + 86400,
      resolutionType, ethers.ZeroHash, false, ethers.id("meta"), ""
    );
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "WagerCreated");
    const wagerId = Number(ev.args.wagerId);
    if (accept) await reg.connect(bob).acceptWager(wagerId);
    return wagerId;
  }

  const idsOf = async (reg, who) => {
    const count = await reg.getUserWagerCount(who.address);
    const ids = await reg.getUserWagerIds(who.address, 0, count);
    return ids.map(Number);
  };

  it("indexes the arbitrator for a ThirdParty wager (discoverable via getUserWagers)", async () => {
    const fx = await loadFixture(deployFixture);
    const id = await create(fx, { resolutionType: Resolution.ThirdParty, arbitrator: fx.charlie.address });

    expect(await idsOf(fx.reg, fx.charlie)).to.include(id); // arbitrator can find it
    expect(await idsOf(fx.reg, fx.alice)).to.include(id);   // creator unchanged
    expect(await idsOf(fx.reg, fx.bob)).to.include(id);     // opponent unchanged
    expect(await fx.reg.getUserWagerCount(fx.charlie.address)).to.equal(1n);

    // The full struct is retrievable for the arbitrator's discovery view.
    const wagers = await fx.reg.getUserWagers(fx.charlie.address, 0, 1);
    expect(wagers[0].arbitrator).to.equal(fx.charlie.address);
  });

  it("does NOT index a non-arbitrator: an Either wager writes no third index", async () => {
    const fx = await loadFixture(deployFixture);
    const id = await create(fx, { resolutionType: Resolution.Either });
    // charlie is not on this wager at all
    expect(await fx.reg.getUserWagerCount(fx.charlie.address)).to.equal(0n);
    expect(await idsOf(fx.reg, fx.alice)).to.include(id);
    expect(await idsOf(fx.reg, fx.bob)).to.include(id);
  });

  it("arbitrator can still resolve via declareWinner (authority unaffected by indexing)", async () => {
    const fx = await loadFixture(deployFixture);
    const id = await create(fx, { resolutionType: Resolution.ThirdParty, arbitrator: fx.charlie.address });
    await fx.reg.connect(fx.charlie).declareWinner(id, fx.alice.address);
    expect((await fx.reg.getWager(id)).status).to.equal(Status.Resolved);
    expect((await fx.reg.getWager(id)).winner).to.equal(fx.alice.address);
  });

  it("004 coordination: an arbitrator-solo draw reaching Status.Draw leaves the arbitrator index intact", async () => {
    const fx = await loadFixture(deployFixture);
    const id = await create(fx, { resolutionType: Resolution.ThirdParty, arbitrator: fx.charlie.address });
    await fx.reg.connect(fx.charlie).declareDraw(id);
    expect((await fx.reg.getWager(id)).status).to.equal(Status.Draw);
    // Index is append-only — discovery still works after a terminal draw.
    expect(await idsOf(fx.reg, fx.charlie)).to.include(id);
  });
});
