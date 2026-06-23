const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

// UUPS upgrade lifecycle for TokenFactory (spec 028, Phase 2):
// deploy behind a proxy → in-place upgrade preserves address AND the token registry → only UPGRADER_ROLE may
// upgrade → re-init rejected → a bare implementation cannot be initialized → a storage-incompatible impl is
// rejected by OZ validateUpgrade. Uses the hardhat-upgrades plugin so storage-layout validation runs on
// every deploy/upgrade. (Test-first against the contract's upgrade/storage commitments.)

const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));

async function setup() {
  const [admin, issuer, outsider] = await ethers.getSigners();

  const OpenERC20 = await ethers.getContractFactory("OpenERC20");
  const t20 = await OpenERC20.deploy();
  await t20.waitForDeployment();
  const OpenERC721 = await ethers.getContractFactory("OpenERC721");
  const t721 = await OpenERC721.deploy();
  await t721.waitForDeployment();
  const RestrictedERC20 = await ethers.getContractFactory("RestrictedERC20");
  const tR = await RestrictedERC20.deploy();
  await tR.waitForDeployment();

  const Factory = await ethers.getContractFactory("TokenFactory");
  const factory = await upgrades.deployProxy(
    Factory,
    [admin.address, ethers.ZeroAddress, await t20.getAddress(), await t721.getAddress(), await tR.getAddress()],
    { kind: "uups" }
  );
  await factory.waitForDeployment();
  await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);

  return { admin, issuer, outsider, factory };
}

describe("TokenFactory — UUPS upgrade lifecycle", function () {
  it("deploys behind a proxy with current logic and issuer role", async function () {
    const { factory, admin, issuer } = await setup();
    expect(await factory.hasRole(await factory.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await factory.hasRole(TOKEN_ISSUER_ROLE, issuer.address)).to.equal(true);
  });

  it("upgrades in place: address unchanged, registry preserved, new logic active", async function () {
    const { factory, issuer } = await setup();
    await (await factory.connect(issuer).createOpenERC20("Acme", "ACME", 18, tok(1000), "u", false, false)).wait();

    const addrBefore = await factory.getAddress();
    const countBefore = await factory.tokenCount();
    const recBefore = await factory.getToken(1);
    expect(countBefore).to.equal(1);

    const Mock = await ethers.getContractFactory("TokenFactoryUpgradeMock");
    const upgraded = await upgrades.upgradeProxy(addrBefore, Mock, { unsafeAllow: ["missing-initializer"] });
    await upgraded.waitForDeployment();

    expect(await upgraded.getAddress()).to.equal(addrBefore);
    expect(await upgraded.tokenCount()).to.equal(countBefore);
    const recAfter = await upgraded.getToken(1);
    expect(recAfter.tokenAddress).to.equal(recBefore.tokenAddress);
    expect(recAfter.name).to.equal("Acme");

    expect(await upgraded.upgradeProbe()).to.equal("v2");
    await (await upgraded.setUpgradeMarker(7)).wait();
    expect(await upgraded.upgradeMarker()).to.equal(7n);

    // Registry still operable post-upgrade: another create appends correctly.
    await (await upgraded.connect(issuer).createOpenERC20("Two", "TWO", 18, 0, "u", false, false)).wait();
    expect(await upgraded.tokenCount()).to.equal(2);
  });

  it("only UPGRADER_ROLE may upgrade; an outsider is refused", async function () {
    const { factory, outsider } = await setup();
    const Mock = await ethers.getContractFactory("TokenFactoryUpgradeMock");
    const newImpl = await Mock.deploy();
    await newImpl.waitForDeployment();
    const asOutsider = (await ethers.getContractFactory("TokenFactory"))
      .attach(await factory.getAddress())
      .connect(outsider);
    await expect(asOutsider.upgradeToAndCall(await newImpl.getAddress(), "0x"))
      .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
  });

  it("rejects re-initialization of the proxy", async function () {
    const { factory, admin } = await setup();
    await expect(
      factory.initialize(admin.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(factory, "InvalidInitialization");
  });

  it("a bare implementation cannot be initialized", async function () {
    const Factory = await ethers.getContractFactory("TokenFactory");
    const bareImpl = await Factory.deploy();
    await bareImpl.waitForDeployment();
    const [admin] = await ethers.getSigners();
    await expect(
      bareImpl.initialize(admin.address, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(bareImpl, "InvalidInitialization");
  });

  it("rejects a storage-incompatible upgrade (OZ validateUpgrade)", async function () {
    const { factory } = await setup();
    const Bad = await ethers.getContractFactory("TokenFactoryBadLayoutMock");
    await expect(upgrades.upgradeProxy(await factory.getAddress(), Bad, { unsafeAllow: ["missing-initializer"] }))
      .to.be.rejected;
  });
});
