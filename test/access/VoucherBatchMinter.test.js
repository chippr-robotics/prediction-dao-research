const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployMembershipManager } = require("../helpers/proxy");

// VoucherBatchMinter (spec 026): single-tx "buy N vouchers" and "gift to an address" helper over the
// immutable MembershipVoucher (whose mint() makes one token, to msg.sender). The helper pulls the full price
// once, mints the batch, and forwards every voucher to the recipient — holding no funds or NFTs at rest.

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);
const PRICE = usdc(50);

async function setup() {
  const [admin, alice, bob, treasury] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
  await usdcToken.waitForDeployment();

  const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
  await mgr.waitForDeployment();
  await mgr.connect(admin).setTier(
    WAGER_PARTICIPANT_ROLE, Tier.Bronze, PRICE, 30, { monthlyMarketCreation: 5, maxConcurrentMarkets: 2 }, true
  );

  const Voucher = await ethers.getContractFactory("MembershipVoucher");
  const voucher = await Voucher.deploy(admin.address, await mgr.getAddress());
  await voucher.waitForDeployment();
  await mgr.connect(admin).setVoucher(await voucher.getAddress());

  const Minter = await ethers.getContractFactory("VoucherBatchMinter");
  const minter = await Minter.deploy(await voucher.getAddress());
  await minter.waitForDeployment();

  // Buyers approve the MINTER (not the voucher) for the batch helper rail.
  for (const u of [alice, bob]) {
    await usdcToken.mint(u.address, usdc(10_000));
    await usdcToken.connect(u).approve(await minter.getAddress(), ethers.MaxUint256);
  }

  return { admin, alice, bob, treasury, usdcToken, mgr, voucher, minter };
}

describe("VoucherBatchMinter", function () {
  it("wires manager + payment token from the voucher", async function () {
    const { minter, voucher, mgr, usdcToken } = await setup();
    expect(await minter.voucher()).to.equal(await voucher.getAddress());
    expect(await minter.manager()).to.equal(await mgr.getAddress());
    expect(await minter.paymentToken()).to.equal(await usdcToken.getAddress());
  });

  it("mints a quantity to the buyer, charging quantity * price to the treasury", async function () {
    const { minter, voucher, alice, treasury, usdcToken } = await setup();
    const before = await usdcToken.balanceOf(treasury.address);

    await expect(minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 3, alice.address))
      .to.emit(minter, "BatchMinted");

    expect(await usdcToken.balanceOf(treasury.address)).to.equal(before + PRICE * 3n);
    expect(await voucher.balanceOf(alice.address)).to.equal(3n);
    for (const id of [1n, 2n, 3n]) {
      expect(await voucher.ownerOf(id)).to.equal(alice.address);
    }
  });

  it("gifts the whole batch to a recipient while the buyer pays", async function () {
    const { minter, voucher, alice, bob, treasury, usdcToken } = await setup();
    const buyerBefore = await usdcToken.balanceOf(alice.address);
    const treasuryBefore = await usdcToken.balanceOf(treasury.address);

    await minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 2, bob.address);

    expect(await voucher.balanceOf(bob.address)).to.equal(2n);
    expect(await voucher.balanceOf(alice.address)).to.equal(0n);
    expect(await voucher.ownerOf(1)).to.equal(bob.address);
    expect(await usdcToken.balanceOf(alice.address)).to.equal(buyerBefore - PRICE * 2n);
    expect(await usdcToken.balanceOf(treasury.address)).to.equal(treasuryBefore + PRICE * 2n);
  });

  it("holds no USDC, no NFTs, and no residual allowance after a batch", async function () {
    const { minter, voucher, alice, usdcToken } = await setup();
    await minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 4, alice.address);

    const minterAddr = await minter.getAddress();
    expect(await usdcToken.balanceOf(minterAddr)).to.equal(0n);
    expect(await voucher.balanceOf(minterAddr)).to.equal(0n);
    expect(await usdcToken.allowance(minterAddr, await voucher.getAddress())).to.equal(0n);
  });

  it("returns the first and last minted ids", async function () {
    const { minter, alice } = await setup();
    const [firstId, lastId] = await minter
      .connect(alice)
      .mintBatch.staticCall(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 3, alice.address);
    expect(firstId).to.equal(1n);
    expect(lastId).to.equal(3n);
  });

  it("reverts on zero quantity or over the cap", async function () {
    const { minter, alice } = await setup();
    await expect(
      minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 0, alice.address)
    ).to.be.revertedWithCustomError(minter, "InvalidQuantity");
    const max = await minter.MAX_QUANTITY();
    await expect(
      minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, max + 1n, alice.address)
    ).to.be.revertedWithCustomError(minter, "InvalidQuantity");
  });

  it("reverts gifting to the zero address", async function () {
    const { minter, alice } = await setup();
    await expect(
      minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 1, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(minter, "ZeroAddress");
  });

  it("reverts minting an inactive / unconfigured tier", async function () {
    const { minter, alice } = await setup();
    await expect(
      minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Gold, 1, alice.address)
    ).to.be.revertedWithCustomError(minter, "TierInactive");
  });

  it("vouchers minted via the helper carry the correct snapshot and confer no membership while held", async function () {
    const { minter, voucher, mgr, alice } = await setup();
    await minter.connect(alice).mintBatch(WAGER_PARTICIPANT_ROLE, Tier.Bronze, 1, alice.address);
    const info = await voucher.voucherInfo(1);
    expect(info.role).to.equal(WAGER_PARTICIPANT_ROLE);
    expect(info.tier).to.equal(Tier.Bronze);
    expect(info.durationDays).to.equal(30);
    expect(await mgr.hasActiveRole(alice.address, WAGER_PARTICIPANT_ROLE)).to.equal(false);
  });
});
