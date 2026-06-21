const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("../../helpers/proxy");

// T015 (feature 024) — end-to-end OPEN-CHALLENGE lifecycle integration test:
//   create (Silver+, no named opponent) -> discover via openWagerIdForClaim -> accept with a code-derived
//   EIP-712 signature -> resolve -> winner claimPayout gets the full pot — and the payout MIRRORS an
//   equivalent named-opponent run (quickstart §1 "Lifecycle", SC-009). The four-word code is modelled by a
//   random "claim key" wallet; in production it is derived from the code (frontend/src/utils/claimCode/).

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("Integration — open-challenge lifecycle (024)", function () {
  async function deployFixture() {
    const [admin, creator, taker, namedOpp, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    await usdcToken.waitForDeployment();

    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 20 };
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Silver, usdc(100), 30, limits, true);

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      ethers.ZeroAddress,
      [await usdcToken.getAddress()],
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [creator, taker, namedOpp]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
    }
    // Creator needs Silver+ to create an open challenge; takers need any active tier.
    await mgr.connect(creator).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Silver);
    await mgr.connect(taker).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await mgr.connect(namedOpp).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);

    return { reg, mgr, usdcToken, admin, creator, taker, namedOpp };
  }

  function newClaimKey() {
    return ethers.Wallet.createRandom();
  }

  async function signOpenAccept(claimKey, regAddr, wagerId, taker) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: "FairWins WagerRegistry", version: "1", chainId, verifyingContract: regAddr };
    const types = { OpenAccept: [{ name: "wagerId", type: "uint256" }, { name: "taker", type: "address" }] };
    return claimKey.signTypedData(domain, types, { wagerId, taker });
  }

  async function createOpen(reg, creator, usdcToken, claimAuthority, stake) {
    const now = await time.latest();
    const tx = await reg.connect(creator).createOpenWager(
      claimAuthority,
      ethers.ZeroAddress,
      await usdcToken.getAddress(),
      stake,
      now + 3600,
      now + 86400,
      Resolution.Either,
      ethers.ZeroHash,
      false,
      ethers.id("open-terms"),
      "ipfs://bafyOpen",
    );
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "OpenWagerCreated");
    return Number(ev.args.wagerId);
  }

  it("create -> discover -> accept -> resolve -> claim pays the winner the full pot", async () => {
    const { reg, usdcToken, creator, taker } = await loadFixture(deployFixture);
    const regAddr = await reg.getAddress();
    const stake = usdc(10);

    // 1. Create (no named opponent; gated by the code-derived claim authority).
    const claimKey = newClaimKey();
    const creatorBefore = await usdcToken.balanceOf(creator.address);
    const id = await createOpen(reg, creator, usdcToken, claimKey.address, stake);

    let w = await reg.getWager(id);
    expect(w.status).to.equal(Status.Open);
    expect(w.opponent).to.equal(ethers.ZeroAddress); // no opponent bound yet
    expect(w.creatorStake).to.equal(stake);
    expect(w.opponentStake).to.equal(stake); // equal stakes by construction
    expect(await usdcToken.balanceOf(creator.address)).to.equal(creatorBefore - stake); // creator escrowed

    // 2. Discover the wager from the code's claim authority (read-only lookup).
    expect(await reg.openWagerIdForClaim(claimKey.address)).to.equal(id);
    expect(await reg.isOpenChallenge(id)).to.equal(true);

    // 3. Accept with a code-derived EIP-712 signature bound to the taker; taker escrows the matching stake.
    const takerBefore = await usdcToken.balanceOf(taker.address);
    const sig = await signOpenAccept(claimKey, regAddr, id, taker.address);
    await expect(reg.connect(taker).acceptOpenWager(id, sig))
      .to.emit(reg, "WagerAccepted").withArgs(id, taker.address);

    w = await reg.getWager(id);
    expect(w.status).to.equal(Status.Active);
    expect(w.opponent).to.equal(taker.address); // opponent now bound
    expect(await usdcToken.balanceOf(taker.address)).to.equal(takerBefore - stake);
    // The claim slot is released once the wager leaves Open.
    expect(await reg.openWagerIdForClaim(claimKey.address)).to.equal(0);

    // 4. Resolve (Either-side: the creator declares) and 5. winner claims the full pot.
    await reg.connect(creator).declareWinner(id, taker.address);
    w = await reg.getWager(id);
    expect(w.status).to.equal(Status.Resolved);
    expect(w.winner).to.equal(taker.address);

    const beforeClaim = await usdcToken.balanceOf(taker.address);
    await expect(reg.connect(taker).claimPayout(id))
      .to.emit(reg, "PayoutClaimed").withArgs(id, taker.address, stake * 2n);
    expect(await usdcToken.balanceOf(taker.address)).to.equal(beforeClaim + stake * 2n);
  });

  it("pays out identically to an equivalent named-opponent wager (parity)", async () => {
    const { reg, usdcToken, creator, taker, namedOpp } = await loadFixture(deployFixture);
    const regAddr = await reg.getAddress();
    const stake = usdc(25);
    const now = await time.latest();

    // --- Open-challenge run ---
    const claimKey = newClaimKey();
    const openId = await createOpen(reg, creator, usdcToken, claimKey.address, stake);
    const sig = await signOpenAccept(claimKey, regAddr, openId, taker.address);
    await reg.connect(taker).acceptOpenWager(openId, sig);
    await reg.connect(creator).declareWinner(openId, taker.address);
    const openWinnerBefore = await usdcToken.balanceOf(taker.address);
    await reg.connect(taker).claimPayout(openId);
    const openPayout = (await usdcToken.balanceOf(taker.address)) - openWinnerBefore;

    // --- Equivalent named-opponent run (same stakes, same resolution) ---
    const namedTx = await reg.connect(creator).createWager(
      namedOpp.address, ethers.ZeroAddress, await usdcToken.getAddress(),
      stake, stake, now + 3600, now + 86400,
      Resolution.Either, ethers.ZeroHash, false, ethers.id("named-terms"), "ipfs://bafyNamed",
    );
    const namedRc = await namedTx.wait();
    const namedId = Number(namedRc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "WagerCreated").args.wagerId);
    await reg.connect(namedOpp).acceptWager(namedId);
    await reg.connect(creator).declareWinner(namedId, namedOpp.address);
    const namedWinnerBefore = await usdcToken.balanceOf(namedOpp.address);
    await reg.connect(namedOpp).claimPayout(namedId);
    const namedPayout = (await usdcToken.balanceOf(namedOpp.address)) - namedWinnerBefore;

    // SC-009: the open-challenge winner receives exactly what a named-opponent winner would.
    expect(openPayout).to.equal(stake * 2n);
    expect(openPayout).to.equal(namedPayout);
  });
});
