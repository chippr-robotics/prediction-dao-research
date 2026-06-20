const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry } = require("../helpers/proxy");

// Integration: SanctionsGuard wired into WagerRegistry + MembershipManager (Spec 007,
// FR-016/FR-021/FR-054, SC-004/SC-016). Verifies value-bearing entrypoints are screened
// (sender + counterparty-on-accept) and that exit/refund paths stay UNGATED.

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("Sanctions gating (integration)", function () {
  async function deployFixture() {
    const [admin, alice, bob, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    await usdcToken.waitForDeployment();

    const MembershipManager = await ethers.getContractFactory("MembershipManager");
    const mgr = await MembershipManager.deploy(admin.address, await usdcToken.getAddress(), treasury.address);
    await mgr.waitForDeployment();
    const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 };
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Silver, usdc(120), 30, limits, true);

    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();

    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(admin.address, await oracle.getAddress());
    await guard.waitForDeployment();

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      ethers.ZeroAddress, // no polymarket adapter needed
      [await usdcToken.getAddress()]
    ]);

    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);
    // Wire the guard into both fund contracts
    await reg.connect(admin).setSanctionsGuard(await guard.getAddress());
    await mgr.connect(admin).setSanctionsGuard(await guard.getAddress());

    for (const u of [alice, bob]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
      await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze); // clean at setup
    }

    return { reg, mgr, usdcToken, oracle, guard, admin, alice, bob };
  }

  async function createParams(fx, opponent) {
    const now = await time.latest();
    return [
      opponent,
      ethers.ZeroAddress, // arbitrator
      await fx.usdcToken.getAddress(),
      usdc(10), // creatorStake
      usdc(10), // opponentStake
      BigInt(now) + 86400n, // acceptDeadline (+1d)
      BigInt(now) + 864000n, // resolveDeadline (+10d)
      Resolution.Either,
      ethers.ZeroHash, // polymarketConditionId
      false, // creatorIsYes
      ethers.ZeroHash, // metadataHash
      "ipfs://meta", // metadataUri
    ];
  }

  describe("createWager screening", function () {
    it("allows a clean creator", async function () {
      const fx = await loadFixture(deployFixture);
      const params = await createParams(fx, fx.bob.address);
      await expect(fx.reg.connect(fx.alice).createWager(...params)).to.not.be.reverted;
    });

    it("blocks a deny-listed creator", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.guard.connect(fx.admin).setDenied(fx.alice.address, true, "ofac");
      const params = await createParams(fx, fx.bob.address);
      await expect(fx.reg.connect(fx.alice).createWager(...params))
        .to.be.revertedWithCustomError(fx.guard, "SanctionedAddress")
        .withArgs(fx.alice.address);
    });

    it("blocks an oracle-sanctioned creator", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.oracle.setSanctioned(fx.alice.address, true);
      const params = await createParams(fx, fx.bob.address);
      await expect(fx.reg.connect(fx.alice).createWager(...params)).to.be.revertedWithCustomError(
        fx.guard,
        "SanctionedAddress"
      );
    });
  });

  describe("acceptWager screening (sender + counterparty)", function () {
    it("blocks a deny-listed accepting opponent (sender)", async function () {
      const fx = await loadFixture(deployFixture);
      const params = await createParams(fx, fx.bob.address);
      await fx.reg.connect(fx.alice).createWager(...params); // wagerId 1
      await fx.guard.connect(fx.admin).setDenied(fx.bob.address, true, "ofac");
      await expect(fx.reg.connect(fx.bob).acceptWager(1))
        .to.be.revertedWithCustomError(fx.guard, "SanctionedAddress")
        .withArgs(fx.bob.address);
    });

    it("blocks acceptance when the creator (counterparty) is listed after creation", async function () {
      const fx = await loadFixture(deployFixture);
      const params = await createParams(fx, fx.bob.address);
      await fx.reg.connect(fx.alice).createWager(...params); // wagerId 1
      await fx.guard.connect(fx.admin).setDenied(fx.alice.address, true, "listed later");
      await expect(fx.reg.connect(fx.bob).acceptWager(1))
        .to.be.revertedWithCustomError(fx.guard, "SanctionedAddress")
        .withArgs(fx.alice.address);
    });

    it("allows acceptance when both parties are clean", async function () {
      const fx = await loadFixture(deployFixture);
      const params = await createParams(fx, fx.bob.address);
      await fx.reg.connect(fx.alice).createWager(...params);
      await expect(fx.reg.connect(fx.bob).acceptWager(1)).to.not.be.reverted;
    });
  });

  describe("membership screening", function () {
    it("blocks purchaseTier for a deny-listed user", async function () {
      const fx = await loadFixture(deployFixture);
      const [, , , , carol] = await ethers.getSigners();
      await fx.usdcToken.mint(carol.address, usdc(1000));
      await fx.usdcToken.connect(carol).approve(await fx.mgr.getAddress(), ethers.MaxUint256);
      await fx.guard.connect(fx.admin).setDenied(carol.address, true, "ofac");
      await expect(
        fx.mgr.connect(carol).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze)
      ).to.be.revertedWithCustomError(fx.guard, "SanctionedAddress");
    });

    it("blocks upgradeTier for a deny-listed user", async function () {
      const fx = await loadFixture(deployFixture);
      await fx.guard.connect(fx.admin).setDenied(fx.alice.address, true, "ofac");
      await expect(
        fx.mgr.connect(fx.alice).upgradeTier(WAGER_PARTICIPANT_ROLE, Tier.Silver)
      ).to.be.revertedWithCustomError(fx.guard, "SanctionedAddress");
    });

    it("blocks the admin grantMembership path for a deny-listed grantee (non-bypassable)", async function () {
      const fx = await loadFixture(deployFixture);
      // admin holds ROLE_MANAGER_ROLE in the fixture; grantMembership must still screen.
      await fx.guard.connect(fx.admin).setDenied(fx.bob.address, true, "ofac");
      await expect(
        fx.mgr.connect(fx.admin).grantMembership(fx.bob.address, WAGER_PARTICIPANT_ROLE, Tier.Bronze, 30)
      ).to.be.revertedWithCustomError(fx.guard, "SanctionedAddress");
    });
  });

  describe("exit paths stay ungated (a listed party can recover funds)", function () {
    it("allows a deny-listed creator to claim a refund on an expired open wager", async function () {
      const fx = await loadFixture(deployFixture);
      const params = await createParams(fx, fx.bob.address);
      await fx.reg.connect(fx.alice).createWager(...params); // wagerId 1, Open
      await time.increase(86401); // past acceptDeadline
      await fx.guard.connect(fx.admin).setDenied(fx.alice.address, true, "listed after staking");

      const before = await fx.usdcToken.balanceOf(fx.alice.address);
      await expect(fx.reg.connect(fx.alice).claimRefund(1))
        .to.emit(fx.reg, "WagerRefunded")
        .withArgs(1, fx.alice.address, ethers.ZeroAddress);
      const after = await fx.usdcToken.balanceOf(fx.alice.address);
      expect(after - before).to.equal(usdc(10));
    });
  });
});
