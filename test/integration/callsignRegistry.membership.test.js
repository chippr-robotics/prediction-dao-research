const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("../helpers/proxy");

// Integration (spec 054, US1 + FR-001a / SC-011): the CallsignRegistry Gold gate is exercised
// against a REAL MembershipManager proxy, and — critically — a tagless, BELOW-Gold account still
// completes a full wager create -> accept -> settle end-to-end. Callsigns are an optional perk; nothing
// on the value path requires one.

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0 };
const WAGER_PARTICIPANT_ROLE = ethers.id("WAGER_PARTICIPANT_ROLE");
const usdc = (n) => ethers.parseUnits(String(n), 6);
const SALT = ethers.id("integration-salt");

describe("CallsignRegistry × MembershipManager (integration)", function () {
  async function deployFixture() {
    // alice/bob wager (Bronze, no callsign); gold registers a callsign; none has no membership.
    const [admin, alice, bob, gold, none, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdcToken.waitForDeployment();

    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    await mgr.waitForDeployment();

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      ethers.ZeroAddress, // no polymarket adapter
      [await usdcToken.getAddress()],
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    const CallsignRegistry = await ethers.getContractFactory("CallsignRegistry");
    const callsignImpl = await CallsignRegistry.deploy();
    await callsignImpl.waitForDeployment();
    const callsignInit = CallsignRegistry.interface.encodeFunctionData("initialize", [
      admin.address,
      await mgr.getAddress(),
      ethers.ZeroAddress, // sanctions disabled here
      WAGER_PARTICIPANT_ROLE,
    ]);
    const Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const callsignProxy = await Proxy.deploy(await callsignImpl.getAddress(), callsignInit);
    await callsignProxy.waitForDeployment();
    const callsigns = CallsignRegistry.attach(await callsignProxy.getAddress());

    // Memberships: alice/bob Bronze (can wager, below Gold → no callsign), gold Gold, none nothing.
    await mgr.connect(admin).grantMembership(alice.address, WAGER_PARTICIPANT_ROLE, Tier.Bronze, 365);
    await mgr.connect(admin).grantMembership(bob.address, WAGER_PARTICIPANT_ROLE, Tier.Bronze, 365);
    await mgr.connect(admin).grantMembership(gold.address, WAGER_PARTICIPANT_ROLE, Tier.Gold, 365);

    for (const u of [alice, bob]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
    }

    return { reg, mgr, callsigns, usdcToken, admin, alice, bob, gold, none };
  }

  async function claim(callsigns, signer, callsign) {
    const commitment = await callsigns.makeCommitment(callsign, signer.address, SALT);
    await callsigns.connect(signer).commit(commitment);
    await time.increase(120); // past minCommitmentAge (60s)
    return callsigns.connect(signer).register(callsign, SALT);
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
      "ipfs://meta",
    ];
  }

  it("Gold registers a callsign; Silver/None are refused on-chain", async function () {
    const fx = await loadFixture(deployFixture);
    await claim(fx.callsigns, fx.gold, "goldco");
    expect(await fx.callsigns.callsignOf(fx.gold.address)).to.equal("goldco");

    // Below-Gold (Bronze) is refused.
    const c1 = await fx.callsigns.makeCommitment("brzco", fx.alice.address, SALT);
    await fx.callsigns.connect(fx.alice).commit(c1);
    await time.increase(120);
    await expect(fx.callsigns.connect(fx.alice).register("brzco", SALT)).to.be.revertedWithCustomError(
      fx.callsigns,
      "InsufficientMembershipTier"
    );

    // No membership at all is refused.
    const c2 = await fx.callsigns.makeCommitment("nobody", fx.none.address, SALT);
    await fx.callsigns.connect(fx.none).commit(c2);
    await time.increase(120);
    await expect(fx.callsigns.connect(fx.none).register("nobody", SALT)).to.be.revertedWithCustomError(
      fx.callsigns,
      "InsufficientMembershipTier"
    );
  });

  it("a tagless, below-Gold account completes a full wager create → accept → settle (FR-001a / SC-011)", async function () {
    const fx = await loadFixture(deployFixture);
    const { reg, callsigns, usdcToken, alice, bob } = fx;

    // Neither party holds (or can hold) a callsign.
    expect(await callsigns.callsignOf(alice.address)).to.equal("");
    expect(await callsigns.callsignOf(bob.address)).to.equal("");

    const params = await createParams(fx, bob.address);
    await expect(reg.connect(alice).createWager(...params)).to.not.be.reverted;
    const id = 1;
    await reg.connect(bob).acceptWager(id);
    await reg.connect(alice).declareWinner(id, alice.address);

    const before = await usdcToken.balanceOf(alice.address);
    await reg.connect(alice).claimPayout(id);
    expect((await usdcToken.balanceOf(alice.address)) - before).to.equal(usdc(20));

    // Still tagless after a full wager lifecycle — the callsign was never required.
    expect(await callsigns.callsignOf(alice.address)).to.equal("");
    expect(await callsigns.callsignOf(bob.address)).to.equal("");
  });
});
