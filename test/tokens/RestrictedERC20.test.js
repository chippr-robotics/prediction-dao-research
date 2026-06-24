const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unit tests for the RestrictedERC20 (ERC-1404) clone template (spec 028, User Story 3):
// detector/transfer parity for every code, human-readable messages, sanctions dominance, owner-only policy admin.

async function deployRestricted(initArgs) {
  const Impl = await ethers.getContractFactory("RestrictedERC20");
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const initData = Impl.interface.encodeFunctionData("initialize", initArgs);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), initData);
  await proxy.waitForDeployment();
  return Impl.attach(await proxy.getAddress());
}

const ZERO = ethers.ZeroAddress;
const tok = (n) => ethers.parseUnits(String(n), 18);
const CODE = { SUCCESS: 0, SENDER_NOT_ELIGIBLE: 1, RECIPIENT_NOT_ELIGIBLE: 2, SENDER_FROZEN: 3, SANCTIONED: 4 };

describe("RestrictedERC20 (ERC-1404 template)", function () {
  let owner, alice, bob;

  async function withGuard() {
    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(owner.address, await oracle.getAddress());
    await guard.waitForDeployment();
    return guard;
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
  });

  it("owner + initialEligible are eligible; initial supply minted to owner", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(1000), owner.address, ZERO, [alice.address]]);
    expect(await t.eligible(owner.address)).to.equal(true);
    expect(await t.eligible(alice.address)).to.equal(true);
    expect(await t.eligible(bob.address)).to.equal(false);
    expect(await t.balanceOf(owner.address)).to.equal(tok(1000));
  });

  it("messageForTransferRestriction maps every code", async function () {
    const t = await deployRestricted(["R", "R", 18, 0, owner.address, ZERO, []]);
    expect(await t.messageForTransferRestriction(CODE.SUCCESS)).to.equal("No restriction");
    expect(await t.messageForTransferRestriction(CODE.SENDER_NOT_ELIGIBLE)).to.contain("Sender");
    expect(await t.messageForTransferRestriction(CODE.RECIPIENT_NOT_ELIGIBLE)).to.contain("Recipient");
    expect(await t.messageForTransferRestriction(CODE.SENDER_FROZEN)).to.contain("frozen");
    expect(await t.messageForTransferRestriction(CODE.SANCTIONED)).to.contain("sanctioned");
  });

  // Parity: detectTransferRestriction MUST equal the actual transfer outcome in every case (SC-003).
  it("detector/transfer parity: RECIPIENT_NOT_ELIGIBLE", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, ZERO, []]);
    expect(await t.detectTransferRestriction(owner.address, bob.address, tok(1))).to.equal(CODE.RECIPIENT_NOT_ELIGIBLE);
    await expect(t.connect(owner).transfer(bob.address, tok(1)))
      .to.be.revertedWithCustomError(t, "TransferRestricted").withArgs(CODE.RECIPIENT_NOT_ELIGIBLE);
  });

  it("detector/transfer parity: SENDER_NOT_ELIGIBLE", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, ZERO, [alice.address]]);
    await t.connect(owner).transfer(alice.address, tok(10)); // alice eligible, gets funds
    await t.connect(owner).setEligible(alice.address, false); // now ineligible as sender
    expect(await t.detectTransferRestriction(alice.address, owner.address, tok(1))).to.equal(CODE.SENDER_NOT_ELIGIBLE);
    await expect(t.connect(alice).transfer(owner.address, tok(1)))
      .to.be.revertedWithCustomError(t, "TransferRestricted").withArgs(CODE.SENDER_NOT_ELIGIBLE);
  });

  it("detector/transfer parity: SENDER_FROZEN (more restrictive than eligibility)", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, ZERO, [alice.address]]);
    await t.connect(owner).transfer(alice.address, tok(10));
    await t.connect(owner).setFrozen(alice.address, true);
    expect(await t.detectTransferRestriction(alice.address, owner.address, tok(1))).to.equal(CODE.SENDER_FROZEN);
    await expect(t.connect(alice).transfer(owner.address, tok(1)))
      .to.be.revertedWithCustomError(t, "TransferRestricted").withArgs(CODE.SENDER_FROZEN);
  });

  it("detector/transfer parity: SUCCESS between two eligible parties", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, ZERO, [alice.address]]);
    expect(await t.detectTransferRestriction(owner.address, alice.address, tok(1))).to.equal(CODE.SUCCESS);
    await t.connect(owner).transfer(alice.address, tok(7));
    expect(await t.balanceOf(alice.address)).to.equal(tok(7));
  });

  it("sanctions dominates eligibility: SANCTIONED even when eligible (FR-021)", async function () {
    const guard = await withGuard();
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, await guard.getAddress(), [alice.address]]);
    await guard.connect(owner).setDenied(alice.address, true, "test");
    // alice is eligible but sanctioned → SANCTIONED wins (evaluated first).
    expect(await t.detectTransferRestriction(owner.address, alice.address, tok(1))).to.equal(CODE.SANCTIONED);
    await expect(t.connect(owner).transfer(alice.address, tok(1)))
      .to.be.revertedWithCustomError(t, "TransferRestricted").withArgs(CODE.SANCTIONED);
  });

  it("policy admin (setEligible/setFrozen/mint) is owner-only", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, ZERO, []]);
    await expect(t.connect(alice).setEligible(bob.address, true))
      .to.be.revertedWithCustomError(t, "OwnableUnauthorizedAccount");
    await expect(t.connect(alice).setFrozen(bob.address, true))
      .to.be.revertedWithCustomError(t, "OwnableUnauthorizedAccount");
    await expect(t.connect(alice).mint(alice.address, tok(1)))
      .to.be.revertedWithCustomError(t, "OwnableUnauthorizedAccount");
  });

  it("mint to an ineligible recipient is blocked by the same policy", async function () {
    const t = await deployRestricted(["R", "R", 18, 0, owner.address, ZERO, []]);
    await expect(t.connect(owner).mint(bob.address, tok(1)))
      .to.be.revertedWithCustomError(t, "TransferRestricted").withArgs(CODE.RECIPIENT_NOT_ELIGIBLE);
    await t.connect(owner).setEligible(bob.address, true);
    await t.connect(owner).mint(bob.address, tok(1));
    expect(await t.balanceOf(bob.address)).to.equal(tok(1));
  });

  it("setEligibleBatch marks many addresses at once", async function () {
    const t = await deployRestricted(["R", "R", 18, tok(100), owner.address, ZERO, []]);
    await t.connect(owner).setEligibleBatch([alice.address, bob.address], true);
    expect(await t.eligible(alice.address)).to.equal(true);
    expect(await t.eligible(bob.address)).to.equal(true);
  });
});
