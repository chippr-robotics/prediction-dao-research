const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFeeRouter } = require("../helpers/proxy");

// spec 067 — LiquidityRouter: the curated pool registry for BOTH pool kinds, and the fee-charging
// path for Uniswap V3 full-range supplies ONLY. Bridge (Across) pools are curated here but their
// deposits never pass through this contract (research R3), so `mintFullRangeWithFee` must reject
// them explicitly rather than fail opaquely downstream.
describe("LiquidityRouter", function () {
  const LIQUIDITY_DEPOSIT = ethers.keccak256(ethers.toUtf8Bytes("liquidity.deposit"));
  const PoolKind = { Unlisted: 0, BridgeLp: 1, TradingLp: 2 };
  const ServiceKind = { Wrapped: 1, ConfigOnly: 2 };
  const ETH = (n) => ethers.parseEther(n);

  const FEE_TIER = 3000;
  const TICK_SPACING = 60;
  // ±887272 truncated toward zero at spacing 60 — the bounds the router must derive from the pool.
  const FULL_RANGE_TICK = 887220n;
  const DEADLINE = 4_000_000_000; // far future; the position manager mock does not enforce it

  let admin, liquidityAdmin, guardian, member, treasury, stranger;
  let feeRouter, router, token0, token1, pool, nfpm;
  let routerAddr, nfpmAddr;
  let tradingPoolId, bridgePoolId;

  /// Deploy LiquidityRouter behind an ERC1967 UUPS proxy — the same manual-proxy pattern as
  /// test/helpers/proxy.js uses for FeeRouter/StakingRouter (fast, no plugin build-info coupling;
  /// storage-layout safety is validated separately by `npm run check:storage-layout`).
  async function deployLiquidityRouter(initArgs) {
    const Impl = await ethers.getContractFactory("LiquidityRouter");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();

    const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
    const Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await Proxy.deploy(await impl.getAddress(), initData);
    await proxy.waitForDeployment();

    return Impl.attach(await proxy.getAddress());
  }

  /// One curated Uniswap trading pool listing, overridable field by field.
  function tradingListing(overrides = {}) {
    return {
      kind: PoolKind.TradingLp,
      enabled: true,
      feeTier: FEE_TIER,
      token0: token0.target,
      token1: token1.target,
      poolAddress: pool.target,
      maxDeposit0PerTx: 0,
      maxDeposit1PerTx: 0,
      ...overrides,
    };
  }

  async function supply(overrides = {}) {
    const {
      poolId = tradingPoolId,
      amount0 = ETH("100"),
      amount1 = ETH("200"),
      amount0Min = 0,
      amount1Min = 0,
      deadline = DEADLINE,
      maxFeeBps = 250,
      from = member,
    } = overrides;
    return router
      .connect(from)
      .mintFullRangeWithFee(poolId, amount0, amount1, amount0Min, amount1Min, deadline, maxFeeBps);
  }

  beforeEach(async function () {
    [admin, liquidityAdmin, guardian, member, treasury, stranger] = await ethers.getSigners();

    feeRouter = await deployFeeRouter([admin.address, treasury.address]);
    await feeRouter.connect(admin).registerService(LIQUIDITY_DEPOSIT, 250, ServiceKind.ConfigOnly);

    // Uniswap sort order (token0 < token1) so the fixture reads like a real pair.
    const Token = await ethers.getContractFactory("MockERC20");
    const a = await Token.deploy("Token A", "TKA", 0);
    const b = await Token.deploy("Token B", "TKB", 0);
    [token0, token1] = a.target.toLowerCase() < b.target.toLowerCase() ? [a, b] : [b, a];

    const Pool = await ethers.getContractFactory("MockUniswapV3Pool");
    pool = await Pool.deploy(token0.target, token1.target, FEE_TIER, TICK_SPACING);

    const Nfpm = await ethers.getContractFactory("MockPositionManager");
    nfpm = await Nfpm.deploy();
    nfpmAddr = await nfpm.getAddress();

    router = await deployLiquidityRouter([
      admin.address,
      await feeRouter.getAddress(),
      nfpmAddr,
      ethers.ZeroAddress, // sanctions guard off by default; wired explicitly in the screening test
    ]);
    routerAddr = await router.getAddress();
    await router.connect(admin).grantRole(await router.LIQUIDITY_ADMIN_ROLE(), liquidityAdmin.address);
    await router.connect(admin).grantRole(await router.GUARDIAN_ROLE(), guardian.address);

    await router.connect(liquidityAdmin).listPool(tradingListing());
    tradingPoolId = await router.computePoolId(
      PoolKind.TradingLp,
      pool.target,
      token0.target,
      token1.target
    );

    // A curated Across bridge pool: single asset, no token1, no fee tier. Listed here, but its
    // deposits are a direct member call to the HubPool — never routed through this contract.
    await router.connect(liquidityAdmin).listPool({
      kind: PoolKind.BridgeLp,
      enabled: true,
      feeTier: 0,
      token0: token0.target,
      token1: ethers.ZeroAddress,
      poolAddress: stranger.address, // stands in for the HubPool address
      maxDeposit0PerTx: 0,
      maxDeposit1PerTx: 0,
    });
    bridgePoolId = await router.computePoolId(
      PoolKind.BridgeLp,
      stranger.address,
      token0.target,
      ethers.ZeroAddress
    );

    for (const t of [token0, token1]) {
      await t.mint(member.address, ETH("10000"));
      await t.connect(member).approve(routerAddr, ethers.MaxUint256);
    }
  });

  describe("initialize", function () {
    it("grants the roles to admin and stores config + the service id", async function () {
      expect(await router.hasRole(await router.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await router.hasRole(await router.UPGRADER_ROLE(), admin.address)).to.equal(true);
      expect(await router.hasRole(await router.LIQUIDITY_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await router.hasRole(await router.GUARDIAN_ROLE(), admin.address)).to.equal(true);
      expect(await router.feeRouter()).to.equal(await feeRouter.getAddress());
      expect(await router.positionManager()).to.equal(nfpmAddr);
      expect(await router.sanctionsGuard()).to.equal(ethers.ZeroAddress);
      expect(await router.liquidityDepositServiceId()).to.equal(LIQUIDITY_DEPOSIT);
    });
  });

  describe("pool registry", function () {
    it("lists both kinds, enumerates them, and re-lists in place", async function () {
      expect(await router.poolCount()).to.equal(2);
      expect(await router.poolAt(0)).to.equal(tradingPoolId);
      expect(await router.poolAt(1)).to.equal(bridgePoolId);

      const listing = await router.getPool(tradingPoolId);
      expect(listing.kind).to.equal(PoolKind.TradingLp);
      expect(listing.enabled).to.equal(true);
      expect(listing.feeTier).to.equal(FEE_TIER);
      expect(listing.poolAddress).to.equal(pool.target);

      // Re-listing the same pool updates it without growing the set.
      await expect(router.connect(liquidityAdmin).listPool(tradingListing({ maxDeposit0PerTx: ETH("5"), maxDeposit1PerTx: ETH("5") })))
        .to.emit(router, "PoolListed")
        .withArgs(
          tradingPoolId,
          PoolKind.TradingLp,
          pool.target,
          token0.target,
          token1.target,
          FEE_TIER,
          ETH("5"), ETH("5"),
          liquidityAdmin.address
        );
      expect(await router.poolCount()).to.equal(2);
      expect((await router.getPool(tradingPoolId)).maxDeposit0PerTx).to.equal(ETH("5"));
    });

    it("derives full-range ticks from the pool's own tick spacing", async function () {
      const [tickLower, tickUpper] = await router.fullRangeTicks(pool.target);
      expect(tickLower).to.equal(-FULL_RANGE_TICK);
      expect(tickUpper).to.equal(FULL_RANGE_TICK);

      await pool.setTickSpacing(10); // the 500 fee tier
      const [lo, hi] = await router.fullRangeTicks(pool.target);
      expect(lo).to.equal(-887270n);
      expect(hi).to.equal(887270n);
    });
  });

  // ------------------------------------------------------------------ T032
  describe("T032 — role gating and BridgeLp rejection", function () {
    it("gates every config setter to LIQUIDITY_ADMIN_ROLE", async function () {
      const unauthorized = "AccessControlUnauthorizedAccount";
      await expect(router.connect(stranger).listPool(tradingListing()))
        .to.be.revertedWithCustomError(router, unauthorized);
      await expect(router.connect(stranger).setPoolEnabled(tradingPoolId, false))
        .to.be.revertedWithCustomError(router, unauthorized);
      await expect(router.connect(stranger).setPoolLimit(tradingPoolId, ETH("1"), ETH("1")))
        .to.be.revertedWithCustomError(router, unauthorized);
      await expect(router.connect(stranger).setPositionManager(stranger.address))
        .to.be.revertedWithCustomError(router, unauthorized);
      await expect(router.connect(stranger).setFeeRouter(stranger.address))
        .to.be.revertedWithCustomError(router, unauthorized);
      await expect(router.connect(stranger).setSanctionsGuard(stranger.address))
        .to.be.revertedWithCustomError(router, unauthorized);

      // The role holder passes on every one of them, and each emits its audit event (FR-046).
      await expect(router.connect(liquidityAdmin).setPoolEnabled(tradingPoolId, false))
        .to.emit(router, "PoolEnabledChanged")
        .withArgs(tradingPoolId, false, liquidityAdmin.address);
      await expect(router.connect(liquidityAdmin).setPoolLimit(tradingPoolId, ETH("1"), ETH("1")))
        .to.emit(router, "PoolLimitChanged")
        .withArgs(tradingPoolId, ETH("1"), ETH("1"), liquidityAdmin.address);
      await expect(router.connect(liquidityAdmin).setSanctionsGuard(stranger.address))
        .to.emit(router, "SanctionsGuardUpdated")
        .withArgs(ethers.ZeroAddress, stranger.address, liquidityAdmin.address);
      await expect(router.connect(liquidityAdmin).setPositionManager(stranger.address))
        .to.emit(router, "PositionManagerUpdated")
        .withArgs(nfpmAddr, stranger.address, liquidityAdmin.address);
      await expect(router.connect(liquidityAdmin).setFeeRouter(stranger.address))
        .to.emit(router, "FeeRouterUpdated")
        .withArgs(await feeRouter.getAddress(), stranger.address, liquidityAdmin.address);
      expect(await router.feeRouter()).to.equal(stranger.address);
    });

    it("gates pause/unpause to GUARDIAN_ROLE and pause blocks new supplies", async function () {
      await expect(router.connect(stranger).pause())
        .to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");

      await router.connect(guardian).pause();
      expect(await router.paused()).to.equal(true);
      await expect(supply()).to.be.revertedWithCustomError(router, "EnforcedPause");

      // Curation stays live while paused — the admin must still be able to retire a pool.
      await router.connect(liquidityAdmin).setPoolEnabled(tradingPoolId, false);
      await router.connect(liquidityAdmin).setPoolEnabled(tradingPoolId, true);

      await expect(router.connect(stranger).unpause())
        .to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");
      await router.connect(guardian).unpause();
      expect(await router.paused()).to.equal(false);
      await supply(); // supplies resume
      expect(await nfpm.ownerOf(1)).to.equal(member.address);
    });

    it("rejects a BridgeLp poolId with NotTradingPool — curated, but not routable", async function () {
      await expect(supply({ poolId: bridgePoolId }))
        .to.be.revertedWithCustomError(router, "NotTradingPool");

      // The rejection is about the deposit PATH, not the listing: the bridge pool stays curated
      // and enabled, because members supply it by calling Across's HubPool directly (research R3).
      const listing = await router.getPool(bridgePoolId);
      expect(listing.kind).to.equal(PoolKind.BridgeLp);
      expect(listing.enabled).to.equal(true);

      // Even retired, the kind check fires first — a bridge pool is never a Uniswap mint.
      await router.connect(liquidityAdmin).setPoolEnabled(bridgePoolId, false);
      await expect(supply({ poolId: bridgePoolId }))
        .to.be.revertedWithCustomError(router, "NotTradingPool");
    });
  });

  // ------------------------------------------------------------------ T033
  describe("T033 — retired pools, per-tx limit, fee ceiling", function () {
    it("rejects new supply into a retired pool with PoolRetired", async function () {
      await router.connect(liquidityAdmin).setPoolEnabled(tradingPoolId, false);
      await expect(supply()).to.be.revertedWithCustomError(router, "PoolRetired");

      // Retirement closes NEW deposits only; the listing survives so held positions stay
      // renderable and exitable (FR-024), and re-opening restores supplies.
      const listing = await router.getPool(tradingPoolId);
      expect(listing.poolAddress).to.equal(pool.target);
      expect(listing.token0).to.equal(token0.target);

      await router.connect(liquidityAdmin).setPoolEnabled(tradingPoolId, true);
      await supply();
      expect(await nfpm.ownerOf(1)).to.equal(member.address);
    });

    it("enforces the per-leg deposit ceilings with AmountAbovePoolLimit", async function () {
      await router.connect(liquidityAdmin).setPoolLimit(tradingPoolId, ETH("100"), ETH("100"));

      await expect(supply({ amount0: ETH("101"), amount1: ETH("1") }))
        .to.be.revertedWithCustomError(router, "AmountAbovePoolLimit");
      await expect(supply({ amount0: ETH("1"), amount1: ETH("101") }))
        .to.be.revertedWithCustomError(router, "AmountAbovePoolLimit");

      await supply({ amount0: ETH("100"), amount1: ETH("100") }); // exactly at the ceiling passes

      // 0 means uncapped, not "no deposits".
      await router.connect(liquidityAdmin).setPoolLimit(tradingPoolId, 0, 0);
      await supply({ amount0: ETH("1000"), amount1: ETH("1000") });
      expect(await nfpm.ownerOf(2)).to.equal(member.address);
    });

    it("reverts FeeAboveQuoted when the live rate exceeds the ceiling the member was shown", async function () {
      await feeRouter.connect(admin).setFeeBps(LIQUIDITY_DEPOSIT, 60);
      await expect(supply({ maxFeeBps: 50 })).to.be.revertedWithCustomError(router, "FeeAboveQuoted");

      await supply({ maxFeeBps: 60 }); // at the quoted rate it goes through

      // The fee lands on capital actually deployed, not on the 100 offered. The router approves the
      // net (100 - 0.6) to Uniswap, the mock consumes all of it, and the fee is 60 bps of THAT. The
      // few wei neither deployed nor charged are refunded, so the member is never billed for capital
      // that did not become a position.
      const gross = ETH("100");
      const deployed = gross - (gross * 60n) / 10_000n;
      expect(await token0.balanceOf(treasury.address)).to.equal((deployed * 60n) / 10_000n);
    });
  });

  // ------------------------------------------------------------------ T034
  describe("T034 — no removePool exists", function () {
    it("exposes no removePool: retirement is setPoolEnabled(false) (FR-024)", async function () {
      // A retired pool must stay visible and withdrawable; deleting the listing would erase the
      // metadata the app needs to render and exit a live position. If someone adds a remover
      // later, this test is the alarm.
      expect(router.interface.getFunction("removePool")).to.equal(null);
      // Positive control: the same probe finds a function that does exist, so the null above is
      // an absence and not a broken detector.
      expect(router.interface.getFunction("setPoolEnabled")).to.not.equal(null);
      const functionNames = router.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f.name);
      expect(functionNames).to.not.include("removePool");
      expect(functionNames.filter((n) => /^(remove|delete|unlist)/i.test(n))).to.deep.equal([]);

      // No fallback either, so a hand-rolled call cannot reach a hidden one.
      await expect(
        admin.sendTransaction({
          to: routerAddr,
          data: ethers.id("removePool(bytes32)").slice(0, 10) + tradingPoolId.slice(2),
        })
      ).to.be.reverted;

      // The sanctioned retirement path leaves the entry intact and enumerable.
      await router.connect(liquidityAdmin).setPoolEnabled(tradingPoolId, false);
      expect(await router.poolCount()).to.equal(2);
      expect(await router.poolAt(0)).to.equal(tradingPoolId);
      expect((await router.getPool(tradingPoolId)).enabled).to.equal(false);
      expect((await router.getPool(tradingPoolId)).poolAddress).to.equal(pool.target);
    });
  });

  // ------------------------------------------------------------------ T035
  describe("T035 — no residue after mintFullRangeWithFee", function () {
    it("leaves zero balances for BOTH tokens and zero NFPM approvals", async function () {
      await feeRouter.connect(admin).setFeeBps(LIQUIDITY_DEPOSIT, 50);
      await nfpm.setConsumeBps(6_000); // Uniswap rarely consumes both desired amounts exactly

      await supply();

      expect(await token0.balanceOf(routerAddr)).to.equal(0);
      expect(await token1.balanceOf(routerAddr)).to.equal(0);
      expect(await token0.allowance(routerAddr, nfpmAddr)).to.equal(0);
      expect(await token1.allowance(routerAddr, nfpmAddr)).to.equal(0);
      // Nothing stranded on the member's side of the approval either.
      expect(await token0.balanceOf(nfpmAddr)).to.be.greaterThan(0);
    });

    it("charges the fee ONLY on capital Uniswap actually consumed, not on what was offered", async function () {
      // Regression test for the overcharge found by adversarial review and reproduced on a live
      // fork by four independent reviewers. The router used to skim the fee from the GROSS desired
      // amounts BEFORE the mint; Uniswap then consumed only part of the net and the remainder was
      // refunded — so the member had paid a fee on capital that was handed straight back to them.
      await feeRouter.connect(admin).setFeeBps(LIQUIDITY_DEPOSIT, 50); // 0.5%
      await nfpm.setConsumeBps(6_000); // Uniswap takes 60% of what it is offered

      const gross0 = ETH("100");
      const gross1 = ETH("200");
      const net0 = gross0 - (gross0 * 50n) / 10_000n;
      const net1 = gross1 - (gross1 * 50n) / 10_000n;
      const spent0 = (net0 * 6_000n) / 10_000n;
      const spent1 = (net1 * 6_000n) / 10_000n;
      // The fee follows the capital that actually became the position.
      const fee0 = (spent0 * 50n) / 10_000n;
      const fee1 = (spent1 * 50n) / 10_000n;

      const before0 = await token0.balanceOf(member.address);
      const before1 = await token1.balanceOf(member.address);

      await expect(supply())
        .to.emit(router, "LiquiditySupplied")
        .withArgs(tradingPoolId, member.address, 1, spent0, spent1, fee0, fee1, member.address);

      expect(await token0.balanceOf(treasury.address)).to.equal(fee0);
      expect(await token1.balanceOf(treasury.address)).to.equal(fee1);

      // The member is out exactly (deployed + fee-on-deployed). Everything else came back whole.
      expect(before0 - (await token0.balanceOf(member.address))).to.equal(spent0 + fee0);
      expect(before1 - (await token1.balanceOf(member.address))).to.equal(spent1 + fee1);

      // And the router kept nothing.
      expect(await token0.balanceOf(routerAddr)).to.equal(0);
      expect(await token1.balanceOf(routerAddr)).to.equal(0);
    });

    it("charges strictly less than a fee on the gross would have (the overcharge is gone)", async function () {
      await feeRouter.connect(admin).setFeeBps(LIQUIDITY_DEPOSIT, 50);
      await nfpm.setConsumeBps(6_000);
      const gross0 = ETH("100");
      const feeOnGross0 = (gross0 * 50n) / 10_000n; // what the old, buggy path took

      await supply();

      const actual = await token0.balanceOf(treasury.address);
      expect(actual).to.be.lessThan(feeOnGross0);
      // Specifically: no fee at all on the refunded 40%.
      expect(actual).to.be.greaterThan(0);
    });

    it("mints the position NFT to the MEMBER with full-range ticks, never to the router", async function () {
      await supply();

      expect(await nfpm.ownerOf(1)).to.equal(member.address);
      const params = await nfpm.lastMint();
      expect(params.recipient).to.equal(member.address);
      expect(params.recipient).to.not.equal(routerAddr);
      expect(params.token0).to.equal(token0.target);
      expect(params.token1).to.equal(token1.target);
      expect(params.fee).to.equal(FEE_TIER);
      expect(params.tickLower).to.equal(-FULL_RANGE_TICK);
      expect(params.tickUpper).to.equal(FULL_RANGE_TICK);
      expect(params.deadline).to.equal(DEADLINE);
    });
  });

  // ------------------------------------------------------------------ remaining guards
  describe("mintFullRangeWithFee guards", function () {
    it("reverts PoolUnknown for a poolId that was never listed", async function () {
      const unknown = ethers.keccak256(ethers.toUtf8Bytes("not-a-pool"));
      await expect(supply({ poolId: unknown })).to.be.revertedWithCustomError(router, "PoolUnknown");
    });

    it("reverts PositionManagerUnset on a network with no Uniswap deployment", async function () {
      // Bridge pools can still be curated on such a network, so this must fail explicitly rather
      // than opaquely against address(0).
      await router.connect(liquidityAdmin).setPositionManager(ethers.ZeroAddress);
      await expect(supply()).to.be.revertedWithCustomError(router, "PositionManagerUnset");
    });

    it("reverts ZeroAmount when both legs are zero", async function () {
      await expect(supply({ amount0: 0, amount1: 0 }))
        .to.be.revertedWithCustomError(router, "ZeroAmount");
    });

    it("reverts MintFailed when the position manager returns zero liquidity", async function () {
      await nfpm.setZeroLiquidity(true);
      await expect(supply()).to.be.revertedWithCustomError(router, "MintFailed");
    });

    it("performs no treasury transfer at a zero rate (FR-029)", async function () {
      // Launch state: the service is registered at 0 bps, so the flow is byte-identical to a
      // fee-free supply — even with the member's consent ceiling pinned at 0.
      await supply({ maxFeeBps: 0 });

      expect(await token0.balanceOf(treasury.address)).to.equal(0);
      expect(await token1.balanceOf(treasury.address)).to.equal(0);
      expect(await token0.balanceOf(nfpmAddr)).to.equal(ETH("100"));
      expect(await token1.balanceOf(nfpmAddr)).to.equal(ETH("200"));
      expect(await nfpm.ownerOf(1)).to.equal(member.address);
    });

    it("screens the member and rejects a denied address (FR-031)", async function () {
      const Guard = await ethers.getContractFactory("SanctionsGuard");
      const guard = await Guard.deploy(admin.address, ethers.ZeroAddress); // deny-list only
      await router.connect(liquidityAdmin).setSanctionsGuard(await guard.getAddress());

      await guard.connect(admin).setDenied(member.address, true, "test");
      await expect(supply())
        .to.be.revertedWithCustomError(guard, "SanctionedAddress")
        .withArgs(member.address);

      await guard.connect(admin).setDenied(member.address, false, "cleared");
      await supply();
      expect(await nfpm.ownerOf(1)).to.equal(member.address);
    });
  });
});
