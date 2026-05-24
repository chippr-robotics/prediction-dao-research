const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("PolymarketOracleAdapter", function () {
  // ========== Fixtures ==========

  async function deployFixture() {
    const [admin, alice, bob] = await ethers.getSigners();

    const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
    const ctf = await MockPolymarketCTF.deploy();
    await ctf.waitForDeployment();

    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const adapter = await PolymarketAdapter.deploy(await ctf.getAddress());
    await adapter.waitForDeployment();

    return { adapter, ctf, admin, alice, bob };
  }

  async function prepareCondition(ctf, oracle, questionId) {
    const conditionId = await ctf.getConditionId(oracle, questionId, 2);
    await ctf.prepareCondition(oracle, questionId, 2);
    return conditionId;
  }

  async function deployAndLinkFixture() {
    const { adapter, ctf, admin, alice, bob } = await deployFixture();

    const oracleAddr = alice.address;
    const questionId = ethers.id("Will ETH reach 10k?");
    const conditionId = await prepareCondition(ctf, oracleAddr, questionId);
    const marketId = 1;

    await adapter.linkMarketToPolymarket(marketId, conditionId);

    return { adapter, ctf, admin, alice, bob, conditionId, marketId, oracleAddr, questionId };
  }

  async function deployLinkAndResolveFixture() {
    const fixture = await deployAndLinkFixture();
    const { ctf, conditionId } = fixture;

    // Resolve as YES wins: [1, 0]
    await ctf.resolveCondition(conditionId, [1, 0]);

    return fixture;
  }

  /**
   * Fixture that deploys adapter with a RevertingPolymarketCTF as primary.
   * Used to test try/catch error paths in view functions.
   */
  async function deployWithRevertingCTFFixture() {
    const [admin, alice, bob] = await ethers.getSigners();

    // Deploy a valid CTF first for the constructor
    const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
    const validCtf = await MockPolymarketCTF.deploy();
    await validCtf.waitForDeployment();

    // Deploy a reverting CTF
    const RevertingCTF = await ethers.getContractFactory("RevertingPolymarketCTF");
    const revertingCtf = await RevertingCTF.deploy();
    await revertingCtf.waitForDeployment();

    // Deploy adapter with valid CTF, then switch primary to reverting CTF
    const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    const adapter = await PolymarketAdapter.deploy(await validCtf.getAddress());
    await adapter.waitForDeployment();

    await adapter.updatePrimaryCTF(await revertingCtf.getAddress());

    return { adapter, validCtf, revertingCtf, admin, alice, bob };
  }

  // ========== Constructor ==========

  describe("Constructor", function () {
    it("deploys successfully with a valid CTF address", async function () {
      const { adapter, ctf } = await loadFixture(deployFixture);
      expect(await adapter.polymarketCTF()).to.equal(await ctf.getAddress());
      expect(await adapter.supportedCTFContracts(await ctf.getAddress())).to.equal(true);
    });

    it("reverts with InvalidAddress on zero address", async function () {
      const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
      await expect(
        PolymarketAdapter.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError({ interface: PolymarketAdapter.interface }, "InvalidAddress");
    });
  });

  // ========== Admin Functions ==========

  describe("Admin Functions", function () {
    describe("addCTFContract", function () {
      it("adds a CTF contract and emits CTFContractAdded", async function () {
        const { adapter, admin, bob } = await loadFixture(deployFixture);
        await expect(adapter.connect(admin).addCTFContract(bob.address))
          .to.emit(adapter, "CTFContractAdded")
          .withArgs(bob.address);
        expect(await adapter.supportedCTFContracts(bob.address)).to.equal(true);
      });

      it("reverts with InvalidAddress on zero address", async function () {
        const { adapter, admin } = await loadFixture(deployFixture);
        await expect(
          adapter.connect(admin).addCTFContract(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adapter, "InvalidAddress");
      });

      it("reverts for non-owner", async function () {
        const { adapter, alice } = await loadFixture(deployFixture);
        await expect(
          adapter.connect(alice).addCTFContract(alice.address)
        ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
      });
    });

    describe("removeCTFContract", function () {
      it("removes a CTF contract and emits CTFContractRemoved", async function () {
        const { adapter, admin, bob } = await loadFixture(deployFixture);
        await adapter.connect(admin).addCTFContract(bob.address);
        await expect(adapter.connect(admin).removeCTFContract(bob.address))
          .to.emit(adapter, "CTFContractRemoved")
          .withArgs(bob.address);
        expect(await adapter.supportedCTFContracts(bob.address)).to.equal(false);
      });

      it("reverts for non-owner", async function () {
        const { adapter, alice, bob } = await loadFixture(deployFixture);
        await expect(
          adapter.connect(alice).removeCTFContract(bob.address)
        ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
      });
    });

    describe("updatePrimaryCTF", function () {
      it("updates primary CTF, adds to supported, and emits PrimaryCtfUpdated", async function () {
        const { adapter, ctf, admin } = await loadFixture(deployFixture);

        const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
        const ctf2 = await MockPolymarketCTF.deploy();
        await ctf2.waitForDeployment();
        const ctf2Addr = await ctf2.getAddress();

        await expect(adapter.connect(admin).updatePrimaryCTF(ctf2Addr))
          .to.emit(adapter, "PrimaryCtfUpdated")
          .withArgs(await ctf.getAddress(), ctf2Addr);

        expect(await adapter.polymarketCTF()).to.equal(ctf2Addr);
        expect(await adapter.supportedCTFContracts(ctf2Addr)).to.equal(true);
      });

      it("reverts with InvalidAddress on zero address", async function () {
        const { adapter, admin } = await loadFixture(deployFixture);
        await expect(
          adapter.connect(admin).updatePrimaryCTF(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(adapter, "InvalidAddress");
      });

      it("reverts for non-owner", async function () {
        const { adapter, alice } = await loadFixture(deployFixture);
        await expect(
          adapter.connect(alice).updatePrimaryCTF(alice.address)
        ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ========== Market Linking ==========

  describe("Market Linking", function () {
    describe("linkMarketToPolymarket", function () {
      it("links a market with the default CTF and emits MarketLinkedToPolymarket", async function () {
        const { adapter, ctf, alice } = await loadFixture(deployFixture);
        const ctfAddr = await ctf.getAddress();
        const questionId = ethers.id("Test question");
        const conditionId = await prepareCondition(ctf, alice.address, questionId);
        const marketId = 42;

        await expect(adapter.linkMarketToPolymarket(marketId, conditionId))
          .to.emit(adapter, "MarketLinkedToPolymarket")
          .withArgs(marketId, conditionId, ctfAddr);

        const linked = await adapter.linkedMarkets(marketId);
        expect(linked.conditionId).to.equal(conditionId);
        expect(linked.ctfContract).to.equal(ctfAddr);
        expect(linked.linked).to.equal(true);
      });
    });

    describe("linkMarketToPolymarketWithCTF", function () {
      it("links a market with a specific CTF contract", async function () {
        const { adapter, admin, alice } = await loadFixture(deployFixture);

        const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
        const ctf2 = await MockPolymarketCTF.deploy();
        await ctf2.waitForDeployment();
        const ctf2Addr = await ctf2.getAddress();

        await adapter.connect(admin).addCTFContract(ctf2Addr);

        const questionId = ethers.id("Another question");
        const conditionId = await prepareCondition(ctf2, alice.address, questionId);
        const marketId = 99;

        await expect(adapter.linkMarketToPolymarketWithCTF(marketId, conditionId, ctf2Addr))
          .to.emit(adapter, "MarketLinkedToPolymarket")
          .withArgs(marketId, conditionId, ctf2Addr);

        const linked = await adapter.linkedMarkets(marketId);
        expect(linked.ctfContract).to.equal(ctf2Addr);
      });
    });

    describe("linkMarketToPolymarketWithCTF reverts", function () {
      it("reverts with CTFNotSupported for unsupported CTF", async function () {
        const { adapter, alice } = await loadFixture(deployFixture);
        const conditionId = ethers.id("some-condition");
        await expect(
          adapter.linkMarketToPolymarketWithCTF(1, conditionId, alice.address)
        ).to.be.revertedWithCustomError(adapter, "CTFNotSupported");
      });

      it("reverts with MarketAlreadyLinked for double linking", async function () {
        const { adapter, conditionId } = await loadFixture(deployAndLinkFixture);

        // Try linking same market again
        await expect(
          adapter.linkMarketToPolymarket(1, conditionId)
        ).to.be.revertedWithCustomError(adapter, "MarketAlreadyLinked");
      });

      it("reverts with InvalidConditionId for zero conditionId", async function () {
        const { adapter } = await loadFixture(deployFixture);
        await expect(
          adapter.linkMarketToPolymarket(1, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(adapter, "InvalidConditionId");
      });

      it("reverts with InvalidConditionId when condition not prepared on CTF (oracle == 0)", async function () {
        const { adapter } = await loadFixture(deployFixture);
        // A non-zero conditionId that doesn't exist on the CTF
        const fakeConditionId = ethers.id("nonexistent-condition");
        await expect(
          adapter.linkMarketToPolymarket(1, fakeConditionId)
        ).to.be.revertedWithCustomError(adapter, "InvalidConditionId");
      });

      it("reverts for non-binary conditions (outcomeSlotCount != 2)", async function () {
        const { adapter, ctf, alice } = await loadFixture(deployFixture);
        const questionId = ethers.id("Multi-outcome question");
        // Prepare a condition with 3 outcomes
        const conditionId = await ctf.getConditionId(alice.address, questionId, 3);
        await ctf.prepareCondition(alice.address, questionId, 3);

        await expect(
          adapter.linkMarketToPolymarket(1, conditionId)
        ).to.be.revertedWith("Only binary conditions supported");
      });

      it("reverts with InvalidConditionId when getCondition call fails (reverting CTF)", async function () {
        const { adapter, revertingCtf } = await loadFixture(deployWithRevertingCTFFixture);
        const revertingAddr = await revertingCtf.getAddress();
        const fakeConditionId = ethers.id("some-condition");

        // The reverting CTF is supported but getCondition will revert,
        // which should be caught and re-thrown as InvalidConditionId
        await expect(
          adapter.linkMarketToPolymarketWithCTF(1, fakeConditionId, revertingAddr)
        ).to.be.revertedWithCustomError(adapter, "InvalidConditionId");
      });
    });

    describe("unlinkMarket", function () {
      it("unlinks a market and emits MarketUnlinked", async function () {
        const { adapter, admin, marketId } = await loadFixture(deployAndLinkFixture);
        await expect(adapter.connect(admin).unlinkMarket(marketId))
          .to.emit(adapter, "MarketUnlinked")
          .withArgs(marketId);

        const linked = await adapter.linkedMarkets(marketId);
        expect(linked.linked).to.equal(false);
      });

      it("reverts with MarketNotLinked for unlinked market", async function () {
        const { adapter, admin } = await loadFixture(deployFixture);
        await expect(
          adapter.connect(admin).unlinkMarket(999)
        ).to.be.revertedWithCustomError(adapter, "MarketNotLinked");
      });

      it("reverts for non-owner", async function () {
        const { adapter, alice, marketId } = await loadFixture(deployAndLinkFixture);
        await expect(
          adapter.connect(alice).unlinkMarket(marketId)
        ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ========== Resolution ==========

  describe("Resolution", function () {
    describe("fetchResolution", function () {
      it("fetches resolution from the primary CTF for a resolved condition (YES wins [1,0])", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);

        const [pass, fail, denom] = await adapter.fetchResolution.staticCall(conditionId);
        expect(pass).to.equal(1n);
        expect(fail).to.equal(0n);
        expect(denom).to.equal(1n); // denominator = sum of payouts = 1+0 = 1
      });

      it("fetches resolution for NO wins [0,1]", async function () {
        const { adapter, ctf, alice } = await loadFixture(deployFixture);
        const questionId = ethers.id("NO wins question for fetch");
        const conditionId = await prepareCondition(ctf, alice.address, questionId);
        await ctf.resolveCondition(conditionId, [0, 1]);

        const [pass, fail, denom] = await adapter.fetchResolution.staticCall(conditionId);
        expect(pass).to.equal(0n);
        expect(fail).to.equal(1n);
        expect(denom).to.equal(1n);
      });
    });

    describe("fetchResolutionFromCTF", function () {
      it("fetches from a specific CTF", async function () {
        const { adapter, ctf, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        const ctfAddr = await ctf.getAddress();

        const [pass, fail, denom] = await adapter.fetchResolutionFromCTF.staticCall(conditionId, ctfAddr);
        expect(pass).to.equal(1n);
        expect(fail).to.equal(0n);
        expect(denom).to.equal(1n);
      });

      it("reverts with CTFNotSupported for unsupported CTF", async function () {
        const { adapter, alice, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        await expect(
          adapter.fetchResolutionFromCTF(conditionId, alice.address)
        ).to.be.revertedWithCustomError(adapter, "CTFNotSupported");
      });

      it("reverts with ConditionNotResolved for unresolved condition", async function () {
        const { adapter, ctf, alice } = await loadFixture(deployFixture);
        const questionId = ethers.id("Unresolved question");
        const conditionId = await prepareCondition(ctf, alice.address, questionId);

        await expect(
          adapter.fetchResolution(conditionId)
        ).to.be.revertedWithCustomError(adapter, "ConditionNotResolved");
      });

      it("reverts with FetchFailed when isResolved call fails (reverting CTF)", async function () {
        const { adapter, revertingCtf } = await loadFixture(deployWithRevertingCTFFixture);
        const revertingAddr = await revertingCtf.getAddress();
        const fakeConditionId = ethers.id("some-condition");

        await expect(
          adapter.fetchResolutionFromCTF(fakeConditionId, revertingAddr)
        ).to.be.revertedWithCustomError(adapter, "FetchFailed");
      });

      it("reverts with FetchFailed when getPayoutNumerators fails", async function () {
        const [admin] = await ethers.getSigners();

        // Deploy SelectiveRevertCTF that passes isResolved but reverts on getPayoutNumerators
        const SelectiveCTF = await ethers.getContractFactory("SelectiveRevertCTF");
        const selectiveCtf = await SelectiveCTF.deploy();
        await selectiveCtf.waitForDeployment();
        const selectiveAddr = await selectiveCtf.getAddress();

        await selectiveCtf.setRevertOnPayoutNumerators(true);

        // Deploy adapter with a valid CTF, then add selective CTF as supported
        const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
        const validCtf = await MockPolymarketCTF.deploy();
        await validCtf.waitForDeployment();

        const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
        const adapter = await PolymarketAdapter.deploy(await validCtf.getAddress());
        await adapter.waitForDeployment();

        await adapter.addCTFContract(selectiveAddr);

        const fakeConditionId = ethers.id("payout-numerator-fail");
        await expect(
          adapter.fetchResolutionFromCTF(fakeConditionId, selectiveAddr)
        ).to.be.revertedWithCustomError(adapter, "FetchFailed");
      });

      it("reverts with FetchFailed when getPayoutDenominator fails", async function () {
        const [admin] = await ethers.getSigners();

        // Deploy SelectiveRevertCTF that passes isResolved and getPayoutNumerators
        // but reverts on getPayoutDenominator
        const SelectiveCTF = await ethers.getContractFactory("SelectiveRevertCTF");
        const selectiveCtf = await SelectiveCTF.deploy();
        await selectiveCtf.waitForDeployment();
        const selectiveAddr = await selectiveCtf.getAddress();

        await selectiveCtf.setRevertOnPayoutDenominator(true);

        // Deploy adapter with a valid CTF, then add selective CTF as supported
        const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
        const validCtf = await MockPolymarketCTF.deploy();
        await validCtf.waitForDeployment();

        const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
        const adapter = await PolymarketAdapter.deploy(await validCtf.getAddress());
        await adapter.waitForDeployment();

        await adapter.addCTFContract(selectiveAddr);

        const fakeConditionId = ethers.id("payout-denominator-fail");
        await expect(
          adapter.fetchResolutionFromCTF(fakeConditionId, selectiveAddr)
        ).to.be.revertedWithCustomError(adapter, "FetchFailed");
      });
    });

    describe("caching and events", function () {
      it("caches resolution data and emits ResolutionFetched and ResolutionCached", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);

        await expect(adapter.fetchResolution(conditionId))
          .to.emit(adapter, "ResolutionFetched")
          .withArgs(conditionId, 1, 0, 1)
          .and.to.emit(adapter, "ResolutionCached")
          .withArgs(conditionId, 1, 0, 1);

        const cached = await adapter.getCachedResolution(conditionId);
        expect(cached.resolved).to.equal(true);
        expect(cached.passNumerator).to.equal(1n);
        expect(cached.failNumerator).to.equal(0n);
        expect(cached.denominator).to.equal(1n);
        expect(cached.cachedAt).to.be.gt(0n);
      });
    });

    describe("getResolutionForMarket", function () {
      it("returns cached data when available", async function () {
        const { adapter, conditionId, marketId } = await loadFixture(deployLinkAndResolveFixture);

        // Cache by fetching first
        await adapter.fetchResolution(conditionId);

        const [pass, fail, denom, resolved] = await adapter.getResolutionForMarket.staticCall(marketId);
        expect(pass).to.equal(1n);
        expect(fail).to.equal(0n);
        expect(denom).to.equal(1n);
        expect(resolved).to.equal(true);
      });

      it("fetches live from CTF when not cached", async function () {
        const { adapter, marketId } = await loadFixture(deployLinkAndResolveFixture);

        // Don't pre-cache, just call getResolutionForMarket directly
        const [pass, fail, denom, resolved] = await adapter.getResolutionForMarket.staticCall(marketId);
        expect(pass).to.equal(1n);
        expect(fail).to.equal(0n);
        expect(denom).to.equal(1n);
        expect(resolved).to.equal(true);
      });

      it("reverts with MarketNotLinked for unlinked market", async function () {
        const { adapter } = await loadFixture(deployFixture);
        await expect(
          adapter.getResolutionForMarket(999)
        ).to.be.revertedWithCustomError(adapter, "MarketNotLinked");
      });

      it("returns (0,0,0,false) when condition is not resolved", async function () {
        const { adapter, marketId } = await loadFixture(deployAndLinkFixture);

        const [pass, fail, denom, resolved] = await adapter.getResolutionForMarket.staticCall(marketId);
        expect(pass).to.equal(0n);
        expect(fail).to.equal(0n);
        expect(denom).to.equal(0n);
        expect(resolved).to.equal(false);
      });
    });
  });

  // ========== View Functions ==========

  describe("View Functions", function () {
    describe("isMarketLinked", function () {
      it("returns true when market is linked", async function () {
        const { adapter, marketId } = await loadFixture(deployAndLinkFixture);
        expect(await adapter.isMarketLinked(marketId)).to.equal(true);
      });

      it("returns false when market is not linked", async function () {
        const { adapter } = await loadFixture(deployFixture);
        expect(await adapter.isMarketLinked(999)).to.equal(false);
      });
    });

    describe("getLinkedMarket", function () {
      it("returns correct data for a linked market", async function () {
        const { adapter, ctf, conditionId, marketId } = await loadFixture(deployAndLinkFixture);
        const [retConditionId, retCtf, retLinked] = await adapter.getLinkedMarket(marketId);
        expect(retConditionId).to.equal(conditionId);
        expect(retCtf).to.equal(await ctf.getAddress());
        expect(retLinked).to.equal(true);
      });

      it("returns empty data for unlinked market", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const [retConditionId, retCtf, retLinked] = await adapter.getLinkedMarket(999);
        expect(retConditionId).to.equal(ethers.ZeroHash);
        expect(retCtf).to.equal(ethers.ZeroAddress);
        expect(retLinked).to.equal(false);
      });
    });

    describe("isConditionResolved", function () {
      it("returns true from cache", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        // Fetch to cache
        await adapter.fetchResolution(conditionId);
        expect(await adapter.isConditionResolved(conditionId)).to.equal(true);
      });

      it("returns true from CTF fallback (not cached)", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        // Condition is resolved on CTF but not cached
        expect(await adapter.isConditionResolved(conditionId)).to.equal(true);
      });

      it("returns false when condition is not resolved", async function () {
        const { adapter, conditionId } = await loadFixture(deployAndLinkFixture);
        expect(await adapter.isConditionResolved(conditionId)).to.equal(false);
      });

      it("returns false on error (reverting CTF)", async function () {
        const { adapter } = await loadFixture(deployWithRevertingCTFFixture);
        // The primary CTF is the reverting contract, so isResolved will revert
        // and the catch block should return false
        const fakeConditionId = ethers.id("fake");
        expect(await adapter.isConditionResolved(fakeConditionId)).to.equal(false);
      });
    });

    describe("getCachedResolution", function () {
      it("returns cached data after resolution is fetched", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        await adapter.fetchResolution(conditionId);

        const cached = await adapter.getCachedResolution(conditionId);
        expect(cached.resolved).to.equal(true);
        expect(cached.passNumerator).to.equal(1n);
        expect(cached.failNumerator).to.equal(0n);
        expect(cached.denominator).to.equal(1n);
        expect(cached.cachedAt).to.be.gt(0n);
      });

      it("returns defaults when not cached", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const fakeConditionId = ethers.id("uncached");
        const cached = await adapter.getCachedResolution(fakeConditionId);
        expect(cached.resolved).to.equal(false);
        expect(cached.passNumerator).to.equal(0n);
        expect(cached.failNumerator).to.equal(0n);
        expect(cached.denominator).to.equal(0n);
        expect(cached.cachedAt).to.equal(0n);
      });
    });

    describe("computeConditionId", function () {
      it("matches keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount))", async function () {
        const { adapter, alice } = await loadFixture(deployFixture);
        const oracleAddr = alice.address;
        const questionId = ethers.id("test-question");
        const outcomeSlotCount = 2;

        const computed = await adapter.computeConditionId(oracleAddr, questionId, outcomeSlotCount);
        const expected = ethers.solidityPackedKeccak256(
          ["address", "bytes32", "uint256"],
          [oracleAddr, questionId, outcomeSlotCount]
        );
        expect(computed).to.equal(expected);
      });
    });

    describe("determineOutcome", function () {
      it("returns (true, false) when pass wins", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const [outcome, isTie] = await adapter.determineOutcome(1, 0);
        expect(outcome).to.equal(true);
        expect(isTie).to.equal(false);
      });

      it("returns (false, false) when fail wins", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const [outcome, isTie] = await adapter.determineOutcome(0, 1);
        expect(outcome).to.equal(false);
        expect(isTie).to.equal(false);
      });

      it("returns (false, true) on tie", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const [outcome, isTie] = await adapter.determineOutcome(1, 1);
        expect(outcome).to.equal(false);
        expect(isTie).to.equal(true);
      });
    });
  });

  // ========== IOracleAdapter Interface ==========

  describe("IOracleAdapter Interface", function () {
    describe("oracleType", function () {
      it("returns 'Polymarket'", async function () {
        const { adapter } = await loadFixture(deployFixture);
        expect(await adapter.oracleType()).to.equal("Polymarket");
      });
    });

    describe("isAvailable", function () {
      it("returns true when CTF has code and responds", async function () {
        const { adapter } = await loadFixture(deployFixture);
        expect(await adapter.isAvailable()).to.equal(true);
      });

      it("returns false when CTF has no code (deployed against EOA)", async function () {
        const [admin, , bob] = await ethers.getSigners();
        // Deploy a mock CTF first to satisfy the constructor, then update to an EOA
        const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
        const tempCtf = await MockPolymarketCTF.deploy();
        await tempCtf.waitForDeployment();

        const PolymarketAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
        const adapter = await PolymarketAdapter.deploy(await tempCtf.getAddress());
        await adapter.waitForDeployment();

        // Update to an EOA address (no code)
        await adapter.updatePrimaryCTF(bob.address);
        expect(await adapter.isAvailable()).to.equal(false);
      });

      it("returns false when CTF contract reverts on isResolved", async function () {
        const { adapter } = await loadFixture(deployWithRevertingCTFFixture);
        // The reverting CTF has code but isResolved always reverts,
        // covering the catch path in isAvailable
        expect(await adapter.isAvailable()).to.equal(false);
      });
    });

    describe("getConfiguredChainId", function () {
      it("returns block.chainid", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const chainId = await adapter.getConfiguredChainId();
        const network = await ethers.provider.getNetwork();
        expect(chainId).to.equal(network.chainId);
      });
    });

    describe("isConditionSupported", function () {
      it("returns true when condition is cached", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        await adapter.fetchResolution(conditionId);
        expect(await adapter.isConditionSupported(conditionId)).to.equal(true);
      });

      it("returns true when condition exists in CTF (not cached)", async function () {
        const { adapter, conditionId } = await loadFixture(deployAndLinkFixture);
        // Condition is prepared on CTF but not cached
        expect(await adapter.isConditionSupported(conditionId)).to.equal(true);
      });

      it("returns false when condition does not exist", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const fakeConditionId = ethers.id("nonexistent");
        expect(await adapter.isConditionSupported(fakeConditionId)).to.equal(false);
      });

      it("returns false when getCondition call fails (reverting CTF)", async function () {
        const { adapter } = await loadFixture(deployWithRevertingCTFFixture);
        // The reverting CTF will cause getCondition to revert,
        // covering the catch path in isConditionSupported
        const fakeConditionId = ethers.id("anything");
        expect(await adapter.isConditionSupported(fakeConditionId)).to.equal(false);
      });
    });

    describe("getOutcome", function () {
      it("returns correct outcome from cache (resolved)", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        await adapter.fetchResolution(conditionId);

        const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
        expect(outcome).to.equal(true); // pass=1 > fail=0
        expect(confidence).to.equal(10000n);
        expect(resolvedAt).to.be.gt(0n);
      });

      it("returns correct outcome from CTF live (not cached)", async function () {
        const { adapter, conditionId } = await loadFixture(deployLinkAndResolveFixture);
        // Don't cache - getOutcome should fetch live from CTF
        const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
        expect(outcome).to.equal(true);
        expect(confidence).to.equal(10000n);
        expect(resolvedAt).to.be.gt(0n);
      });

      it("returns (false, 0, 0) when condition is not resolved", async function () {
        const { adapter, conditionId } = await loadFixture(deployAndLinkFixture);
        const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
        expect(outcome).to.equal(false);
        expect(confidence).to.equal(0n);
        expect(resolvedAt).to.equal(0n);
      });

      it("returns correct outcome for NO wins [0,1]", async function () {
        const { adapter, ctf, alice } = await loadFixture(deployFixture);
        const questionId = ethers.id("NO wins question");
        const conditionId = await prepareCondition(ctf, alice.address, questionId);

        // Resolve as NO wins: [0, 1]
        await ctf.resolveCondition(conditionId, [0, 1]);
        await adapter.fetchResolution(conditionId);

        const [outcome, confidence, resolvedAt] = await adapter.getOutcome(conditionId);
        expect(outcome).to.equal(false); // pass=0 < fail=1
        expect(confidence).to.equal(10000n);
        expect(resolvedAt).to.be.gt(0n);
      });

      it("returns (false, 0, 0) when CTF call fails (reverting CTF)", async function () {
        const { adapter } = await loadFixture(deployWithRevertingCTFFixture);
        // The reverting CTF will cause isResolved to revert,
        // covering the catch path in getOutcome
        const fakeConditionId = ethers.id("anything");
        const [outcome, confidence, resolvedAt] = await adapter.getOutcome(fakeConditionId);
        expect(outcome).to.equal(false);
        expect(confidence).to.equal(0n);
        expect(resolvedAt).to.equal(0n);
      });
    });

    describe("getConditionMetadata", function () {
      it("returns empty string and zero", async function () {
        const { adapter } = await loadFixture(deployFixture);
        const conditionId = ethers.id("any-condition");
        const [description, expectedResolutionTime] = await adapter.getConditionMetadata(conditionId);
        expect(description).to.equal("");
        expect(expectedResolutionTime).to.equal(0n);
      });
    });
  });
});
