/**
 * Amoy Private Side-Bet E2E
 *
 * Validates the full user-visible flow that the Polygon Amoy migration is meant
 * to unblock: a private friend-market wager, denominated in a 6-dec stablecoin
 * (matching Polymarket testnet USDC), pegged to a Polymarket condition, settled
 * automatically by referenced lookup, then claimed by the winner.
 *
 * Existing PolymarketOracleAdapter.test.js covers unit-level behavior of the
 * adapter and the pegging/resolution surface. This test exercises the whole
 * lifecycle end-to-end including the post-settlement claim, which is the
 * actual user-facing outcome we care about for the migration.
 *
 * The test runs against a local hardhat network. The Polymarket CTF is stood
 * up via MockPolymarketCTF — it implements the same interface the real Amoy
 * CTF exposes, so the only difference between this test and a real Amoy
 * deployment is who controls condition resolution.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { getFriendGroupMarketFactoryWithLibs } = require("../../helpers/deployFriendGroupFactory");

const ResolutionType = {
  Either: 0,
  Initiator: 1,
  Receiver: 2,
  ThirdParty: 3,
  AutoPegged: 4,
  PolymarketOracle: 5,
};
const MembershipTier = { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 };
const FRIEND_MARKET_ROLE = ethers.id("FRIEND_MARKET_ROLE");
const POLYMARKET_ID = ethers.keccak256(ethers.toUtf8Bytes("POLYMARKET"));

// Mirror the Amoy-shaped collateral: 6-decimal USDC-style ERC20.
const USDC_DECIMALS = 6;
const u = (n) => ethers.parseUnits(String(n), USDC_DECIMALS);

describe("Amoy Private Side-Bet (Polymarket-pegged) — full lifecycle", function () {
  let owner;
  let creator;
  let opponent;
  let randomCaller;

  let mockCTF;
  let polymarketAdapter;
  let oracleRegistry;
  let collateralToken;
  let ctf1155;
  let marketFactory;
  let ragequitModule;
  let tieredRoleManager;
  let paymentManager;
  let friendGroupFactory;

  // Fixed Polymarket condition shape used by the test.
  const polymarketOracle = "0x0000000000000000000000000000000000000001";
  const questionId = ethers.keccak256(ethers.toUtf8Bytes("Will the migration ship by EOQ?"));
  const outcomeSlotCount = 2;
  let conditionId;

  beforeEach(async function () {
    [owner, creator, opponent, randomCaller] = await ethers.getSigners();

    // 1. Polymarket CTF stand-in — same interface as real Polymarket Amoy CTF.
    const MockPolymarketCTF = await ethers.getContractFactory("MockPolymarketCTF");
    mockCTF = await MockPolymarketCTF.deploy();
    await mockCTF.waitForDeployment();

    conditionId = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "bytes32", "uint256"],
        [polymarketOracle, questionId, outcomeSlotCount]
      )
    );

    // 2. Adapter pointed at the mock CTF, registered in OracleRegistry under
    //    keccak256("POLYMARKET") — same wiring that scripts/deploy/04 produces.
    const PolymarketOracleAdapter = await ethers.getContractFactory("PolymarketOracleAdapter");
    polymarketAdapter = await PolymarketOracleAdapter.deploy(await mockCTF.getAddress());
    await polymarketAdapter.waitForDeployment();

    const OracleRegistry = await ethers.getContractFactory("OracleRegistry");
    oracleRegistry = await OracleRegistry.deploy(owner.address);
    await oracleRegistry.registerAdapter(POLYMARKET_ID, await polymarketAdapter.getAddress());

    // 3. 6-decimal collateral token, mirroring Polymarket Amoy USDC.
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateralToken = await MockERC20.deploy("Test USDC", "USDC", u(1_000_000));
    await collateralToken.waitForDeployment();
    // Override decimals to match real USDC (MockERC20 defaults to 18).
    if (typeof collateralToken.setDecimals === "function") {
      await collateralToken.setDecimals(USDC_DECIMALS);
    }

    // 4. CTF1155 used by ConditionalMarketFactory for our own markets.
    const CTF1155 = await ethers.getContractFactory("CTF1155");
    ctf1155 = await CTF1155.deploy();
    await ctf1155.waitForDeployment();

    // 5. ConditionalMarketFactory + RagequitModule.
    const ConditionalMarketFactory = await ethers.getContractFactory("ConditionalMarketFactory");
    marketFactory = await ConditionalMarketFactory.deploy();
    await marketFactory.initialize(owner.address);
    await marketFactory.setCTF1155(await ctf1155.getAddress());

    const RagequitModule = await ethers.getContractFactory("RagequitModule");
    ragequitModule = await RagequitModule.deploy();

    // 6. TieredRoleManager + a Bronze friend-market tier so creator and opponent
    //    can purchase memberships. Tier price uses the chain native token in
    //    purchaseRoleWithTier (paid as msg.value), so we keep it minimal.
    const TieredRoleManager = await ethers.getContractFactory("TieredRoleManager");
    tieredRoleManager = await TieredRoleManager.deploy();
    await tieredRoleManager.waitForDeployment();
    await tieredRoleManager.initializeRoleMetadata();
    await tieredRoleManager.setTierMetadata(
      FRIEND_MARKET_ROLE,
      MembershipTier.BRONZE,
      "Friend Market Bronze",
      "Basic friend market tier",
      ethers.parseEther("0.01"),
      {
        dailyBetLimit: 10,
        weeklyBetLimit: 50,
        monthlyMarketCreation: 5,
        maxPositionSize: u(1000),
        maxConcurrentMarkets: 3,
        withdrawalLimit: u(10000),
        canCreatePrivateMarkets: true,
        canUseAdvancedFeatures: false,
        feeDiscount: 0,
      },
      true
    );
    const tierMeta = await tieredRoleManager.tierMetadata(FRIEND_MARKET_ROLE, MembershipTier.BRONZE);
    const tierPrice = tierMeta.price;

    const MembershipPaymentManager = await ethers.getContractFactory("MembershipPaymentManager");
    paymentManager = await MembershipPaymentManager.deploy(owner.address);
    await paymentManager.waitForDeployment();

    // 7. FriendGroupMarketFactory — the contract under test.
    const FriendGroupMarketFactory = await getFriendGroupMarketFactoryWithLibs();
    friendGroupFactory = await FriendGroupMarketFactory.deploy(
      await marketFactory.getAddress(),
      await ragequitModule.getAddress(),
      await tieredRoleManager.getAddress(),
      await paymentManager.getAddress(),
      owner.address
    );
    await friendGroupFactory.waitForDeployment();

    await friendGroupFactory.setDefaultCollateralToken(await collateralToken.getAddress());
    await friendGroupFactory.setTreasury(owner.address);
    // Wire the Polymarket adapter — the same call 05-configure.js makes.
    await friendGroupFactory.setPolymarketAdapter(await polymarketAdapter.getAddress());

    // Transfer marketFactory ownership so friendGroupFactory can deploy markets.
    await marketFactory.transferOwnership(await friendGroupFactory.getAddress());

    // Buy memberships for both wager parties.
    const durDays = 365;
    await tieredRoleManager.connect(creator).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE, MembershipTier.BRONZE, durDays, { value: tierPrice }
    );
    await tieredRoleManager.connect(opponent).purchaseRoleWithTier(
      FRIEND_MARKET_ROLE, MembershipTier.BRONZE, durDays, { value: tierPrice }
    );

    // Fund both parties with USDC and approve the factory to pull stakes.
    const stakePool = u(1000);
    await collateralToken.transfer(creator.address, stakePool);
    await collateralToken.transfer(opponent.address, stakePool);
    await collateralToken.connect(creator).approve(await friendGroupFactory.getAddress(), stakePool);
    await collateralToken.connect(opponent).approve(await friendGroupFactory.getAddress(), stakePool);

    // Prepare the Polymarket condition (unresolved) so adapter validation passes.
    await mockCTF.prepareCondition(polymarketOracle, questionId, outcomeSlotCount);
  });

  it("settles a private side bet from a Polymarket condition and pays the winner", async function () {
    // The wager: creator bets PASS, opponent bets FAIL, both stake 50 USDC.
    const stake = u(50);
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latest = await ethers.provider.getBlock("latest");
    const acceptanceDeadline = latest.timestamp + 2 * 60 * 60;

    // 1. Create the friend market with USDC collateral.
    await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
      opponent.address,
      "Will the migration ship by EOQ?",
      tradingPeriod,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stake,
      await collateralToken.getAddress(),
      ResolutionType.Either,
    );
    const marketId = 0;

    // 2. Opponent accepts and stakes.
    await friendGroupFactory.connect(opponent).acceptMarket(marketId);

    // 3. Creator pegs the friend market to the Polymarket condition. After
    //    this point the wager is no longer manually resolvable.
    await expect(
      friendGroupFactory.connect(creator).pegToPolymarketCondition(marketId, conditionId)
    )
      .to.emit(friendGroupFactory, "MarketPeggedToPolymarket")
      .withArgs(marketId, conditionId);

    // Sanity: the friend market now reports PolymarketOracle as its resolution path.
    const status = await friendGroupFactory.getFriendMarketWithStatus(marketId);
    expect(status.resolutionType).to.equal(ResolutionType.PolymarketOracle);

    // 4. Polymarket resolves with PASS winning (numerators [1, 0]). In
    //    production this is what UMA's optimistic oracle would post; here we
    //    short-circuit by calling the mock directly.
    await mockCTF.resolveCondition(conditionId, [1, 0]);

    // 5. Anyone can trigger settlement on the friend market — referenced
    //    lookup pulls the resolution from the adapter, so the call doesn't
    //    need to come from a wager party.
    await expect(
      friendGroupFactory.connect(randomCaller).resolveFromPolymarket(marketId)
    )
      .to.emit(friendGroupFactory, "PolymarketMarketResolved")
      .withArgs(marketId, conditionId, 1, 0, true);

    // FriendMarketStatus.Resolved == 4 (after PendingResolution and Challenged).
    const resolved = await friendGroupFactory.getFriendMarketWithStatus(marketId);
    expect(resolved.status).to.equal(4);

    // 6. Winner (the creator, who bet PASS) claims. Pot is 2x stake = 100 USDC.
    const before = await collateralToken.balanceOf(creator.address);
    await friendGroupFactory.connect(creator).claimWinnings(marketId);
    const after = await collateralToken.balanceOf(creator.address);

    expect(after - before).to.equal(stake * 2n);

    // Loser cannot claim (already-claimed state was set on the winning claim).
    await expect(
      friendGroupFactory.connect(opponent).claimWinnings(marketId)
    ).to.be.reverted;
  });

  it("settles correctly when Polymarket resolves NO (opponent wins)", async function () {
    const stake = u(25);
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latest = await ethers.provider.getBlock("latest");
    const acceptanceDeadline = latest.timestamp + 2 * 60 * 60;

    await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
      opponent.address,
      "Will the migration ship by EOQ?",
      tradingPeriod,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stake,
      await collateralToken.getAddress(),
      ResolutionType.Either,
    );
    const marketId = 0;
    await friendGroupFactory.connect(opponent).acceptMarket(marketId);
    await friendGroupFactory.connect(creator).pegToPolymarketCondition(marketId, conditionId);

    // Polymarket resolves [0, 1] — FAIL wins. The friend-market opponent gets the pot.
    await mockCTF.resolveCondition(conditionId, [0, 1]);
    await friendGroupFactory.connect(randomCaller).resolveFromPolymarket(marketId);

    const winner = await friendGroupFactory.wagerWinner(marketId);
    expect(winner).to.equal(opponent.address);

    const before = await collateralToken.balanceOf(opponent.address);
    await friendGroupFactory.connect(opponent).claimWinnings(marketId);
    const after = await collateralToken.balanceOf(opponent.address);
    expect(after - before).to.equal(stake * 2n);
  });

  it("rejects settle-from-Polymarket before the condition resolves", async function () {
    const stake = u(10);
    const tradingPeriod = 7 * 24 * 60 * 60;
    const latest = await ethers.provider.getBlock("latest");
    const acceptanceDeadline = latest.timestamp + 2 * 60 * 60;

    await friendGroupFactory.connect(creator).createOneVsOneMarketPending(
      opponent.address,
      "Will the migration ship by EOQ?",
      tradingPeriod,
      ethers.ZeroAddress,
      acceptanceDeadline,
      stake,
      await collateralToken.getAddress(),
      ResolutionType.Either,
    );
    await friendGroupFactory.connect(opponent).acceptMarket(0);
    await friendGroupFactory.connect(creator).pegToPolymarketCondition(0, conditionId);

    // Polymarket condition has NOT been resolved on the mock — the call must
    // revert with PolymarketNotResolved so users don't accidentally settle a
    // wager against a stale or pre-resolution state.
    await expect(
      friendGroupFactory.connect(randomCaller).resolveFromPolymarket(0)
    ).to.be.revertedWithCustomError(friendGroupFactory, "PolymarketNotResolved");
  });
});
