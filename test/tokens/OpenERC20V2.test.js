const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unit tests for the role-based OpenERC20V2 clone template (spec 028 expansion, US6/US7/US9/US11):
// roles, optional cap, pause, freeze list, batch ops, sanctions, ownership transfer/renounce, template lockout.
// Exercised via an ERC1967 proxy (delegatecall) — behaviorally identical to the factory's EIP-1167 clone.

const ZERO = ethers.ZeroAddress;
const tok = (n) => ethers.parseUnits(String(n), 18);
const role = (n) => ethers.keccak256(ethers.toUtf8Bytes(n));
const MINTER = role("MINTER_ROLE");
const PAUSER = role("PAUSER_ROLE");
const BURNER = role("BURNER_ROLE");

async function deploy20(initArgs) {
  const Impl = await ethers.getContractFactory("OpenERC20V2");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const data = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), data);
  await proxy.waitForDeployment();
  return { token: Impl.attach(await proxy.getAddress()), impl };
}

describe("OpenERC20V2 (role-based clone template)", function () {
  let owner, alice, bob;
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
  });

  it("initializes with owner holding all roles + initial supply; uncapped when cap 0", async function () {
    const { token } = await deploy20(["Acme", "ACME", 18, tok(1000), 0, owner.address, ZERO]);
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    expect(await token.hasRole(MINTER, owner.address)).to.equal(true);
    expect(await token.hasRole(PAUSER, owner.address)).to.equal(true);
    expect(await token.hasRole(BURNER, owner.address)).to.equal(true);
    expect(await token.balanceOf(owner.address)).to.equal(tok(1000));
    expect(await token.capped()).to.equal(false);
    expect(await token.cap()).to.equal(ethers.MaxUint256);
  });

  it("enforces a supply cap; over-cap mint reverts", async function () {
    const { token } = await deploy20(["Cap", "CAP", 18, tok(80), tok(100), owner.address, ZERO]);
    expect(await token.capped()).to.equal(true);
    await token.connect(owner).mint(owner.address, tok(20)); // up to cap
    await expect(token.connect(owner).mint(owner.address, tok(1)))
      .to.be.revertedWithCustomError(token, "ERC20ExceededCap");
  });

  it("mint is MINTER-gated; non-minter rejected", async function () {
    const { token } = await deploy20(["A", "A", 18, 0, 0, owner.address, ZERO]);
    await token.connect(owner).mint(alice.address, tok(5));
    expect(await token.balanceOf(alice.address)).to.equal(tok(5));
    await expect(token.connect(alice).mint(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("pause is PAUSER-gated and blocks transfers", async function () {
    const { token } = await deploy20(["A", "A", 18, tok(10), 0, owner.address, ZERO]);
    await expect(token.connect(alice).pause()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await token.connect(owner).pause();
    // Pause is enforced through the shared policy so the detector matches (code 6 = PAUSED).
    await expect(token.connect(owner).transfer(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(6);
    await token.connect(owner).unpause();
    await token.connect(owner).transfer(alice.address, tok(1));
    expect(await token.balanceOf(alice.address)).to.equal(tok(1));
  });

  it("holder burn + BURNER adminBurn (clawback); adminBurn role-gated", async function () {
    const { token } = await deploy20(["A", "A", 18, tok(100), 0, owner.address, ZERO]);
    await token.connect(owner).transfer(alice.address, tok(30));
    await token.connect(alice).burn(tok(5)); // holder self-burn
    expect(await token.balanceOf(alice.address)).to.equal(tok(25));
    await token.connect(owner).adminBurn(alice.address, tok(5)); // BURNER clawback
    expect(await token.balanceOf(alice.address)).to.equal(tok(20));
    await expect(token.connect(bob).adminBurn(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
  });

  it("batchTransfer / batchMint distribute and enforce bounds", async function () {
    const { token } = await deploy20(["A", "A", 18, tok(1000), 0, owner.address, ZERO]);
    await token.connect(owner).batchTransfer([alice.address, bob.address], [tok(10), tok(20)]);
    expect(await token.balanceOf(alice.address)).to.equal(tok(10));
    expect(await token.balanceOf(bob.address)).to.equal(tok(20));
    await token.connect(owner).batchMint([alice.address], [tok(5)]);
    expect(await token.balanceOf(alice.address)).to.equal(tok(15));
    await expect(token.connect(owner).batchTransfer([alice.address], [tok(1), tok(2)]))
      .to.be.revertedWithCustomError(token, "LengthMismatch");
    const many = Array(201).fill(alice.address);
    const amts = Array(201).fill(tok(0));
    await expect(token.connect(owner).batchTransfer(many, amts))
      .to.be.revertedWithCustomError(token, "BatchTooLarge");
  });

  it("freeze blocks sender + recipient and is listed", async function () {
    const { token } = await deploy20(["A", "A", 18, tok(100), 0, owner.address, ZERO]);
    await token.connect(owner).transfer(alice.address, tok(10));
    await token.connect(owner).setFrozen(alice.address, true);
    expect(await token.frozen(alice.address)).to.equal(true);
    expect(await token.frozenCount()).to.equal(1n);
    expect(await token.frozenAt(0)).to.equal(alice.address);
    await expect(token.connect(alice).transfer(bob.address, tok(1)))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(3); // SENDER_FROZEN
    await expect(token.connect(owner).transfer(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(5); // RECIPIENT_FROZEN
    await token.connect(owner).setFrozen(alice.address, false);
    await token.connect(alice).transfer(bob.address, tok(1));
  });

  it("non-bypassable sanctions block transfers", async function () {
    const Oracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(owner.address, await oracle.getAddress());
    await guard.waitForDeployment();
    const { token } = await deploy20(["S", "S", 18, tok(100), 0, owner.address, await guard.getAddress()]);
    await guard.connect(owner).setDenied(bob.address, true, "test");
    await expect(token.connect(owner).transfer(bob.address, tok(1)))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(4); // SANCTIONED
  });

  it("ownership transfer moves DEFAULT_ADMIN; renounce removes admin", async function () {
    const { token } = await deploy20(["A", "A", 18, 0, 0, owner.address, ZERO]);
    const ADMIN = await token.DEFAULT_ADMIN_ROLE();
    await token.connect(owner).transferOwnership(alice.address);
    expect(await token.hasRole(ADMIN, alice.address)).to.equal(true);
    expect(await token.hasRole(ADMIN, owner.address)).to.equal(false);
    await token.connect(alice).renounceOwnership();
    expect(await token.hasRole(ADMIN, alice.address)).to.equal(false);
  });

  it("transferOwnership to self is rejected (no admin lockout)", async function () {
    const { token } = await deploy20(["A", "A", 18, 0, 0, owner.address, ZERO]);
    await expect(token.connect(owner).transferOwnership(owner.address))
      .to.be.revertedWithCustomError(token, "SelfTransfer");
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
  });

  it("bare implementation cannot be initialized", async function () {
    const Impl = await ethers.getContractFactory("OpenERC20V2");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
    await expect(impl.initialize("X", "X", 18, 0, 0, owner.address, ZERO))
      .to.be.revertedWithCustomError(impl, "InvalidInitialization");
  });
});
