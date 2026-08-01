const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// Upgrade lifecycle for the real MiniAppRegistry behind a UUPS proxy (spec 073): deploy with
// current logic, then an in-place upgrade preserves the address AND the catalog — above all each
// record's `approved` tuple, which is the only package a host may serve. A registry upgrade that
// silently shifted that state would repoint every launch at the wrong bytes, so it is asserted
// field by field here. Only UPGRADER_ROLE may upgrade; re-init is rejected; a bare implementation
// cannot be initialized. Uses the hardhat-upgrades plugin so storage-layout safety validation runs
// on every deploy/upgrade.

const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
const Tier = { None: 0, Bronze: 1, Silver: 2, Gold: 3, Platinum: 4 };
const Status = { Pending: 0, Approved: 1, Suspended: 2, Deprecated: 3 };
const Category = { TradeSettlement: 0, Reconciliation: 1, TreasuryLiquidity: 2 };

const CID_A = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
const CID_B = "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const HASH_A = ethers.id("manifest-a");
const HASH_B = ethers.id("manifest-b");

const INIT_ARGS = (admin) => [admin, ethers.ZeroAddress, ethers.ZeroHash, Tier.None, ethers.ZeroAddress];

async function setup() {
  const [admin, outsider, vendor, curator] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("MiniAppRegistry");
  const registry = await upgrades.deployProxy(Registry, INIT_ARGS(admin.address), { kind: "uups" });
  await registry.waitForDeployment();

  await registry.connect(admin).grantRole(await registry.APP_CURATOR_ROLE(), curator.address);
  // One Approved app, plus an update left in review — the exact state where `approved` and
  // `proposed` differ, so an upgrade that confused the two would be caught.
  await registry.connect(vendor).submitApp("Token Mint", "Mint tokens", Category.TreasuryLiquidity, CID_A, HASH_A);
  await registry.connect(curator).approveApp(1);
  await registry.connect(vendor).submitUpdate(1, CID_B, HASH_B);

  return { admin, outsider, vendor, curator, registry };
}

describe("MiniAppRegistry — UUPS upgrade lifecycle", function () {
  it("deploys behind a proxy; upgrade preserves address, catalog and the served package tuple", async function () {
    const { registry, admin, vendor } = await setup();
    const proxyAddress = await registry.getAddress();

    const V2 = await ethers.getContractFactory("MiniAppRegistryUpgradeMock");
    // The mock adds no roles/config needing re-initialization, so the plugin's
    // "missing-initializer" heuristic is a false positive here (same as the other upgrade mocks).
    const upgraded = await upgrades.upgradeProxy(proxyAddress, V2.connect(admin), {
      kind: "uups",
      unsafeAllow: ["missing-initializer"],
    });

    expect(await upgraded.getAddress()).to.equal(proxyAddress);
    expect(await upgraded.upgradeProbe()).to.equal("v2");
    expect(await upgraded.appCount()).to.equal(1n);

    const app = await upgraded.getApp(1);
    expect(app.vendor).to.equal(vendor.address);
    expect(app.name).to.equal("Token Mint");
    expect(app.status).to.equal(Status.Pending);
    // The bytes members are actually running survived the logic swap untouched.
    expect(app.approved.cid).to.equal(CID_A);
    expect(app.approved.manifestHash).to.equal(HASH_A);
    expect(app.approved.version).to.equal(1);
    // ...and so did the proposal still awaiting review.
    expect(app.proposed.cid).to.equal(CID_B);
    expect(app.proposed.version).to.equal(2);

    // Indexes survive too.
    expect(await upgraded.idByName("Token Mint")).to.equal(1n);
    expect((await upgraded.appIdsByVendor(vendor.address)).map(Number)).to.deep.equal([1]);

    await upgraded.setUpgradeMarker(7n);
    expect(await upgraded.upgradeMarker()).to.equal(7n);
  });

  it("keeps the curator role effective across the upgrade", async function () {
    const { registry, admin, curator } = await setup();
    const V2 = await ethers.getContractFactory("MiniAppRegistryUpgradeMock");
    const upgraded = await upgrades.upgradeProxy(await registry.getAddress(), V2.connect(admin), {
      kind: "uups",
      unsafeAllow: ["missing-initializer"],
    });

    // The pending update promotes normally after the upgrade — curation is uninterrupted.
    await upgraded.connect(curator).approveApp(1);
    const app = await upgraded.getApp(1);
    expect(app.status).to.equal(Status.Approved);
    expect(app.approved.cid).to.equal(CID_B);
    expect(app.proposed.cid).to.equal("");
  });

  it("rejects upgrade attempts from non-UPGRADER accounts", async function () {
    const { registry, outsider } = await setup();
    const V2 = await ethers.getContractFactory("MiniAppRegistryUpgradeMock", outsider);
    await expect(
      upgrades.upgradeProxy(await registry.getAddress(), V2, {
        kind: "uups",
        unsafeAllow: ["missing-initializer"],
      })
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    expect(await registry.hasRole(UPGRADER_ROLE, outsider.address)).to.equal(false);
  });

  it("rejects re-initialization of the proxy", async function () {
    const { registry, admin } = await setup();
    await expect(registry.initialize(...INIT_ARGS(admin.address))).to.be.revertedWithCustomError(
      registry,
      "InvalidInitialization"
    );
  });

  it("locks initialization of the bare implementation", async function () {
    const [admin] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("MiniAppRegistry");
    const impl = await Registry.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize(...INIT_ARGS(admin.address))).to.be.revertedWithCustomError(
      impl,
      "InvalidInitialization"
    );
  });
});
