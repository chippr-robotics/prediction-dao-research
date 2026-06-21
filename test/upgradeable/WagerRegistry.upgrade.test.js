const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployMembershipManager } = require("../helpers/proxy");

// Upgrade lifecycle for the real WagerRegistry behind a UUPS proxy (spec 025 US1/US2/US3):
// deploy with current logic, then an in-place upgrade preserves the address AND all wager state; only the
// UPGRADER_ROLE may upgrade; re-init is rejected. Uses the hardhat-upgrades plugin so the storage-layout
// safety validation runs on every deploy/upgrade. (Test-first against FR-001/002/003/004/009/011/012.)

const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Resolution = { Either: 0 };
const Status = { Active: 2 };
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes("WAGER_PARTICIPANT_ROLE"));
const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
const usdc = (n) => ethers.parseUnits(String(n), 6);

async function setup() {
  const [admin, alice, bob, outsider, treasury] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdcToken = await MockERC20.deploy("USD Coin", "USDC", 0);
  await usdcToken.waitForDeployment();

  const mgr = await deployMembershipManager([admin.address, await usdcToken.getAddress(), treasury.address]);
  await mgr.waitForDeployment();
  await mgr.connect(admin).setTier(
    WAGER_PARTICIPANT_ROLE, Tier.Bronze, usdc(50), 30,
    { monthlyMarketCreation: 100, maxConcurrentMarkets: 10 }, true
  );

  const Registry = await ethers.getContractFactory("WagerRegistry");
  const reg = await upgrades.deployProxy(
    Registry,
    [admin.address, await mgr.getAddress(), ethers.ZeroAddress, [await usdcToken.getAddress()]],
    { kind: "uups" }
  );
  await reg.waitForDeployment();
  await mgr.connect(admin).setAuthorizedCaller(await reg.getAddress(), true);

  for (const u of [alice, bob]) {
    await usdcToken.mint(u.address, usdc(10_000));
    await usdcToken.connect(u).approve(await mgr.getAddress(), ethers.MaxUint256);
    await usdcToken.connect(u).approve(await reg.getAddress(), ethers.MaxUint256);
    await mgr.connect(u).purchaseTier(WAGER_PARTICIPANT_ROLE, Tier.Bronze);
  }

  return { admin, alice, bob, outsider, treasury, usdcToken, mgr, reg };
}

async function createAndAccept(reg, alice, bob, usdcToken) {
  const now = await time.latest();
  const tx = await reg.connect(alice).createWager(
    bob.address, ethers.ZeroAddress, await usdcToken.getAddress(),
    usdc(10), usdc(10), now + 3600, now + 86400,
    Resolution.Either, ethers.ZeroHash, false, ethers.id("terms"), "ipfs://cid"
  );
  const receipt = await tx.wait();
  const ev = receipt.logs
    .map((l) => { try { return reg.interface.parseLog(l); } catch { return null; } })
    .find((p) => p && p.name === "WagerCreated");
  const wagerId = Number(ev.args.wagerId);
  await (await reg.connect(bob).acceptWager(wagerId)).wait();
  return wagerId;
}

describe("WagerRegistry — UUPS upgrade lifecycle", function () {
  it("deploys behind a proxy with current logic and runs normally (US1)", async function () {
    const { reg, alice, bob, usdcToken } = await setup();
    const wagerId = await createAndAccept(reg, alice, bob, usdcToken);
    const w = await reg.getWager(wagerId);
    expect(w.status).to.equal(Status.Active);
    expect(w.creator).to.equal(alice.address);
    expect(w.opponent).to.equal(bob.address);
  });

  it("rejects re-initialization of the proxy (US3 / FR-011)", async function () {
    const { reg, admin, mgr, usdcToken } = await setup();
    await expect(
      reg.initialize(admin.address, await mgr.getAddress(), ethers.ZeroAddress, [await usdcToken.getAddress()])
    ).to.be.revertedWithCustomError(reg, "InvalidInitialization");
  });

  it("upgrades in place: address unchanged, all wager state preserved, new logic active (US2)", async function () {
    const { reg, alice, bob, usdcToken } = await setup();
    const wagerId = await createAndAccept(reg, alice, bob, usdcToken);
    const before = await reg.getWager(wagerId);
    const addrBefore = await reg.getAddress();
    const escrowBefore = await usdcToken.balanceOf(addrBefore);

    const Mock = await ethers.getContractFactory("WagerRegistryUpgradeMock");
    // The mock appends `upgradeMarker` (defaults to 0, needs no seeding); the validator's
    // "missing-initializer" heuristic is a false positive here. Storage-layout compatibility is still
    // fully enforced (a reordering mock IS rejected — see the UUPSManaged storage-incompat test).
    const upgraded = await upgrades.upgradeProxy(addrBefore, Mock, { unsafeAllow: ["missing-initializer"] });
    await upgraded.waitForDeployment();

    // Address unchanged; escrowed funds intact.
    expect(await upgraded.getAddress()).to.equal(addrBefore);
    expect(await usdcToken.balanceOf(addrBefore)).to.equal(escrowBefore);

    // Pre-existing wager reads back identically and remains operable.
    const after = await upgraded.getWager(wagerId);
    expect(after.creator).to.equal(before.creator);
    expect(after.opponent).to.equal(before.opponent);
    expect(after.status).to.equal(before.status);
    expect(after.creatorStake).to.equal(before.creatorStake);

    // New logic is active and new appended state works.
    expect(await upgraded.upgradeProbe()).to.equal("v2");
    await (await upgraded.setUpgradeMarker(123)).wait();
    expect(await upgraded.upgradeMarker()).to.equal(123n);

    // A new wager can still be created post-upgrade (lifecycle uninterrupted).
    const w2 = await createAndAccept(upgraded, alice, bob, usdcToken);
    expect(Number(w2)).to.be.greaterThan(wagerId);
  });

  it("only UPGRADER_ROLE may upgrade; an outsider is refused (US3 / FR-009)", async function () {
    const { reg, outsider } = await setup();
    const Mock = await ethers.getContractFactory("WagerRegistryUpgradeMock");
    const newImpl = await Mock.deploy();
    await newImpl.waitForDeployment();
    const asOutsider = (await ethers.getContractFactory("WagerRegistry"))
      .attach(await reg.getAddress())
      .connect(outsider);
    await expect(asOutsider.upgradeToAndCall(await newImpl.getAddress(), "0x"))
      .to.be.revertedWithCustomError(reg, "AccessControlUnauthorizedAccount");
    // Sanity: admin holds UPGRADER_ROLE.
    const [admin] = await ethers.getSigners();
    expect(await reg.hasRole(UPGRADER_ROLE, admin.address)).to.equal(true);
  });
});
