const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Upgrade lifecycle for the real FeeRouter behind a UUPS proxy (spec 060): deploy with current
// logic, then an in-place upgrade preserves the address AND the treasury/service-registry/rate
// state; only UPGRADER_ROLE may upgrade; re-init is rejected; a bare implementation cannot be
// initialized. Uses the hardhat-upgrades plugin so storage-layout safety validation runs on every
// deploy/upgrade (fast manual wiring lives in test/helpers/proxy.js#deployFeeRouter).

const EARN_LEND = ethers.keccak256(ethers.toUtf8Bytes("earn.lend"));
const PM_TAKER = ethers.keccak256(ethers.toUtf8Bytes("polymarket.taker"));
const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
const Kind = { Unregistered: 0, Wrapped: 1, ConfigOnly: 2 };

async function setup() {
  const [admin, outsider, treasury] = await ethers.getSigners();
  const Router = await ethers.getContractFactory("FeeRouter");
  const router = await upgrades.deployProxy(Router, [admin.address, treasury.address], { kind: "uups" });
  await router.waitForDeployment();
  await router.connect(admin).registerService(EARN_LEND, 250, Kind.Wrapped);
  await router.connect(admin).registerService(PM_TAKER, 100, Kind.ConfigOnly);
  await router.connect(admin).setFeeBps(EARN_LEND, 50);
  await router.connect(admin).setFeeBps(PM_TAKER, 40);
  return { admin, outsider, treasury, router };
}

describe("FeeRouter — UUPS upgrade lifecycle", function () {
  it("deploys behind a proxy; upgrade preserves address, treasury, services and rates", async function () {
    const { router, admin, treasury } = await setup();
    const proxyAddress = await router.getAddress();

    const V2 = await ethers.getContractFactory("FeeRouterUpgradeMock");
    // The mock adds no roles/config needing re-initialization, so the plugin's
    // "missing-initializer" heuristic is a false positive here (same as the other upgrade mocks).
    const upgraded = await upgrades.upgradeProxy(proxyAddress, V2.connect(admin), {
      kind: "uups",
      unsafeAllow: ["missing-initializer"],
    });

    expect(await upgraded.getAddress()).to.equal(proxyAddress);
    expect(await upgraded.upgradeProbe()).to.equal("v2");
    expect(await upgraded.treasury()).to.equal(treasury.address);
    expect(await upgraded.serviceCount()).to.equal(2n);
    expect(await upgraded.feeBps(EARN_LEND)).to.equal(50);
    expect(await upgraded.feeBps(PM_TAKER)).to.equal(40);
    const svc = await upgraded.getService(EARN_LEND);
    expect(svc.capBps).to.equal(250);
    expect(svc.kind).to.equal(Kind.Wrapped);

    await upgraded.setUpgradeMarker(7n);
    expect(await upgraded.upgradeMarker()).to.equal(7n);
  });

  it("rejects upgrade attempts from non-UPGRADER accounts", async function () {
    const { router, outsider } = await setup();
    const V2 = await ethers.getContractFactory("FeeRouterUpgradeMock", outsider);
    await expect(
      upgrades.upgradeProxy(await router.getAddress(), V2, {
        kind: "uups",
        unsafeAllow: ["missing-initializer"],
      })
    ).to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");
    expect(await router.hasRole(UPGRADER_ROLE, outsider.address)).to.equal(false);
  });

  it("rejects re-initialization of the proxy", async function () {
    const { router, admin, treasury } = await setup();
    await expect(router.initialize(admin.address, treasury.address)).to.be.revertedWithCustomError(
      router,
      "InvalidInitialization"
    );
  });

  it("locks initialization of the bare implementation", async function () {
    const [admin, , treasury] = await ethers.getSigners();
    const Router = await ethers.getContractFactory("FeeRouter");
    const impl = await Router.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize(admin.address, treasury.address)).to.be.revertedWithCustomError(
      impl,
      "InvalidInitialization"
    );
  });
});
