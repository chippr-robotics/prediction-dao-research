const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

// Reusable upgrade base (PR #724): the primitives every upgradeable value-bearing contract inherits.
// Exercised here in isolation via a minimal harness so WagerRegistry / MembershipManager reuse it with
// confidence. (Constitution II — written test-first against the FRs in spec 025.)
describe("UUPSManaged (reusable upgrade base)", function () {
  async function deploy() {
    const [admin, outsider] = await ethers.getSigners();
    const Harness = await ethers.getContractFactory("UUPSManagedHarness");
    const proxy = await upgrades.deployProxy(Harness, [admin.address, 42], { kind: "uups" });
    await proxy.waitForDeployment();
    return { admin, outsider, Harness, proxy };
  }

  it("initializes once, granting DEFAULT_ADMIN_ROLE and UPGRADER_ROLE to admin", async function () {
    const { admin, proxy } = await deploy();
    expect(await proxy.value()).to.equal(42n);
    expect(await proxy.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.equal(true);
    expect(await proxy.hasRole(UPGRADER_ROLE, admin.address)).to.equal(true);
    expect(await proxy.version()).to.equal("v1");
  });

  it("rejects re-initialization of the proxy (initializer used once)", async function () {
    const { admin, proxy } = await deploy();
    await expect(proxy.initialize(admin.address, 1)).to.be.revertedWithCustomError(
      proxy,
      "InvalidInitialization"
    );
  });

  it("disables initializers on a bare implementation (UUPS footgun defense)", async function () {
    const { admin, Harness } = await deploy();
    const impl = await Harness.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize(admin.address, 1)).to.be.revertedWithCustomError(
      impl,
      "InvalidInitialization"
    );
  });

  it("only UPGRADER_ROLE may upgrade the implementation", async function () {
    const { outsider, Harness, proxy } = await deploy();
    const newImpl = await Harness.deploy();
    await newImpl.waitForDeployment();
    const asOutsider = Harness.attach(await proxy.getAddress()).connect(outsider);
    await expect(asOutsider.upgradeToAndCall(await newImpl.getAddress(), "0x"))
      .to.be.revertedWithCustomError(proxy, "AccessControlUnauthorizedAccount");
  });

  it("performs an append-only, state-preserving in-place upgrade", async function () {
    const { proxy } = await deploy();
    await (await proxy.setValue(7)).wait();
    const addrBefore = await proxy.getAddress();

    const HarnessV2 = await ethers.getContractFactory("UUPSManagedHarnessV2");
    // Additive subclass adds state that defaults to 0 and needs no seeding; the validator's
    // "missing-initializer" heuristic is a false positive here (the real WagerRegistry impl always
    // carries the full initialize()). Storage-layout compatibility is still fully enforced.
    const upgraded = await upgrades.upgradeProxy(addrBefore, HarnessV2, {
      unsafeAllow: ["missing-initializer"],
    });
    await upgraded.waitForDeployment();

    expect(await upgraded.getAddress()).to.equal(addrBefore); // address unchanged
    expect(await upgraded.value()).to.equal(7n); // state preserved
    expect(await upgraded.version()).to.equal("v2"); // new logic active
    await (await upgraded.setExtra(99)).wait(); // new appended state usable
    expect(await upgraded.extra()).to.equal(99n);
  });

  it("rejects a storage-incompatible (reordered) upgrade before applying it", async function () {
    const { proxy } = await deploy();
    const Bad = await ethers.getContractFactory("UUPSManagedHarnessBadLayout");
    let threw = false;
    try {
      await upgrades.upgradeProxy(await proxy.getAddress(), Bad);
    } catch (e) {
      threw = true;
      expect(e.message.toLowerCase()).to.match(/storage layout|incompatible|deleted|moved/);
    }
    expect(threw, "expected a storage-incompatible upgrade to be rejected").to.equal(true);
  });

  it("keeps the upgrade path non-brickable across upgrades", async function () {
    const { admin, proxy } = await deploy();
    const addr = await proxy.getAddress();
    const HarnessV2 = await ethers.getContractFactory("UUPSManagedHarnessV2");
    const v2 = await upgrades.upgradeProxy(addr, HarnessV2, { unsafeAllow: ["missing-initializer"] });
    await v2.waitForDeployment();
    // UPGRADER_ROLE still present and a further upgrade still authorizes.
    expect(await v2.hasRole(UPGRADER_ROLE, admin.address)).to.equal(true);
    const again = await upgrades.upgradeProxy(addr, HarnessV2, { unsafeAllow: ["missing-initializer"] });
    await again.waitForDeployment();
    expect(await again.version()).to.equal("v2");
  });
});
