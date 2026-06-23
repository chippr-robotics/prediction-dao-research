const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unit tests for the role-based OpenERC721V2 (spec 028 expansion, US6/US7/US9/US11):
// roles, mint(to,uri), batch mint, pause, freeze, sanctions, ownership, template lockout.

const ZERO = ethers.ZeroAddress;
const role = (n) => ethers.keccak256(ethers.toUtf8Bytes(n));
const MINTER = role("MINTER_ROLE");

async function deploy721(initArgs) {
  const Impl = await ethers.getContractFactory("OpenERC721V2");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const data = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), data);
  await proxy.waitForDeployment();
  return { token: Impl.attach(await proxy.getAddress()), impl };
}

describe("OpenERC721V2 (role-based collection)", function () {
  let owner, alice, bob;
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
  });

  it("owner holds roles; MINTER mints with per-token URI; non-minter rejected", async function () {
    const { token } = await deploy721(["Art", "ART", "ipfs://base", owner.address, ZERO]);
    expect(await token.hasRole(MINTER, owner.address)).to.equal(true);
    await token.connect(owner).mint(alice.address, "ipfs://one");
    expect(await token.ownerOf(0)).to.equal(alice.address);
    expect(await token.tokenURI(0)).to.equal("ipfs://one");
    await expect(token.connect(alice).mint(alice.address, "x"))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("batchMint distributes and enforces bounds", async function () {
    const { token } = await deploy721(["Art", "ART", "", owner.address, ZERO]);
    await token.connect(owner).batchMint([alice.address, bob.address], ["a", "b"]);
    expect(await token.ownerOf(0)).to.equal(alice.address);
    expect(await token.ownerOf(1)).to.equal(bob.address);
    await expect(token.connect(owner).batchMint([alice.address], ["a", "b"]))
      .to.be.revertedWithCustomError(token, "LengthMismatch");
  });

  it("pause blocks transfers; freeze blocks the frozen side", async function () {
    const { token } = await deploy721(["Art", "ART", "", owner.address, ZERO]);
    await token.connect(owner).mint(alice.address, "u");
    await token.connect(owner).pause();
    await expect(token.connect(alice).transferFrom(alice.address, bob.address, 0))
      .to.be.revertedWithCustomError(token, "EnforcedPause");
    await token.connect(owner).unpause();
    await token.connect(owner).setFrozen(alice.address, true);
    await expect(token.connect(alice).transferFrom(alice.address, bob.address, 0))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(3);
  });

  it("non-bypassable sanctions block transfers", async function () {
    const Oracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(owner.address, await oracle.getAddress());
    await guard.waitForDeployment();
    const { token } = await deploy721(["S", "S", "", owner.address, await guard.getAddress()]);
    await token.connect(owner).mint(alice.address, "u");
    await guard.connect(owner).setDenied(bob.address, true, "test");
    await expect(token.connect(alice).transferFrom(alice.address, bob.address, 0))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(4);
  });

  it("ownership transfer/renounce + bare-impl lockout", async function () {
    const { token } = await deploy721(["Art", "ART", "", owner.address, ZERO]);
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();
    await token.connect(owner).transferOwnership(alice.address);
    expect(await token.hasRole(ADMIN, alice.address)).to.equal(true);
    expect(await token.hasRole(ADMIN, owner.address)).to.equal(false);

    const Impl = await ethers.getContractFactory("OpenERC721V2");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize("X", "X", "", owner.address, ZERO))
      .to.be.revertedWithCustomError(impl, "InvalidInitialization");
  });
});
