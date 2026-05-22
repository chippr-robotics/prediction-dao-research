const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("UMAOptimisticOracleV3Adapter", function () {
  async function deployFixture() {
    const [admin, alice, bob] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockERC20");
    const bond = await Token.deploy("USD Coin", "USDC", 0);
    const OO = await ethers.getContractFactory("MockOptimisticOracleV3");
    const oo = await OO.deploy();
    const Adapter = await ethers.getContractFactory("UMAOptimisticOracleV3Adapter");
    const adapter = await Adapter.deploy(await oo.getAddress());
    // Fund alice and approve adapter
    await bond.mint(alice.address, usdc(1000));
    await bond.connect(alice).approve(await adapter.getAddress(), ethers.MaxUint256);
    return { adapter, oo, bond, admin, alice, bob };
  }

  async function register(adapter, bondAddr, opts = {}) {
    const conditionId = ethers.id("c-" + Math.random());
    await adapter.registerCondition(
      conditionId,
      ethers.toUtf8Bytes(opts.claim || "Did the event happen by date X?"),
      bondAddr,
      opts.bond || usdc(10),
      opts.liveness || 7200
    );
    return conditionId;
  }

  it("reports oracleType and isAvailable=true when OO has code", async () => {
    const { adapter } = await loadFixture(deployFixture);
    expect(await adapter.oracleType()).to.equal("UMA-OOv3");
    expect(await adapter.isAvailable()).to.equal(true);
  });

  it("isAvailable=false when OO addr has no code", async () => {
    const [, , , eoa] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("UMAOptimisticOracleV3Adapter");
    const adapter = await Adapter.deploy(eoa.address);
    expect(await adapter.isAvailable()).to.equal(false);
  });

  it("rejects liveness < MIN_LIVENESS", async () => {
    const { adapter, bond } = await loadFixture(deployFixture);
    await expect(adapter.registerCondition(
      ethers.id("x"), ethers.toUtf8Bytes("claim"), await bond.getAddress(), usdc(10), 10
    )).to.be.revertedWithCustomError(adapter, "LivenessTooShort");
  });

  it("rejects zero address bond currency", async () => {
    const { adapter } = await loadFixture(deployFixture);
    await expect(adapter.registerCondition(
      ethers.id("x"), ethers.toUtf8Bytes("claim"), ethers.ZeroAddress, usdc(10), 3600
    )).to.be.revertedWithCustomError(adapter, "InvalidAddress");
  });

  it("assertResolution pulls bond, calls OO, stores mapping, emits AssertionMade", async () => {
    const { adapter, oo, bond, alice } = await loadFixture(deployFixture);
    const conditionId = await register(adapter, await bond.getAddress());
    const aliceBefore = await bond.balanceOf(alice.address);
    const tx = await adapter.connect(alice).assertResolution(conditionId, alice.address);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "AssertionMade");
    expect(ev).to.not.be.null;
    expect(ev.args.conditionId).to.equal(conditionId);
    expect(ev.args.asserter).to.equal(alice.address);
    // Bond left alice's wallet
    expect(aliceBefore - await bond.balanceOf(alice.address)).to.equal(usdc(10));
    // Bond now sits at the OO
    expect(await bond.balanceOf(await oo.getAddress())).to.equal(usdc(10));
    // Forward mapping (assertionId -> conditionId) is the source of truth.
    // `conditionToAssertion` holds a sentinel until any assertion is in flight
    // (CEI: no post-external-call write to this slot — see contract for why).
    expect(await adapter.assertionToCondition(ev.args.assertionId)).to.equal(conditionId);
    expect(await adapter.conditionToAssertion(conditionId)).to.not.equal(ethers.ZeroHash);
  });

  it("rejects second assertResolution while one is pending", async () => {
    const { adapter, bond, alice } = await loadFixture(deployFixture);
    const conditionId = await register(adapter, await bond.getAddress());
    await adapter.connect(alice).assertResolution(conditionId, alice.address);
    await expect(adapter.connect(alice).assertResolution(conditionId, alice.address))
      .to.be.revertedWithCustomError(adapter, "AssertionAlreadyPending");
  });

  it("callback from non-OO reverts UnauthorizedCallback", async () => {
    const { adapter, alice } = await loadFixture(deployFixture);
    await expect(adapter.connect(alice).assertionResolvedCallback(ethers.ZeroHash, true))
      .to.be.revertedWithCustomError(adapter, "UnauthorizedCallback");
    await expect(adapter.connect(alice).assertionDisputedCallback(ethers.ZeroHash))
      .to.be.revertedWithCustomError(adapter, "UnauthorizedCallback");
  });

  it("OO callback caches outcome=true and refunds bond to asserter", async () => {
    const { adapter, oo, bond, alice } = await loadFixture(deployFixture);
    const conditionId = await register(adapter, await bond.getAddress());
    const tx = await adapter.connect(alice).assertResolution(conditionId, alice.address);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "AssertionMade");
    const aliceBefore = await bond.balanceOf(alice.address);
    await oo.mockResolve(ev.args.assertionId, true);
    const [outcome, , resolvedAt] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(true);
    expect(resolvedAt).to.be.gt(0n);
    // Bond refunded
    expect(await bond.balanceOf(alice.address) - aliceBefore).to.equal(usdc(10));
  });

  it("OO callback caches outcome=false", async () => {
    const { adapter, oo, bond, alice } = await loadFixture(deployFixture);
    const conditionId = await register(adapter, await bond.getAddress());
    const tx = await adapter.connect(alice).assertResolution(conditionId, alice.address);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "AssertionMade");
    await oo.mockResolve(ev.args.assertionId, false);
    const [outcome] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(false);
  });

  it("dispute callback emits AssertionDisputed without caching", async () => {
    const { adapter, oo, bond, alice } = await loadFixture(deployFixture);
    const conditionId = await register(adapter, await bond.getAddress());
    const tx = await adapter.connect(alice).assertResolution(conditionId, alice.address);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "AssertionMade");
    await expect(oo.mockDispute(ev.args.assertionId))
      .to.emit(adapter, "AssertionDisputed").withArgs(conditionId, ev.args.assertionId);
    expect(await adapter.isConditionResolved(conditionId)).to.equal(false);
  });
});
