const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unit tests for the OpenERC721 clone template (spec 028, User Stories 1 & 2):
// collection init, owner mint(to,uri), holder burn (burnable only), sanctions screen. Exercised through an
// ERC1967 proxy (delegatecall) — behaviorally identical to the factory's EIP-1167 clone.

async function deployOpen721(initArgs) {
  const Impl = await ethers.getContractFactory("OpenERC721");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  return { token: Impl.attach(await proxy.getAddress()), impl };
}

const ZERO = ethers.ZeroAddress;

describe("OpenERC721 (clone template)", function () {
  let owner, alice, bob;
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
  });

  it("initializes a collection once and exposes metadata", async function () {
    const { token } = await deployOpen721(["Art", "ART", "ipfs://base", owner.address, ZERO, false]);
    expect(await token.name()).to.equal("Art");
    expect(await token.symbol()).to.equal("ART");
    expect(await token.baseTokenURI()).to.equal("ipfs://base");
    expect(await token.owner()).to.equal(owner.address);
  });

  it("owner mints with per-token URI; ids auto-increment; non-owner cannot mint", async function () {
    const { token } = await deployOpen721(["Art", "ART", "", owner.address, ZERO, false]);
    await token.connect(owner).mint(alice.address, "ipfs://one");
    await token.connect(owner).mint(alice.address, "ipfs://two");
    expect(await token.ownerOf(0)).to.equal(alice.address);
    expect(await token.ownerOf(1)).to.equal(alice.address);
    expect(await token.tokenURI(0)).to.equal("ipfs://one");
    expect(await token.tokenURI(1)).to.equal("ipfs://two");
    await expect(token.connect(alice).mint(alice.address, "x"))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("holder burn only when burnable (FR-003)", async function () {
    const off = await deployOpen721(["A", "A", "", owner.address, ZERO, false]);
    await off.token.connect(owner).mint(alice.address, "u");
    await expect(off.token.connect(alice).burn(0)).to.be.revertedWithCustomError(off.token, "BurnableDisabled");

    const on = await deployOpen721(["B", "B", "", owner.address, ZERO, true]);
    await on.token.connect(owner).mint(alice.address, "u");
    await on.token.connect(alice).burn(0);
    await expect(on.token.ownerOf(0)).to.be.revertedWithCustomError(on.token, "ERC721NonexistentToken");
  });

  it("the bare implementation cannot be initialized (hijack lockout)", async function () {
    const Impl = await ethers.getContractFactory("OpenERC721");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize("X", "X", "", owner.address, ZERO, false))
      .to.be.revertedWithCustomError(impl, "InvalidInitialization");
  });

  it("non-bypassable sanctions: denied sender or recipient blocks transfer (FR-021)", async function () {
    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(owner.address, await oracle.getAddress());
    await guard.waitForDeployment();

    const { token } = await deployOpen721(["S", "S", "", owner.address, await guard.getAddress(), false]);
    await token.connect(owner).mint(alice.address, "u"); // owner+alice clean at mint

    await guard.connect(owner).setDenied(bob.address, true, "test");
    await expect(token.connect(alice).transferFrom(alice.address, bob.address, 0))
      .to.be.revertedWithCustomError(token, "SanctionedAddress");

    await guard.connect(owner).setDenied(alice.address, true, "test");
    await expect(token.connect(alice).transferFrom(alice.address, owner.address, 0))
      .to.be.revertedWithCustomError(token, "SanctionedAddress");
  });
});
