const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unit tests for the OpenERC20 clone template (spec 028, User Stories 1 & 2):
// variant init/mint/options + template re-init lockout + non-bypassable sanctions screen.
// The template is exercised through an ERC1967 proxy (delegatecall), which is behaviorally identical to the
// EIP-1167 clone the factory deploys, but lets the unit tests drive the template in isolation.

async function deployOpen20(initArgs) {
  const Impl = await ethers.getContractFactory("OpenERC20");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  return { token: Impl.attach(await proxy.getAddress()), impl };
}

const ZERO = ethers.ZeroAddress;
const tok = (n) => ethers.parseUnits(String(n), 18);

describe("OpenERC20 (clone template)", function () {
  let owner, alice, bob;
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
  });

  it("basic variant: initializes once, mints initial supply to owner, exposes metadata", async function () {
    const { token } = await deployOpen20(["Acme", "ACME", 18, tok(1000), owner.address, ZERO, false, false]);
    expect(await token.name()).to.equal("Acme");
    expect(await token.symbol()).to.equal("ACME");
    expect(await token.decimals()).to.equal(18);
    expect(await token.totalSupply()).to.equal(tok(1000));
    expect(await token.balanceOf(owner.address)).to.equal(tok(1000));
    expect(await token.owner()).to.equal(owner.address);
    expect(await token.burnable()).to.equal(false);
    expect(await token.pausable()).to.equal(false);
  });

  it("a clone cannot be re-initialized", async function () {
    const { token } = await deployOpen20(["Acme", "ACME", 18, 0, owner.address, ZERO, false, false]);
    await expect(
      token.initialize("X", "X", 18, 0, owner.address, ZERO, false, false)
    ).to.be.revertedWithCustomError(token, "InvalidInitialization");
  });

  it("the bare implementation cannot be initialized (hijack lockout)", async function () {
    const Impl = await ethers.getContractFactory("OpenERC20");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
    await expect(
      impl.initialize("X", "X", 18, 0, owner.address, ZERO, false, false)
    ).to.be.revertedWithCustomError(impl, "InvalidInitialization");
  });

  it("owner can mint; non-owner cannot (FR-016/FR-019)", async function () {
    const { token } = await deployOpen20(["Acme", "ACME", 18, 0, owner.address, ZERO, false, false]);
    await token.connect(owner).mint(alice.address, tok(50));
    expect(await token.balanceOf(alice.address)).to.equal(tok(50));
    await expect(token.connect(alice).mint(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("respects exactly the chosen options: burn only when burnable (FR-003)", async function () {
    const off = await deployOpen20(["A", "A", 18, tok(10), owner.address, ZERO, false, false]);
    await expect(off.token.connect(owner).burn(tok(1))).to.be.revertedWithCustomError(off.token, "BurnableDisabled");

    const on = await deployOpen20(["B", "B", 18, tok(10), owner.address, ZERO, true, false]);
    await on.token.connect(owner).burn(tok(4));
    expect(await on.token.totalSupply()).to.equal(tok(6));
  });

  it("respects exactly the chosen options: pause only when pausable (FR-003)", async function () {
    const off = await deployOpen20(["A", "A", 18, tok(10), owner.address, ZERO, false, false]);
    await expect(off.token.connect(owner).pause()).to.be.revertedWithCustomError(off.token, "PausableDisabled");

    const on = await deployOpen20(["B", "B", 18, tok(10), owner.address, ZERO, false, true]);
    await on.token.connect(owner).pause();
    await expect(on.token.connect(owner).transfer(alice.address, tok(1)))
      .to.be.revertedWithCustomError(on.token, "EnforcedPause");
    await on.token.connect(owner).unpause();
    await on.token.connect(owner).transfer(alice.address, tok(1));
    expect(await on.token.balanceOf(alice.address)).to.equal(tok(1));
  });

  it("non-owner cannot pause even when pausable", async function () {
    const { token } = await deployOpen20(["B", "B", 18, 0, owner.address, ZERO, false, true]);
    await expect(token.connect(alice).pause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("ownership transfer moves admin authority (FR-020)", async function () {
    const { token } = await deployOpen20(["B", "B", 18, 0, owner.address, ZERO, false, true]);
    await token.connect(owner).transferOwnership(alice.address);
    expect(await token.owner()).to.equal(alice.address);
    await token.connect(alice).pause(); // new owner can administer
    await expect(token.connect(owner).unpause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("non-bypassable sanctions: denied sender or recipient cannot transfer (FR-021)", async function () {
    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(owner.address, await oracle.getAddress());
    await guard.waitForDeployment();

    const { token } = await deployOpen20(["S", "S", 18, tok(100), owner.address, await guard.getAddress(), false, false]);

    // Denied recipient blocks an incoming transfer.
    await guard.connect(owner).setDenied(bob.address, true, "test");
    await expect(token.connect(owner).transfer(bob.address, tok(1)))
      .to.be.revertedWithCustomError(token, "SanctionedAddress");

    // Denied sender blocks an outgoing transfer.
    await token.connect(owner).transfer(alice.address, tok(5)); // alice clean
    await guard.connect(owner).setDenied(alice.address, true, "test");
    await expect(token.connect(alice).transfer(owner.address, tok(1)))
      .to.be.revertedWithCustomError(token, "SanctionedAddress");

    // Unsanctioned transfer succeeds.
    await guard.connect(owner).setDenied(alice.address, false, "cleared");
    await token.connect(alice).transfer(owner.address, tok(1));
    expect(await token.balanceOf(alice.address)).to.equal(tok(4));
  });
});
