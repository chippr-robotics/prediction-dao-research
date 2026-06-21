const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployMembershipManager } = require("./helpers/proxy");

// On-chain membership terms recording (Spec 007 — FR-039). purchaseTierWithTerms /
// upgradeTierWithTerms record the accepted T&C version hash + emit MembershipTermsRecorded.
// The existing purchaseTier/upgradeTier ABIs are unchanged (record nothing).

const Tier = { None: 0, Bronze: 1, Silver: 2 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);
const H1 = "0x" + "ab".repeat(32);

describe("MembershipManager terms recording", function () {
  async function deployFixture() {
    const [admin, alice, treasury] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
    await usdcToken.waitForDeployment();
    const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
    await mgr.waitForDeployment();
    const limits = { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 };
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, limits, true);
    await mgr.connect(admin).setTier(WAGER_PARTICIPANT_ROLE, Tier.Silver, usdc(120), 30, limits, true);
    await usdcToken.mint(alice.address, usdc(10_000));
    await usdcToken.connect(alice).approve(await mgr.getAddress(), ethers.MaxUint256);
    return { mgr, usdcToken, admin, alice };
  }

  it("purchaseTierWithTerms records the accepted hash + emits", async function () {
    const { mgr, alice } = await loadFixture(deployFixture);
    await expect(mgr.connect(alice).purchaseTierWithTerms(WAGER_PARTICIPANT_ROLE, Tier.Bronze, H1))
      .to.emit(mgr, "MembershipTermsRecorded")
      .withArgs(alice.address, WAGER_PARTICIPANT_ROLE, H1, anyUint());
    expect(await mgr.memberTermsHash(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(H1);
    expect(await mgr.hasActiveRole(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(true);
  });

  it("legacy purchaseTier records no terms hash", async function () {
    const { mgr, alice } = await loadFixture(deployFixture);
    await mgr.connect(alice).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    expect(await mgr.memberTermsHash(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(ethers.ZeroHash);
  });

  it("upgradeTierWithTerms records the accepted hash on upgrade", async function () {
    const { mgr, alice } = await loadFixture(deployFixture);
    await mgr.connect(alice).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await expect(mgr.connect(alice).upgradeTierWithTerms(WAGER_PARTICIPANT_ROLE, Tier.Silver, H1))
      .to.emit(mgr, "MembershipTermsRecorded")
      .withArgs(alice.address, WAGER_PARTICIPANT_ROLE, H1, anyUint());
    expect(await mgr.memberTermsHash(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(H1);
  });
});

// Minimal anyUint matcher (the block timestamp is non-deterministic).
function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
