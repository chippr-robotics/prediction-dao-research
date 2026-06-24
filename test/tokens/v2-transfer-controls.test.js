const { expect } = require("chai");
const { ethers } = require("hardhat");

// Phase 10 (P2-b, US7): transfer controls on the role-based v2 templates — pause (PAUSER), freeze + frozen list
// (DEFAULT_ADMIN for open / COMPLIANCE for restricted), and the toggleable eligibility rule (FR-034). Covers
// both authorized and unauthorized paths.

const ZERO = ethers.ZeroAddress;
const tok = (n) => ethers.parseUnits(String(n), 18);

async function deployViaProxy(name, args) {
  const Impl = await ethers.getContractFactory(name);
  const impl = await Impl.deploy();
  await impl.waitForDeployment();
  const fn = name === "RestrictedERC20V2" ? "initializeRestricted" : "initialize";
  const data = Impl.interface.encodeFunctionData(fn, args);
  const Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await Proxy.deploy(await impl.getAddress(), data);
  await proxy.waitForDeployment();
  return Impl.attach(await proxy.getAddress());
}

describe("v2 transfer controls (P2-b)", function () {
  let owner, alice, bob;
  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
  });

  describe("OpenERC20V2", function () {
    let token;
    beforeEach(async function () {
      token = await deployViaProxy("OpenERC20V2", ["A", "A", 18, tok(100), 0, owner.address, ZERO]);
    });

    it("pause is PAUSER-gated; unauthorized rejected", async function () {
      await expect(token.connect(alice).pause()).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await token.connect(owner).pause();
      await expect(token.connect(owner).transfer(alice.address, tok(1)))
        .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(6); // PAUSED
      await token.connect(owner).unpause();
      await token.connect(owner).transfer(alice.address, tok(1));
      expect(await token.balanceOf(alice.address)).to.equal(tok(1));
    });

    it("freeze is admin-gated; frozen list enumerates; balance cannot move", async function () {
      await expect(token.connect(alice).setFrozen(bob.address, true))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await token.connect(owner).transfer(alice.address, tok(10));
      await token.connect(owner).setFrozen(alice.address, true);
      expect(await token.frozenCount()).to.equal(1n);
      expect(await token.frozenAt(0)).to.equal(alice.address);
      await expect(token.connect(alice).transfer(bob.address, tok(1)))
        .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(3);
      await token.connect(owner).setFrozen(alice.address, false);
      expect(await token.frozenCount()).to.equal(0n);
      await token.connect(alice).transfer(bob.address, tok(1));
    });
  });

  describe("OpenERC721V2", function () {
    it("pause + freeze gate transfers", async function () {
      const token = await deployViaProxy("OpenERC721V2", ["Art", "ART", "", owner.address, ZERO]);
      await token.connect(owner).mint(alice.address, "u");
      await token.connect(owner).pause();
      await expect(token.connect(alice).transferFrom(alice.address, bob.address, 0))
        .to.be.revertedWithCustomError(token, "EnforcedPause");
      await token.connect(owner).unpause();
      await token.connect(owner).setFrozen(alice.address, true);
      expect(await token.frozenCount()).to.equal(1n);
      await expect(token.connect(alice).transferFrom(alice.address, bob.address, 0))
        .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(3);
    });
  });

  describe("RestrictedERC20V2", function () {
    let token;
    beforeEach(async function () {
      token = await deployViaProxy("RestrictedERC20V2", ["R", "R", 18, tok(100), 0, owner.address, ZERO, [alice.address]]);
    });

    it("freeze is COMPLIANCE-gated and reflected in the detector", async function () {
      await expect(token.connect(alice).setFrozen(alice.address, true))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await token.connect(owner).transfer(alice.address, tok(10));
      await token.connect(owner).setFrozen(alice.address, true);
      expect(await token.detectTransferRestriction(alice.address, owner.address, tok(1))).to.equal(3);
      await expect(token.connect(alice).transfer(owner.address, tok(1)))
        .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(3);
    });

    it("toggleable eligibility rule (FR-034): off → allowlist not enforced; sanctions/freeze still apply", async function () {
      // bob not eligible → blocked while enforced
      expect(await token.detectTransferRestriction(owner.address, bob.address, tok(1))).to.equal(2);
      await expect(token.connect(alice).setEligibilityEnforced(false))
        .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await token.connect(owner).setEligibilityEnforced(false);
      // now bob (not on allowlist) can receive
      expect(await token.detectTransferRestriction(owner.address, bob.address, tok(1))).to.equal(0);
      await token.connect(owner).transfer(bob.address, tok(2));
      expect(await token.balanceOf(bob.address)).to.equal(tok(2));
      // freeze still enforced even with eligibility off
      await token.connect(owner).setFrozen(bob.address, true);
      expect(await token.detectTransferRestriction(bob.address, owner.address, tok(1))).to.equal(3);
      await token.connect(owner).setFrozen(bob.address, false);
      // re-enable allowlist enforcement → bob (not on allowlist) blocked on eligibility again
      await token.connect(owner).setEligibilityEnforced(true);
      expect(await token.detectTransferRestriction(owner.address, bob.address, tok(1))).to.equal(2);
    });
  });
});
