const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const Op = { GT: 0, GTE: 1, LT: 2, LTE: 3, EQ: 4 };

describe("ChainlinkDataFeedOracleAdapter", function () {
  async function deployFixture() {
    const [admin, alice] = await ethers.getSigners();
    const Agg = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await Agg.deploy(3000_00000000n, 8, await time.latest());
    const Adapter = await ethers.getContractFactory("ChainlinkDataFeedOracleAdapter");
    const adapter = await Adapter.deploy(admin.address);
    await adapter.connect(admin).setFeedAllowed(await feed.getAddress(), true);
    return { adapter, feed, admin, alice };
  }

  async function register(adapter, feed, threshold, op, offset = 3600) {
    const conditionId = ethers.id("c-" + Math.random());
    const deadline = (await time.latest()) + offset;
    await adapter.registerCondition(conditionId, await feed.getAddress(), threshold, op, deadline);
    return { conditionId, deadline };
  }

  it("reports oracleType and is always available", async () => {
    const { adapter } = await loadFixture(deployFixture);
    expect(await adapter.oracleType()).to.equal("ChainlinkDataFeed");
    expect(await adapter.isAvailable()).to.equal(true);
  });

  it("rejects registerCondition for non-allowlisted feed", async () => {
    const { adapter } = await loadFixture(deployFixture);
    const Other = await ethers.getContractFactory("MockChainlinkAggregator");
    const other = await Other.deploy(0n, 8, await time.latest());
    const deadline = (await time.latest()) + 3600;
    await expect(adapter.registerCondition(ethers.id("x"), await other.getAddress(), 0, Op.GT, deadline))
      .to.be.revertedWithCustomError(adapter, "FeedNotAllowed");
  });

  it("rejects duplicate registration", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId } = await register(adapter, feed, 2500_00000000n, Op.GT);
    const deadline = (await time.latest()) + 3600;
    await expect(
      adapter.registerCondition(conditionId, await feed.getAddress(), 0, Op.GT, deadline)
    ).to.be.revertedWithCustomError(adapter, "ConditionAlreadyRegistered");
  });

  it("rejects evaluate before deadline", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId } = await register(adapter, feed, 2500_00000000n, Op.GT);
    await expect(adapter.evaluate(conditionId)).to.be.revertedWithCustomError(adapter, "DeadlineNotReached");
  });

  it("rejects evaluate when feed updatedAt < deadline (stale)", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId, deadline } = await register(adapter, feed, 2500_00000000n, Op.GT);
    await time.increaseTo(deadline + 10);
    // feed was set at deploy time, which is < deadline → stale
    await expect(adapter.evaluate(conditionId)).to.be.revertedWithCustomError(adapter, "StaleFeedData");
  });

  it("caches true outcome with GT and emits ConditionResolved", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId, deadline } = await register(adapter, feed, 2500_00000000n, Op.GT);
    await time.increaseTo(deadline + 1);
    await feed.setAnswer(3000_00000000n, deadline + 1);
    await expect(adapter.evaluate(conditionId))
      .to.emit(adapter, "ConditionResolved").withArgs(conditionId, true, 10000, anyUint())
      .and.to.emit(adapter, "ConditionEvaluated");
    const r = await adapter.resolutionCache(conditionId);
    expect(r.exists).to.equal(true);
    expect(r.outcome).to.equal(true);
    const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(true);
    expect(confidence).to.equal(10000n);
    expect(resolvedAt).to.be.gt(0n);
  });

  it("evaluates all comparison ops correctly", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const cases = [
      { op: Op.GT,  ans: 3000_00000000n, thr: 2500_00000000n, want: true  },
      { op: Op.GT,  ans: 2500_00000000n, thr: 2500_00000000n, want: false },
      { op: Op.GTE, ans: 2500_00000000n, thr: 2500_00000000n, want: true  },
      { op: Op.LT,  ans: 2000_00000000n, thr: 2500_00000000n, want: true  },
      { op: Op.LTE, ans: 2500_00000000n, thr: 2500_00000000n, want: true  },
      { op: Op.EQ,  ans: 2500_00000000n, thr: 2500_00000000n, want: true  },
      { op: Op.EQ,  ans: 2501_00000000n, thr: 2500_00000000n, want: false },
    ];
    for (const c of cases) {
      const { conditionId, deadline } = await register(adapter, feed, c.thr, c.op, 600);
      await time.increaseTo(deadline + 1);
      await feed.setAnswer(c.ans, deadline + 1);
      await adapter.evaluate(conditionId);
      const r = await adapter.resolutionCache(conditionId);
      expect(r.outcome, `op=${c.op} ans=${c.ans} thr=${c.thr}`).to.equal(c.want);
    }
  });

  it("getOutcome returns zeros before evaluate", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId } = await register(adapter, feed, 2500_00000000n, Op.GT);
    const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
    expect(outcome).to.equal(false);
    expect(confidence).to.equal(0n);
    expect(resolvedAt).to.equal(0n);
  });

  it("rejects double evaluation", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId, deadline } = await register(adapter, feed, 2500_00000000n, Op.GT);
    await time.increaseTo(deadline + 1);
    await feed.setAnswer(3000_00000000n, deadline + 1);
    await adapter.evaluate(conditionId);
    await expect(adapter.evaluate(conditionId)).to.be.revertedWithCustomError(adapter, "AlreadyResolved");
  });

  it("isConditionSupported and isConditionResolved reflect lifecycle", async () => {
    const { adapter, feed } = await loadFixture(deployFixture);
    const { conditionId, deadline } = await register(adapter, feed, 2500_00000000n, Op.GT);
    expect(await adapter.isConditionSupported(conditionId)).to.equal(true);
    expect(await adapter.isConditionResolved(conditionId)).to.equal(false);
    await time.increaseTo(deadline + 1);
    await feed.setAnswer(3000_00000000n, deadline + 1);
    await adapter.evaluate(conditionId);
    expect(await adapter.isConditionResolved(conditionId)).to.equal(true);
  });
});

function anyUint() {
  // chai-matchers helper for "any uint" in withArgs
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
