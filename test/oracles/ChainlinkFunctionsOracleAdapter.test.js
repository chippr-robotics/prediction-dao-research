const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ChainlinkFunctionsOracleAdapter", function () {
  async function deployFixture() {
    const [admin, alice] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("MockFunctionsRouter");
    const router = await Router.deploy();
    const Adapter = await ethers.getContractFactory("ChainlinkFunctionsOracleAdapter");
    const adapter = await Adapter.deploy(admin.address, await router.getAddress());
    return { adapter, router, admin, alice };
  }

  const SOURCE = "return Functions.encodeUint256(1);";
  const DON_ID = "0x" + Buffer.from("fun-polygon-amoy-1").toString("hex").padEnd(64, "0");

  async function register(adapter) {
    const conditionId = ethers.id("c-" + Math.random());
    const encodedReq = ethers.toUtf8Bytes(SOURCE);
    const sourceHash = ethers.keccak256(encodedReq);
    await adapter.registerCondition(conditionId, encodedReq, sourceHash, 42, 300_000, DON_ID);
    return conditionId;
  }

  it("reports oracleType and isAvailable=true when router has code", async () => {
    const { adapter } = await loadFixture(deployFixture);
    expect(await adapter.oracleType()).to.equal("ChainlinkFunctions");
    expect(await adapter.isAvailable()).to.equal(true);
  });

  it("isAvailable=false when router has no code (constructed against EOA)", async () => {
    const [admin, , , eoa] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("ChainlinkFunctionsOracleAdapter");
    const adapter = await Adapter.deploy(admin.address, eoa.address);
    expect(await adapter.isAvailable()).to.equal(false);
  });

  it("registers a condition and rejects duplicates", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    expect(await adapter.isConditionSupported(conditionId)).to.equal(true);
    const encodedReq = ethers.toUtf8Bytes(SOURCE);
    const sourceHash = ethers.keccak256(encodedReq);
    await expect(
      adapter.registerCondition(conditionId, encodedReq, sourceHash, 42, 300_000, DON_ID)
    ).to.be.revertedWithCustomError(adapter, "ConditionAlreadyRegistered");
  });

  it("requestResolution sends to router and stores mapping", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    expect(ev).to.not.be.null;
    expect(ev.args.conditionId).to.equal(conditionId);
    const last = await router.lastRequest();
    expect(last.client).to.equal(await adapter.getAddress());
    expect(last.subscriptionId).to.equal(42n);
  });

  it("rejects a second requestResolution while one is pending", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    await adapter.requestResolution(conditionId);
    await expect(adapter.requestResolution(conditionId))
      .to.be.revertedWithCustomError(adapter, "RequestAlreadyPending");
  });

  it("fulfill with response=0x01 caches outcome=true", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    const requestId = ev.args.requestId;
    await expect(router.fulfill(requestId, "0x01", "0x"))
      .to.emit(adapter, "ConditionResolved");
    const [outcome] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(true);
  });

  it("fulfill with response=0x00 caches outcome=false", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    const requestId = ev.args.requestId;
    await router.fulfill(requestId, "0x00", "0x");
    const [outcome, , resolvedAt] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(false);
    expect(resolvedAt).to.be.gt(0n);
  });

  it("fulfill with non-empty err emits RequestFailed and does not cache", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    await expect(router.fulfill(ev.args.requestId, "0x", "0xdeadbeef"))
      .to.emit(adapter, "RequestFailed");
    expect(await adapter.isConditionResolved(conditionId)).to.equal(false);
  });

  it("fulfill from non-router reverts OnlyRouterCanFulfill", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    await adapter.requestResolution(conditionId);
    await expect(adapter.handleOracleFulfillment(ethers.ZeroHash, "0x01", "0x"))
      .to.be.revertedWithCustomError(adapter, "OnlyRouterCanFulfill");
  });

  it("linkMarket stores mapping and emits MarketLinked", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    await expect(adapter.linkMarket(42, conditionId))
      .to.emit(adapter, "MarketLinked").withArgs(42, conditionId);
    expect(await adapter.marketToCondition(42)).to.equal(conditionId);
  });

  it("linkMarket reverts ConditionNotRegistered for unknown condition", async () => {
    const { adapter } = await loadFixture(deployFixture);
    await expect(adapter.linkMarket(1, ethers.id("unknown")))
      .to.be.revertedWithCustomError(adapter, "ConditionNotRegistered");
  });

  it("linkMarket reverts MarketAlreadyLinked for duplicate", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    await adapter.linkMarket(99, conditionId);
    const conditionId2 = await register(adapter);
    await expect(adapter.linkMarket(99, conditionId2))
      .to.be.revertedWithCustomError(adapter, "MarketAlreadyLinked");
  });

  it("registerCondition reverts for zero conditionId", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const encodedReq = ethers.toUtf8Bytes(SOURCE);
    const sourceHash = ethers.keccak256(encodedReq);
    await expect(adapter.registerCondition(ethers.ZeroHash, encodedReq, sourceHash, 42, 300_000, DON_ID))
      .to.be.revertedWithCustomError(adapter, "ConditionNotRegistered");
  });

  it("requestResolution reverts AlreadyResolved after fulfillment", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    await router.fulfill(ev.args.requestId, "0x01", "0x");
    await expect(adapter.requestResolution(conditionId))
      .to.be.revertedWithCustomError(adapter, "AlreadyResolved");
  });

  it("requestResolution reverts ConditionNotRegistered for unknown condition", async () => {
    const { adapter } = await loadFixture(deployFixture);
    await expect(adapter.requestResolution(ethers.id("unknown")))
      .to.be.revertedWithCustomError(adapter, "ConditionNotRegistered");
  });

  it("fulfill with empty response reverts InvalidResponseLength", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    await expect(router.fulfill(ev.args.requestId, "0x", "0x"))
      .to.be.reverted;
  });

  it("getConfiguredChainId returns block.chainid", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const chainId = await adapter.getConfiguredChainId();
    expect(chainId).to.be.gt(0n);
  });

  it("getConditionMetadata returns empty description and zero time", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const [desc, time] = await adapter.getConditionMetadata(conditionId);
    expect(desc).to.equal("");
    expect(time).to.equal(0n);
  });

  it("getOutcome returns zeros before resolution", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(false);
    expect(confidence).to.equal(0n);
    expect(resolvedAt).to.equal(0n);
  });

  it("isConditionResolved returns false before resolution", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    expect(await adapter.isConditionResolved(conditionId)).to.equal(false);
  });

  it("isConditionResolved returns true after fulfillment", async () => {
    const { adapter, router } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    const tx = await adapter.requestResolution(conditionId);
    const rcpt = await tx.wait();
    const ev = rcpt.logs.map(l => { try { return adapter.interface.parseLog(l); } catch { return null; } })
      .find(p => p && p.name === "ResolutionRequested");
    await router.fulfill(ev.args.requestId, "0x01", "0x");
    expect(await adapter.isConditionResolved(conditionId)).to.equal(true);
  });

  it("isConditionSupported returns false for unregistered condition", async () => {
    const { adapter } = await loadFixture(deployFixture);
    expect(await adapter.isConditionSupported(ethers.id("nope"))).to.equal(false);
  });

  it("non-owner cannot registerCondition", async () => {
    const { adapter, alice } = await loadFixture(deployFixture);
    const encodedReq = ethers.toUtf8Bytes(SOURCE);
    const sourceHash = ethers.keccak256(encodedReq);
    await expect(adapter.connect(alice).registerCondition(ethers.id("x"), encodedReq, sourceHash, 42, 300_000, DON_ID))
      .to.be.reverted;
  });

  it("non-owner cannot linkMarket", async () => {
    const { adapter, alice } = await loadFixture(deployFixture);
    const conditionId = await register(adapter);
    await expect(adapter.connect(alice).linkMarket(1, conditionId))
      .to.be.reverted;
  });
});
