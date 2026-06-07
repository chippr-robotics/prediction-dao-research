const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Unit tests for SanctionsGuard (Spec 007 — FR-016/FR-019/FR-020/FR-054, SC-018).
describe("SanctionsGuard", function () {
  async function deployFixture() {
    const [admin, user, sanctioned, denied, nonAdmin] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await Mock.deploy();
    await oracle.waitForDeployment();

    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(admin.address, await oracle.getAddress());
    await guard.waitForDeployment();

    return { guard, oracle, admin, user, sanctioned, denied, nonAdmin };
  }

  describe("isAllowed truth table", function () {
    it("allows a clean address", async function () {
      const { guard, user } = await loadFixture(deployFixture);
      expect(await guard.isAllowed(user.address)).to.equal(true);
    });

    it("blocks an oracle-sanctioned address", async function () {
      const { guard, oracle, sanctioned } = await loadFixture(deployFixture);
      await oracle.setSanctioned(sanctioned.address, true);
      expect(await guard.isAllowed(sanctioned.address)).to.equal(false);
    });

    it("blocks a discretionary deny-listed address", async function () {
      const { guard, admin, denied } = await loadFixture(deployFixture);
      await guard.connect(admin).setDenied(denied.address, true, "illicit finance");
      expect(await guard.isDenied(denied.address)).to.equal(true);
      expect(await guard.isAllowed(denied.address)).to.equal(false);
    });

    it("blocks when both deny-listed and oracle-sanctioned", async function () {
      const { guard, oracle, admin, denied } = await loadFixture(deployFixture);
      await oracle.setSanctioned(denied.address, true);
      await guard.connect(admin).setDenied(denied.address, true, "both");
      expect(await guard.isAllowed(denied.address)).to.equal(false);
    });

    it("allows again after a deny-list entry is removed", async function () {
      const { guard, admin, denied } = await loadFixture(deployFixture);
      await guard.connect(admin).setDenied(denied.address, true, "x");
      await guard.connect(admin).setDenied(denied.address, false, "cleared");
      expect(await guard.isAllowed(denied.address)).to.equal(true);
    });
  });

  describe("checkBlocked", function () {
    it("does not revert for an allowed address", async function () {
      const { guard, user } = await loadFixture(deployFixture);
      await expect(guard.checkBlocked(user.address)).to.not.be.reverted;
    });

    it("reverts SanctionedAddress for a blocked address", async function () {
      const { guard, oracle, sanctioned } = await loadFixture(deployFixture);
      await oracle.setSanctioned(sanctioned.address, true);
      await expect(guard.checkBlocked(sanctioned.address))
        .to.be.revertedWithCustomError(guard, "SanctionedAddress")
        .withArgs(sanctioned.address);
    });
  });

  describe("fail-closed behavior (FR-019)", function () {
    it("blocks everyone when the configured oracle has no code (EOA)", async function () {
      const { guard, admin, user, nonAdmin } = await loadFixture(deployFixture);
      // Point the oracle at an EOA (no bytecode): staticcall returns empty -> fail-closed
      await guard.connect(admin).setSanctionsOracle(nonAdmin.address);
      expect(await guard.isAllowed(user.address)).to.equal(false);
      await expect(guard.checkBlocked(user.address)).to.be.revertedWithCustomError(
        guard,
        "SanctionedAddress"
      );
    });

    it("treats an unset oracle (address(0)) as deny-list-only", async function () {
      const { guard, admin, user, denied } = await loadFixture(deployFixture);
      await guard.connect(admin).setSanctionsOracle(ethers.ZeroAddress);
      expect(await guard.sanctionsOracle()).to.equal(ethers.ZeroAddress);
      expect(await guard.isAllowed(user.address)).to.equal(true); // no oracle opinion
      await guard.connect(admin).setDenied(denied.address, true, "manual");
      expect(await guard.isAllowed(denied.address)).to.equal(false); // deny-list still enforced
    });
  });

  describe("access control & events (SC-018)", function () {
    it("only SANCTIONS_ADMIN_ROLE can setDenied", async function () {
      const { guard, nonAdmin, denied } = await loadFixture(deployFixture);
      await expect(
        guard.connect(nonAdmin).setDenied(denied.address, true, "x")
      ).to.be.revertedWithCustomError(guard, "AccessControlUnauthorizedAccount");
    });

    it("only DEFAULT_ADMIN_ROLE can setSanctionsOracle", async function () {
      const { guard, nonAdmin } = await loadFixture(deployFixture);
      await expect(
        guard.connect(nonAdmin).setSanctionsOracle(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(guard, "AccessControlUnauthorizedAccount");
    });

    it("rejects deny-listing the zero address", async function () {
      const { guard, admin } = await loadFixture(deployFixture);
      await expect(
        guard.connect(admin).setDenied(ethers.ZeroAddress, true, "x")
      ).to.be.revertedWithCustomError(guard, "ZeroAddress");
    });

    it("emits DenyListUpdated with actor and reason", async function () {
      const { guard, admin, denied } = await loadFixture(deployFixture);
      await expect(guard.connect(admin).setDenied(denied.address, true, "ofac match"))
        .to.emit(guard, "DenyListUpdated")
        .withArgs(denied.address, true, admin.address, "ofac match");
    });

    it("emits SanctionsOracleUpdated", async function () {
      const { guard, admin } = await loadFixture(deployFixture);
      await expect(guard.connect(admin).setSanctionsOracle(ethers.ZeroAddress))
        .to.emit(guard, "SanctionsOracleUpdated")
        .withArgs(ethers.ZeroAddress);
    });
  });
});
