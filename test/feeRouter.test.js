const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFeeRouter } = require("./helpers/proxy");
const { LAUNCH_FEE_SERVICES } = require("../scripts/deploy/lib/feeServices");

// spec 060 — unified platform-fee registry + atomic ERC-4626 fee wrapper.
describe("FeeRouter", function () {
  const EARN_LEND = ethers.keccak256(ethers.toUtf8Bytes("earn.lend"));
  const PM_TAKER = ethers.keccak256(ethers.toUtf8Bytes("polymarket.taker"));
  const UNKNOWN = ethers.keccak256(ethers.toUtf8Bytes("nope"));
  const Kind = { Unregistered: 0, Wrapped: 1, ConfigOnly: 2 };
  const USDC = (n) => ethers.parseUnits(n, 6);

  let admin, feeAdmin, member, treasury, stranger;
  let router, usdc, vault;

  beforeEach(async function () {
    [admin, feeAdmin, member, treasury, stranger] = await ethers.getSigners();

    router = await deployFeeRouter([admin.address, treasury.address]);
    await router.connect(admin).grantRole(await router.FEE_ADMIN_ROLE(), feeAdmin.address);

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdc = await MockERC20.deploy("USD Coin", "USDC", 0);
    const MockVault = await ethers.getContractFactory("MockERC4626Vault");
    vault = await MockVault.deploy(await usdc.getAddress());

    await router.connect(admin).registerService(EARN_LEND, 250, Kind.Wrapped);
    await router.connect(admin).registerService(PM_TAKER, 100, Kind.ConfigOnly);

    await usdc.mint(member.address, USDC("1000"));
    await usdc.connect(member).approve(await router.getAddress(), USDC("1000"));
  });

  describe("initialize", function () {
    it("grants admin the three roles and sets the treasury", async function () {
      expect(await router.hasRole(await router.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await router.hasRole(await router.UPGRADER_ROLE(), admin.address)).to.equal(true);
      expect(await router.hasRole(await router.FEE_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await router.treasury()).to.equal(treasury.address);
    });

    it("rejects a zero admin", async function () {
      const Impl = await ethers.getContractFactory("FeeRouter");
      const impl = await Impl.deploy();
      const initData = Impl.interface.encodeFunctionData("initialize", [ethers.ZeroAddress, treasury.address]);
      const Proxy = await ethers.getContractFactory("ERC1967Proxy");
      await expect(Proxy.deploy(await impl.getAddress(), initData)).to.be.revertedWithCustomError(
        Impl,
        "ZeroAddress"
      );
    });

    it("allows a zero treasury at init (fees will be skipped)", async function () {
      const bare = await deployFeeRouter([admin.address, ethers.ZeroAddress]);
      expect(await bare.treasury()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("registerService", function () {
    it("registers with cap and kind, enumerable, fee starts at 0", async function () {
      expect(await router.serviceCount()).to.equal(2n);
      expect(await router.serviceAt(0)).to.equal(EARN_LEND);
      const svc = await router.getService(EARN_LEND);
      expect(svc.capBps).to.equal(250);
      expect(svc.feeBps).to.equal(0);
      expect(svc.kind).to.equal(Kind.Wrapped);
    });

    it("emits ServiceRegistered", async function () {
      const id = ethers.keccak256(ethers.toUtf8Bytes("stake.lido"));
      await expect(router.connect(admin).registerService(id, 200, Kind.Wrapped))
        .to.emit(router, "ServiceRegistered")
        .withArgs(id, 200, Kind.Wrapped);
    });

    it("rejects wrapped caps above MAX_WRAPPED_FEE_BPS (250)", async function () {
      const id = ethers.keccak256(ethers.toUtf8Bytes("swap.uniswap"));
      await expect(
        router.connect(admin).registerService(id, 251, Kind.Wrapped)
      ).to.be.revertedWithCustomError(router, "CapAboveMax");
    });

    it("allows ConfigOnly caps above 250 (external programs keep their own caps)", async function () {
      const id = ethers.keccak256(ethers.toUtf8Bytes("some.external"));
      await router.connect(admin).registerService(id, 300, Kind.ConfigOnly);
      expect((await router.getService(id)).capBps).to.equal(300);
    });

    it("rejects zero caps, Unregistered kind, and duplicate ids", async function () {
      const id = ethers.keccak256(ethers.toUtf8Bytes("x"));
      await expect(router.connect(admin).registerService(id, 0, Kind.Wrapped)).to.be.revertedWithCustomError(
        router,
        "CapZero"
      );
      await expect(
        router.connect(admin).registerService(id, 10, Kind.Unregistered)
      ).to.be.revertedWithCustomError(router, "ServiceUnknown");
      await expect(
        router.connect(admin).registerService(EARN_LEND, 10, Kind.Wrapped)
      ).to.be.revertedWithCustomError(router, "AlreadyRegistered");
    });

    it("is DEFAULT_ADMIN gated (fee admin cannot register)", async function () {
      const id = ethers.keccak256(ethers.toUtf8Bytes("y"));
      await expect(router.connect(feeAdmin).registerService(id, 10, Kind.Wrapped)).to.be.revertedWithCustomError(
        router,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("setFeeBps", function () {
    it("sets within cap and emits actor/old/new (the audit history)", async function () {
      await expect(router.connect(feeAdmin).setFeeBps(EARN_LEND, 50))
        .to.emit(router, "FeeBpsChanged")
        .withArgs(EARN_LEND, 0, 50, feeAdmin.address);
      expect(await router.feeBps(EARN_LEND)).to.equal(50);
      await expect(router.connect(feeAdmin).setFeeBps(EARN_LEND, 25))
        .to.emit(router, "FeeBpsChanged")
        .withArgs(EARN_LEND, 50, 25, feeAdmin.address);
    });

    it("rejects above-cap rates and unknown services", async function () {
      await expect(router.connect(feeAdmin).setFeeBps(EARN_LEND, 251)).to.be.revertedWithCustomError(
        router,
        "CapExceeded"
      );
      await expect(router.connect(feeAdmin).setFeeBps(PM_TAKER, 101)).to.be.revertedWithCustomError(
        router,
        "CapExceeded"
      );
      await expect(router.connect(feeAdmin).setFeeBps(UNKNOWN, 1)).to.be.revertedWithCustomError(
        router,
        "ServiceUnknown"
      );
    });

    it("is FEE_ADMIN gated", async function () {
      await expect(router.connect(stranger).setFeeBps(EARN_LEND, 1)).to.be.revertedWithCustomError(
        router,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("accepts a rate at exactly the cap (inclusive boundary)", async function () {
      // Guards against an off-by-one regression to `>=` on the maximum fee the platform can charge.
      await router.connect(feeAdmin).setFeeBps(EARN_LEND, 250);
      expect(await router.feeBps(EARN_LEND)).to.equal(250);
      await router.connect(feeAdmin).setFeeBps(PM_TAKER, 100);
      expect(await router.feeBps(PM_TAKER)).to.equal(100);
    });
  });

  describe("setTreasury", function () {
    it("changes the destination and emits, rejects zero, is admin gated", async function () {
      await expect(router.connect(admin).setTreasury(stranger.address))
        .to.emit(router, "TreasuryChanged")
        .withArgs(treasury.address, stranger.address, admin.address);
      expect(await router.treasury()).to.equal(stranger.address);
      await expect(router.connect(admin).setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        router,
        "ZeroAddress"
      );
      await expect(router.connect(feeAdmin).setTreasury(stranger.address)).to.be.revertedWithCustomError(
        router,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("quoteFee", function () {
    it("floors in the member's favor", async function () {
      await router.connect(feeAdmin).setFeeBps(EARN_LEND, 50);
      let [fee, net] = await router.quoteFee(EARN_LEND, USDC("100"));
      expect(fee).to.equal(USDC("0.5"));
      expect(net).to.equal(USDC("99.5"));
      // 199 units * 50 / 10000 = 0.995 -> floors to 0
      [fee, net] = await router.quoteFee(EARN_LEND, 199n);
      expect(fee).to.equal(0n);
      expect(net).to.equal(199n);
    });

    it("reverts for unknown services", async function () {
      await expect(router.quoteFee(UNKNOWN, 1n)).to.be.revertedWithCustomError(router, "ServiceUnknown");
    });

    it("reports zero fee when no treasury is configured (mirrors the charge path)", async function () {
      const bare = await deployFeeRouter([admin.address, ethers.ZeroAddress]);
      await bare.connect(admin).registerService(EARN_LEND, 250, Kind.Wrapped);
      await bare.connect(admin).setFeeBps(EARN_LEND, 50);
      const [fee, net] = await bare.quoteFee(EARN_LEND, USDC("100"));
      expect(fee).to.equal(0n);
      expect(net).to.equal(USDC("100"));
    });
  });

  describe("launch fee-service table (deploy config)", function () {
    it("registers exactly the intended services with the right kind and cap", async function () {
      // Locks scripts/deploy/lib/feeServices.js against drift (the deploy script uses the same table).
      const fresh = await deployFeeRouter([admin.address, treasury.address]);
      for (const svc of LAUNCH_FEE_SERVICES) {
        const id = ethers.keccak256(ethers.toUtf8Bytes(svc.label));
        await fresh.connect(admin).registerService(id, svc.capBps, svc.kind);
        const got = await fresh.getService(id);
        expect(got.kind, `${svc.label} kind`).to.equal(svc.kind);
        expect(got.capBps, `${svc.label} cap`).to.equal(svc.capBps);
        expect(got.feeBps, `${svc.label} starts at 0`).to.equal(0);
      }
      // The flagship wrapped consumer must be chargeable; the Polymarket entries must not be.
      const earn = await fresh.getService(ethers.keccak256(ethers.toUtf8Bytes("earn.lend")));
      expect(earn.kind).to.equal(Kind.Wrapped);
      const taker = await fresh.getService(ethers.keccak256(ethers.toUtf8Bytes("polymarket.taker")));
      expect(taker.kind).to.equal(Kind.ConfigOnly);
    });
  });

  describe("depositToVaultWithFee", function () {
    beforeEach(async function () {
      await router.connect(feeAdmin).setFeeBps(EARN_LEND, 50);
    });

    it("splits fee to treasury and deposits net for the receiver, atomically", async function () {
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 50)
      )
        .to.emit(router, "FeeCharged")
        .withArgs(
          EARN_LEND,
          member.address,
          await usdc.getAddress(),
          USDC("100"),
          USDC("0.5"),
          await vault.getAddress(),
          member.address
        );

      expect(await usdc.balanceOf(treasury.address)).to.equal(USDC("0.5"));
      expect(await vault.maxWithdraw(member.address)).to.equal(USDC("99.5"));
      // The router never keeps a balance outside a transaction.
      expect(await usdc.balanceOf(await router.getAddress())).to.equal(0n);
      expect(await usdc.allowance(await router.getAddress(), await vault.getAddress())).to.equal(0n);
    });

    it("charges nothing at 0 bps (no fee event, full deposit)", async function () {
      await router.connect(feeAdmin).setFeeBps(EARN_LEND, 0);
      const tx = await router
        .connect(member)
        .depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 0);
      const receipt = await tx.wait();
      const events = receipt.logs.filter((l) => l.address === router.target);
      expect(events).to.have.length(0);
      expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
      expect(await vault.maxWithdraw(member.address)).to.equal(USDC("100"));
    });

    it("charges zero when the fee floors to zero on a tiny principal", async function () {
      await router.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), 199n, member.address, 50);
      expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
      expect(await vault.maxWithdraw(member.address)).to.equal(199n);
    });

    it("emits FeeCharged with zero fee on a dust deposit (exactly one event per deposit)", async function () {
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), 199n, member.address, 50)
      )
        .to.emit(router, "FeeCharged")
        .withArgs(EARN_LEND, member.address, await usdc.getAddress(), 199n, 0n, await vault.getAddress(), member.address);
    });

    it("reverts if the vault mints zero shares (no fee for nothing)", async function () {
      await vault.setZeroShares(true);
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 50)
      ).to.be.revertedWithCustomError(router, "ZeroShares");
      // The whole action rolled back — no fee kept, member made whole.
      expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
      expect(await usdc.balanceOf(member.address)).to.equal(USDC("1000"));
    });

    it("rejects a re-entrant vault via the nonReentrant guard", async function () {
      const Reentrant = await ethers.getContractFactory("MockReentrantERC4626Vault");
      const evil = await Reentrant.deploy(await usdc.getAddress());
      await evil.arm(await router.getAddress(), EARN_LEND);
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, await evil.getAddress(), USDC("100"), member.address, 50)
      ).to.be.revertedWithCustomError(router, "ReentrancyGuardReentrantCall");
      expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
    });

    it("pins the member to the quoted rate (FeeAboveQuoted)", async function () {
      // Member was quoted 50; admin raises to 100 before execution.
      await router.connect(feeAdmin).setFeeBps(EARN_LEND, 100);
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 50)
      ).to.be.revertedWithCustomError(router, "FeeAboveQuoted");
      // A lower live rate than quoted is fine (member pays less).
      await router.connect(feeAdmin).setFeeBps(EARN_LEND, 25);
      await router
        .connect(member)
        .depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 50);
      expect(await usdc.balanceOf(treasury.address)).to.equal(USDC("0.25"));
    });

    it("skips the fee (and flags it) when no treasury is configured", async function () {
      const bare = await deployFeeRouter([admin.address, ethers.ZeroAddress]);
      await bare.connect(admin).registerService(EARN_LEND, 250, Kind.Wrapped);
      await bare.connect(admin).setFeeBps(EARN_LEND, 50);
      await usdc.connect(member).approve(await bare.getAddress(), USDC("100"));
      await expect(
        bare.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 50)
      )
        .to.emit(bare, "FeeSkippedNoTreasury")
        .withArgs(EARN_LEND, member.address, USDC("100"));
      expect(await vault.maxWithdraw(member.address)).to.equal(USDC("100"));
    });

    it("reverts the fee leg when the vault deposit fails (atomicity)", async function () {
      await vault.setRevertOnDeposit(true);
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), member.address, 50)
      ).to.be.revertedWith("MockERC4626Vault: deposit disabled");
      // Nothing moved: no fee kept for a deposit that did not happen.
      expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
      expect(await usdc.balanceOf(member.address)).to.equal(USDC("1000"));
    });

    it("rejects unknown, config-only, zero-amount and zero-address calls", async function () {
      const v = await vault.getAddress();
      await expect(
        router.connect(member).depositToVaultWithFee(UNKNOWN, v, 1n, member.address, 50)
      ).to.be.revertedWithCustomError(router, "ServiceUnknown");
      await expect(
        router.connect(member).depositToVaultWithFee(PM_TAKER, v, 1n, member.address, 50)
      ).to.be.revertedWithCustomError(router, "ServiceNotWrapped");
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, v, 0n, member.address, 50)
      ).to.be.revertedWithCustomError(router, "ZeroAmount");
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, ethers.ZeroAddress, 1n, member.address, 50)
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
      await expect(
        router.connect(member).depositToVaultWithFee(EARN_LEND, v, 1n, ethers.ZeroAddress, 50)
      ).to.be.revertedWithCustomError(router, "ZeroAddress");
    });

    it("supports depositing on behalf of a different receiver", async function () {
      await router
        .connect(member)
        .depositToVaultWithFee(EARN_LEND, await vault.getAddress(), USDC("100"), stranger.address, 50);
      expect(await vault.maxWithdraw(stranger.address)).to.equal(USDC("99.5"));
      expect(await vault.maxWithdraw(member.address)).to.equal(0n);
    });
  });
});
