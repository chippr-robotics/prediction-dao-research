const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployWagerRegistry, deployMembershipManager } = require("./helpers/proxy");

// Feature 024 — open-challenge wagers (no named opponent, gated by a code-derived claim authority + EIP-712
// acceptance signature). Silver+ to create; any active tier to accept. Ships as the first in-place upgrade
// of the WagerRegistry UUPS proxy (spec 025).

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0, Creator: 1, Opponent: 2, ThirdParty: 3, Polymarket: 4 };
const Status = { None: 0, Open: 1, Active: 2, Resolved: 3, Cancelled: 4, Refunded: 5, Draw: 6 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

describe("WagerRegistry — open challenges (024)", function () {
  async function deployFixture() {
    const [admin, silverCreator, bronzeTaker, otherTaker, arbiter, treasury] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    await usdcToken.waitForDeployment();

    // MembershipManager is a UUPS proxy (spec 027) — deploy via the proxy helper, not the constructor.
    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 20 };
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Silver, usdc(100), 30, limits, true);

    const reg = await deployWagerRegistry([
      admin.address,
      await mgr.getAddress(),
      ethers.ZeroAddress, // no polymarket adapter
      [await usdcToken.getAddress()],
    ]);
    await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

    for (const u of [silverCreator, bronzeTaker, otherTaker, arbiter]) {
      await usdcToken.mint(u.address, usdc(10_000));
      await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
      await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
    }
    await mgr.connect(silverCreator).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Silver);
    await mgr.connect(bronzeTaker).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await mgr.connect(otherTaker).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await mgr.connect(arbiter).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);

    return { reg, mgr, usdcToken, admin, silverCreator, bronzeTaker, otherTaker, arbiter };
  }

  // A standalone "claim key" (the code-derived key). claimAuthority = its address; acceptance is an EIP-712
  // signature from it over (wagerId, taker). In production this key is derived from the four-word code.
  function newClaimKey() {
    return ethers.Wallet.createRandom();
  }

  async function signOpenAccept(claimKey, regAddr, wagerId, taker) {
    const { chainId } = await ethers.provider.getNetwork();
    const domain = { name: "FairWins WagerRegistry", version: "1", chainId, verifyingContract: regAddr };
    const types = { OpenAccept: [{ name: "wagerId", type: "uint256" }, { name: "taker", type: "address" }] };
    return claimKey.signTypedData(domain, types, { wagerId, taker });
  }

  async function createOpen(reg, creator, claimAuthority, overrides = {}) {
    const now = await time.latest();
    const p = {
      arbitrator: ethers.ZeroAddress,
      token: overrides.token,
      stake: usdc(10),
      acceptDeadline: now + 3600,
      resolveDeadline: now + 86400,
      resolutionType: Resolution.Either,
      oracleConditionId: ethers.ZeroHash,
      creatorIsYes: false,
      metadataHash: ethers.id("open-terms"),
      metadataUri: "ipfs://bafyOpen",
      ...overrides,
    };
    const tx = await reg.connect(creator).createOpenWager(
      claimAuthority, p.arbitrator, p.token, p.stake, p.acceptDeadline, p.resolveDeadline,
      p.resolutionType, p.oracleConditionId, p.creatorIsYes, p.metadataHash, p.metadataUri
    );
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
      .find((p2) => p2 && p2.name === "OpenWagerCreated");
    return Number(ev.args.wagerId);
  }

  describe("createOpenWager", () => {
    it("creates an open challenge: no opponent, equal stakes, escrowed, discoverable by claim", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, usdcToken } = fx;
      const key = newClaimKey();
      const balBefore = await usdcToken.balanceOf(silverCreator.address);
      const id = await createOpen(reg, silverCreator, key.address, { token: await usdcToken.getAddress() });
      const w = await reg.getWager(id);
      expect(w.opponent).to.equal(ethers.ZeroAddress);
      expect(w.status).to.equal(Status.Open);
      expect(w.creatorStake).to.equal(usdc(10));
      expect(w.opponentStake).to.equal(usdc(10)); // equal by construction
      expect(await usdcToken.balanceOf(silverCreator.address)).to.equal(balBefore - usdc(10));
      expect(await reg.isOpenChallenge(id)).to.equal(true);
      expect(await reg.openWagerIdForClaim(key.address)).to.equal(BigInt(id));
    });

    it("requires Silver tier or above to create (FR-005a)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, bronzeTaker, usdcToken } = fx;
      await expect(
        createOpen(reg, bronzeTaker, newClaimKey().address, { token: await usdcToken.getAddress() })
      ).to.be.revertedWithCustomError(reg, "InsufficientMembershipTier");
    });

    it("rejects Creator/Opponent self-resolution types (FR-016a)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, usdcToken } = fx;
      for (const rt of [Resolution.Creator, Resolution.Opponent]) {
        await expect(
          createOpen(reg, silverCreator, newClaimKey().address, { token: await usdcToken.getAddress(), resolutionType: rt })
        ).to.be.revertedWithCustomError(reg, "OpenResolutionTypeNotAllowed");
      }
    });

    it("rejects a zero claim authority and a duplicate active authority (FR-006a)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, usdcToken } = fx;
      const token = await usdcToken.getAddress();
      await expect(
        createOpen(reg, silverCreator, ethers.ZeroAddress, { token })
      ).to.be.revertedWithCustomError(reg, "ZeroClaimAuthority");
      const key = newClaimKey();
      await createOpen(reg, silverCreator, key.address, { token });
      await expect(
        createOpen(reg, silverCreator, key.address, { token })
      ).to.be.revertedWithCustomError(reg, "ClaimAuthorityInUse");
    });
  });

  describe("acceptOpenWager", () => {
    it("binds a code-holding member taker as opponent and frees the claim slot", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, bronzeTaker, usdcToken } = fx;
      const key = newClaimKey();
      const regAddr = await reg.getAddress();
      const id = await createOpen(reg, silverCreator, key.address, { token: await usdcToken.getAddress() });

      const sig = await signOpenAccept(key, regAddr, id, bronzeTaker.address);
      const balBefore = await usdcToken.balanceOf(bronzeTaker.address);
      await expect(reg.connect(bronzeTaker).acceptOpenWager(id, sig))
        .to.emit(reg, "WagerAccepted").withArgs(id, bronzeTaker.address);

      const w = await reg.getWager(id);
      expect(w.opponent).to.equal(bronzeTaker.address); // any active tier may accept (no floor)
      expect(w.status).to.equal(Status.Active);
      expect(await usdcToken.balanceOf(bronzeTaker.address)).to.equal(balBefore - usdc(10));
      expect(await reg.openWagerIdForClaim(key.address)).to.equal(0n); // slot freed (code reusable)
      expect(await reg.isOpenChallenge(id)).to.equal(false);
    });

    it("rejects a wrong-key signature and a signature bound to a different taker (front-run)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, bronzeTaker, otherTaker, usdcToken } = fx;
      const key = newClaimKey();
      const regAddr = await reg.getAddress();
      const id = await createOpen(reg, silverCreator, key.address, { token: await usdcToken.getAddress() });

      // wrong key
      const wrongSig = await signOpenAccept(newClaimKey(), regAddr, id, bronzeTaker.address);
      await expect(reg.connect(bronzeTaker).acceptOpenWager(id, wrongSig))
        .to.be.revertedWithCustomError(reg, "BadClaimSignature");

      // correct key but bound to otherTaker — bronzeTaker cannot reuse it (front-run defense, FR-011)
      const sigForOther = await signOpenAccept(key, regAddr, id, otherTaker.address);
      await expect(reg.connect(bronzeTaker).acceptOpenWager(id, sigForOther))
        .to.be.revertedWithCustomError(reg, "BadClaimSignature");
    });

    it("rejects creator self-accept and the named arbitrator (ThirdParty)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, arbiter, usdcToken } = fx;
      const regAddr = await reg.getAddress();
      const token = await usdcToken.getAddress();

      // self-accept
      const key1 = newClaimKey();
      const id1 = await createOpen(reg, silverCreator, key1.address, { token });
      const selfSig = await signOpenAccept(key1, regAddr, id1, silverCreator.address);
      await expect(reg.connect(silverCreator).acceptOpenWager(id1, selfSig))
        .to.be.revertedWithCustomError(reg, "SelfWager");

      // arbitrator-cannot-take on a ThirdParty open challenge
      const key2 = newClaimKey();
      const id2 = await createOpen(reg, silverCreator, key2.address, {
        token, resolutionType: Resolution.ThirdParty, arbitrator: arbiter.address,
      });
      const arbSig = await signOpenAccept(key2, regAddr, id2, arbiter.address);
      await expect(reg.connect(arbiter).acceptOpenWager(id2, arbSig))
        .to.be.revertedWithCustomError(reg, "ArbitratorCannotTake");
    });

    it("refuses a non-member taker even with a valid code", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, usdcToken } = fx;
      const [, , , , , , nonMember] = await ethers.getSigners();
      const key = newClaimKey();
      const regAddr = await reg.getAddress();
      const id = await createOpen(reg, silverCreator, key.address, { token: await usdcToken.getAddress() });
      const sig = await signOpenAccept(key, regAddr, id, nonMember.address);
      await expect(reg.connect(nonMember).acceptOpenWager(id, sig))
        .to.be.revertedWithCustomError(reg, "MembershipDenied");
    });

    it("binds exactly one taker in a race; the loser is refused with no funds taken", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, bronzeTaker, otherTaker, usdcToken } = fx;
      const key = newClaimKey();
      const regAddr = await reg.getAddress();
      const id = await createOpen(reg, silverCreator, key.address, { token: await usdcToken.getAddress() });

      const sig1 = await signOpenAccept(key, regAddr, id, bronzeTaker.address);
      const sig2 = await signOpenAccept(key, regAddr, id, otherTaker.address);
      await reg.connect(bronzeTaker).acceptOpenWager(id, sig1);

      const balBefore = await usdcToken.balanceOf(otherTaker.address);
      await expect(reg.connect(otherTaker).acceptOpenWager(id, sig2))
        .to.be.revertedWithCustomError(reg, "NotOpenChallenge");
      expect(await usdcToken.balanceOf(otherTaker.address)).to.equal(balBefore); // no funds taken
    });
  });

  describe("lifecycle & guards", () => {
    it("blocks declineWager on an open challenge (creator cancel is the only withdrawal)", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, bronzeTaker, usdcToken } = fx;
      const id = await createOpen(reg, silverCreator, newClaimKey().address, { token: await usdcToken.getAddress() });
      await expect(reg.connect(bronzeTaker).declineWager(id))
        .to.be.revertedWithCustomError(reg, "DeclineNotAllowedForOpenChallenge");
      // creator cannot be made to lose funds by anyone else; only cancelOpen by the creator releases it.
      await expect(reg.connect(bronzeTaker).cancelOpen(id)).to.be.revertedWithCustomError(reg, "NotCreator");
    });

    it("cancelOpen refunds the creator and frees the code for reuse", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, usdcToken } = fx;
      const token = await usdcToken.getAddress();
      const key = newClaimKey();
      const id = await createOpen(reg, silverCreator, key.address, { token });
      const balBefore = await usdcToken.balanceOf(silverCreator.address);
      await reg.connect(silverCreator).cancelOpen(id);
      expect(await usdcToken.balanceOf(silverCreator.address)).to.equal(balBefore + usdc(10));
      expect(await reg.openWagerIdForClaim(key.address)).to.equal(0n);
      // code reusable for a fresh open challenge
      const id2 = await createOpen(reg, silverCreator, key.address, { token });
      expect(await reg.openWagerIdForClaim(key.address)).to.equal(BigInt(id2));
    });

    it("claimRefund after the accept deadline refunds the creator and frees the code", async () => {
      const fx = await loadFixture(deployFixture);
      const { reg, silverCreator, usdcToken } = fx;
      const key = newClaimKey();
      const id = await createOpen(reg, silverCreator, key.address, { token: await usdcToken.getAddress() });
      await time.increase(3601);
      await reg.connect(silverCreator).claimRefund(id);
      expect((await reg.getWager(id)).status).to.equal(Status.Refunded);
      expect(await reg.openWagerIdForClaim(key.address)).to.equal(0n);
    });
  });
});
