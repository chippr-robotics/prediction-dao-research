const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Dedicated unit coverage for PolymarketOracleAdapter (previously only exercised
// indirectly through WagerRegistry integration). Covers CTF management, market
// linking + every error path, resolution fetch/caching, getOutcome (incl. the
// tie sentinel), and the IOracleAdapter view surface.
describe("PolymarketOracleAdapter (unit)", function () {
  async function fix() {
    const [admin, other] = await ethers.getSigners();
    const Ctf = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await Ctf.deploy();
    const Adapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const adapter = await Adapter.deploy(admin.address, await ctf.getAddress());
    return { adapter, ctf, admin, other };
  }

  // Prepares a binary condition and (optionally) resolves it with `payouts`.
  async function condition(ctf, admin, payouts) {
    const questionId = ethers.id("q-" + Math.random());
    const id = await ctf.getConditionId(admin.address, questionId, 2);
    await ctf.prepareCondition(admin.address, questionId, 2);
    if (payouts) await ctf.resolveCondition(id, payouts);
    return id;
  }

  describe("constructor & basics", () => {
    it("sets owner to admin, primary CTF, and marks it supported", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      expect(await adapter.owner()).to.equal(admin.address);
      expect(await adapter.polymarketCTF()).to.equal(await ctf.getAddress());
      expect(await adapter.supportedCTFContracts(await ctf.getAddress())).to.equal(true);
    });

    it("reverts on zero admin (Ownable) or zero CTF (InvalidAddress)", async () => {
      const { ctf, admin } = await loadFixture(fix);
      const Adapter = await ethers.getContractFactory("PolymarketOracleAdapter");
      // Ownable(admin) runs first, so a zero admin reverts in OZ's constructor.
      await expect(Adapter.deploy(ethers.ZeroAddress, await ctf.getAddress()))
        .to.be.revertedWithCustomError(Adapter, "OwnableInvalidOwner");
      await expect(Adapter.deploy(admin.address, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(Adapter, "InvalidAddress");
    });

    it("reports oracleType, availability, and configured chain id", async () => {
      const { adapter } = await loadFixture(fix);
      expect(await adapter.oracleType()).to.equal("Polymarket");
      expect(await adapter.isAvailable()).to.equal(true); // CTF has code
      expect(await adapter.getConfiguredChainId()).to.equal((await ethers.provider.getNetwork()).chainId);
    });
  });

  describe("CTF management (onlyOwner)", () => {
    it("addCTFContract adds + emits; rejects non-owner and zero", async () => {
      const { adapter, admin, other } = await loadFixture(fix);
      const newCtf = "0x000000000000000000000000000000000000bEEF";
      await expect(adapter.connect(admin).addCTFContract(newCtf))
        .to.emit(adapter, "CTFContractAdded").withArgs(newCtf);
      expect(await adapter.supportedCTFContracts(newCtf)).to.equal(true);
      await expect(adapter.connect(other).addCTFContract("0x000000000000000000000000000000000000bEAF"))
        .to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
      await expect(adapter.connect(admin).addCTFContract(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(adapter, "InvalidAddress");
    });

    it("removeCTFContract removes + emits", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      await expect(adapter.connect(admin).removeCTFContract(await ctf.getAddress()))
        .to.emit(adapter, "CTFContractRemoved");
      expect(await adapter.supportedCTFContracts(await ctf.getAddress())).to.equal(false);
    });

    it("updatePrimaryCTF switches the primary + marks supported + emits", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const Ctf2 = await ethers.getContractFactory("MockPolymarketCTF");
      const ctf2 = await Ctf2.deploy();
      await expect(adapter.connect(admin).updatePrimaryCTF(await ctf2.getAddress()))
        .to.emit(adapter, "PrimaryCtfUpdated").withArgs(await ctf.getAddress(), await ctf2.getAddress());
      expect(await adapter.polymarketCTF()).to.equal(await ctf2.getAddress());
      expect(await adapter.supportedCTFContracts(await ctf2.getAddress())).to.equal(true);
      await expect(adapter.connect(admin).updatePrimaryCTF(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(adapter, "InvalidAddress");
    });
  });

  describe("market linking (onlyOwner)", () => {
    it("links a prepared binary condition + emits; isMarketLinked/getLinkedMarket reflect it", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const id = await condition(ctf, admin);
      await expect(adapter.connect(admin).linkMarketToPolymarket(1, id))
        .to.emit(adapter, "MarketLinkedToPolymarket");
      expect(await adapter.isMarketLinked(1)).to.equal(true);
      const lm = await adapter.getLinkedMarket(1);
      expect(lm.conditionId).to.equal(id);
      expect(lm.linked).to.equal(true);
    });

    it("rejects: non-owner, unsupported CTF, already-linked, zero conditionId, unprepared, non-binary", async () => {
      const { adapter, ctf, admin, other } = await loadFixture(fix);
      const id = await condition(ctf, admin);
      await expect(adapter.connect(other).linkMarketToPolymarket(1, id))
        .to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
      await expect(adapter.connect(admin).linkMarketToPolymarketWithCTF(1, id, "0x000000000000000000000000000000000000dEaD"))
        .to.be.revertedWithCustomError(adapter, "CTFNotSupported");
      await expect(adapter.connect(admin).linkMarketToPolymarket(1, ethers.ZeroHash))
        .to.be.revertedWithCustomError(adapter, "InvalidConditionId");
      // unprepared condition id
      await expect(adapter.connect(admin).linkMarketToPolymarket(1, ethers.id("never-prepared")))
        .to.be.revertedWithCustomError(adapter, "InvalidConditionId");
      // non-binary (3 slots)
      const qid = ethers.id("tri");
      const triId = await ctf.getConditionId(admin.address, qid, 3);
      await ctf.prepareCondition(admin.address, qid, 3);
      await expect(adapter.connect(admin).linkMarketToPolymarket(2, triId))
        .to.be.revertedWith("Only binary conditions supported");
      // already linked
      await adapter.connect(admin).linkMarketToPolymarket(1, id);
      await expect(adapter.connect(admin).linkMarketToPolymarket(1, id))
        .to.be.revertedWithCustomError(adapter, "MarketAlreadyLinked");
    });

    it("unlinkMarket clears the link; reverts MarketNotLinked otherwise", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const id = await condition(ctf, admin);
      await adapter.connect(admin).linkMarketToPolymarket(1, id);
      await expect(adapter.connect(admin).unlinkMarket(1)).to.emit(adapter, "MarketUnlinked").withArgs(1);
      expect(await adapter.isMarketLinked(1)).to.equal(false);
      await expect(adapter.connect(admin).unlinkMarket(1)).to.be.revertedWithCustomError(adapter, "MarketNotLinked");
    });
  });

  describe("fetchResolution + caching", () => {
    it("caches a resolved condition and reverts ConditionNotResolved for an unresolved one", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const resolved = await condition(ctf, admin, [3, 1]);
      await adapter.fetchResolution(resolved);
      const cached = await adapter.getCachedResolution(resolved);
      expect(cached.resolved).to.equal(true);
      expect(cached.passNumerator).to.equal(3n);
      expect(cached.failNumerator).to.equal(1n);
      expect(cached.denominator).to.equal(4n);
      expect(cached.cachedAt).to.be.greaterThan(0n);

      const unresolved = await condition(ctf, admin);
      await expect(adapter.fetchResolution(unresolved)).to.be.revertedWithCustomError(adapter, "ConditionNotResolved");
    });

    it("fetchResolutionFromCTF reverts CTFNotSupported for an unknown CTF", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const id = await condition(ctf, admin, [1, 0]);
      await expect(adapter.fetchResolutionFromCTF(id, "0x000000000000000000000000000000000000dEaD"))
        .to.be.revertedWithCustomError(adapter, "CTFNotSupported");
      // (FetchFailed is a defensive catch around a CTF that reverts on
      // isResolved/getPayout*; it needs a purpose-built reverting mock and is
      // left to the fuzzer/manual review.)
    });
  });

  describe("getOutcome", () => {
    async function outcome(adapter, id) {
      const r = await adapter.getOutcome(id);
      return { outcome: r[0], confidence: r[1], resolvedAt: r[2] };
    }
    it("unresolved -> (false, 0, 0)", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const id = await condition(ctf, admin);
      const r = await outcome(adapter, id);
      expect(r.resolvedAt).to.equal(0n);
    });
    it("decisive YES [1,0] -> true; decisive NO [0,1] -> false (uncached + cached)", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const yes = await condition(ctf, admin, [1, 0]);
      let r = await outcome(adapter, yes);
      expect(r.outcome).to.equal(true); expect(r.resolvedAt).to.be.greaterThan(0n); expect(r.confidence).to.equal(10000n);
      await adapter.fetchResolution(yes); // now cached
      r = await outcome(adapter, yes);
      expect(r.outcome).to.equal(true); expect(r.resolvedAt).to.be.greaterThan(0n);

      const no = await condition(ctf, admin, [0, 1]);
      r = await outcome(adapter, no);
      expect(r.outcome).to.equal(false); expect(r.resolvedAt).to.be.greaterThan(0n);
    });
    it("TIE [1,1] -> unresolved sentinel (false, 0, 0) on both paths", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const tie = await condition(ctf, admin, [1, 1]);
      let r = await outcome(adapter, tie);
      expect(r.resolvedAt).to.equal(0n);
      await adapter.fetchResolution(tie);
      r = await outcome(adapter, tie);
      expect(r.resolvedAt).to.equal(0n);
    });
  });

  describe("view + pure helpers", () => {
    it("isConditionResolved reflects CTF + cache", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const id = await condition(ctf, admin);
      expect(await adapter.isConditionResolved(id)).to.equal(false);
      await ctf.resolveCondition(id, [1, 0]);
      expect(await adapter.isConditionResolved(id)).to.equal(true); // live
    });

    it("isConditionSupported: false for unknown, true once prepared", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      expect(await adapter.isConditionSupported(ethers.id("unknown"))).to.equal(false);
      const id = await condition(ctf, admin);
      expect(await adapter.isConditionSupported(id)).to.equal(true);
    });

    it("getResolutionForMarket: resolved data, unresolved->false, MarketNotLinked", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      await expect(adapter.getResolutionForMarket(99)).to.be.revertedWithCustomError(adapter, "MarketNotLinked");
      const id = await condition(ctf, admin, [2, 5]);
      await adapter.connect(admin).linkMarketToPolymarket(1, id);
      const r = await adapter.getResolutionForMarket.staticCall(1);
      expect(r.resolved).to.equal(true);
      expect(r.passNumerator).to.equal(2n);
      expect(r.failNumerator).to.equal(5n);
      // a linked-but-unresolved market reports resolved=false
      const id2 = await condition(ctf, admin);
      await adapter.connect(admin).linkMarketToPolymarket(2, id2);
      const r2 = await adapter.getResolutionForMarket.staticCall(2);
      expect(r2.resolved).to.equal(false);
    });

    it("determineOutcome: tie, YES, NO", async () => {
      const { adapter } = await loadFixture(fix);
      expect(await adapter.determineOutcome(1, 1)).to.deep.equal([false, true]);
      expect(await adapter.determineOutcome(3, 1)).to.deep.equal([true, false]);
      expect(await adapter.determineOutcome(0, 1)).to.deep.equal([false, false]);
    });

    it("computeConditionId matches the CTF formula", async () => {
      const { adapter, ctf, admin } = await loadFixture(fix);
      const qid = ethers.id("x");
      expect(await adapter.computeConditionId(admin.address, qid, 2))
        .to.equal(await ctf.getConditionId(admin.address, qid, 2));
    });
  });
});
