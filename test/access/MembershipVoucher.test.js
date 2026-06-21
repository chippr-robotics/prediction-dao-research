const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMembershipManager } = require("../helpers/proxy");

// MembershipVoucher (spec 026 US1): immutable ERC-721 + ERC-2981 bearer voucher. Mint for USDC at a (role,
// tier); confers no membership while held; transferable/resellable; on-chain tokenURI; royalty 2.5%/cap 5%.

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

async function setup() {
  const [admin, alice, bob, treasury] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
  await usdcToken.waitForDeployment();

  const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
  await mgr.waitForDeployment();
  await mgr.connect(admin).setTier(
    WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30, { monthlyMarketCreation: 5, maxConcurrentMarkets: 2 }, true
  );

  const Voucher = await ethers.getContractFactory("MembershipVoucher");
  const voucher = await Voucher.deploy(admin.address, await mgr.getAddress());
  await voucher.waitForDeployment();
  await mgr.connect(admin).setVoucher(await voucher.getAddress());

  for (const u of [alice, bob]) {
    await usdcToken.mint(u.address, usdc(10_000));
    await usdcToken.connect(u).approve(await voucher.getAddress(), ethers.MaxUint256);
  }

  return { admin, alice, bob, treasury, usdcToken, mgr, voucher };
}

describe("MembershipVoucher", function () {
  it("mints for the tier price to the treasury and snapshots (role, tier, durationDays)", async function () {
    const { voucher, mgr, alice, treasury, usdcToken } = await setup();
    const before = await usdcToken.balanceOf(treasury.address);
    await expect(voucher.connect(alice).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze))
      .to.emit(voucher, "VoucherMinted");
    expect(await usdcToken.balanceOf(treasury.address)).to.equal(before + usdc(50));
    expect(await voucher.ownerOf(1)).to.equal(alice.address);
    const info = await voucher.voucherInfo(1);
    expect(info.role).to.equal(WAGER_PARTICIPANT_ROLE);
    expect(info.tier).to.equal(Tier.Bronze);
    expect(info.durationDays).to.equal(30);
    // Holding the voucher confers no membership.
    expect(await mgr.hasActiveRole(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(false);
  });

  it("reverts minting an inactive / unconfigured tier", async function () {
    const { voucher, alice } = await setup();
    await expect(voucher.connect(alice).mint(WAGER_PARTICIPANT_ROLE, Tier.Gold))
      .to.be.revertedWithCustomError(voucher, "TierInactive");
  });

  it("is transferable/resellable with no membership effect", async function () {
    const { voucher, mgr, alice, bob } = await setup();
    await voucher.connect(alice).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await voucher.connect(alice).transferFrom(alice.address, bob.address, 1);
    expect(await voucher.ownerOf(1)).to.equal(bob.address);
    expect(await mgr.hasActiveRole(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(false);
    expect(await mgr.hasActiveRole(bob.address, WAGER_PARTICIPANT_ROLE)).to.equal(false);
  });

  it("exposes a best-effort 2.5% royalty to the treasury, capped at 5%", async function () {
    const { voucher, admin, alice, treasury } = await setup();
    await voucher.connect(alice).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    const [receiver, amount] = await voucher.royaltyInfo(1, usdc(100));
    expect(receiver).to.equal(treasury.address);
    expect(amount).to.equal(usdc(2.5));
    await expect(voucher.connect(admin).setRoyaltyBps(600)).to.be.revertedWithCustomError(voucher, "RoyaltyTooHigh");
    await voucher.connect(admin).setRoyaltyBps(300);
    const [, amount2] = await voucher.royaltyInfo(1, usdc(100));
    expect(amount2).to.equal(usdc(3));
  });

  it("renders an on-chain Base64 JSON tokenURI", async function () {
    const { voucher, alice } = await setup();
    await voucher.connect(alice).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    const uri = await voucher.tokenURI(1);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
    expect(json.name).to.contain("#1");
    expect(json.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
    expect(json.attributes[0].value).to.equal("Bronze");
  });

  it("restricts burn to the manager or the token owner", async function () {
    const { voucher, alice, bob } = await setup();
    await voucher.connect(alice).mint(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
    await expect(voucher.connect(bob).burn(1)).to.be.revertedWithCustomError(voucher, "NotManagerOrOwner");
    await voucher.connect(alice).burn(1); // owner self-burn allowed
    await expect(voucher.ownerOf(1)).to.be.revertedWithCustomError(voucher, "ERC721NonexistentToken");
  });
});
