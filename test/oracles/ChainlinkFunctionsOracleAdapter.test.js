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
});
