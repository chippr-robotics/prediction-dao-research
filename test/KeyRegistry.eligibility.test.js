const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

// Spec 007 — US6 (FR-043): KeyRegistry.registerKeyWithEligibility dates the eligibility
// signature on-chain via EligibilityAcknowledged; existing registerKey ABI is preserved.

describe("KeyRegistry eligibility acknowledgement", function () {
  async function deployFixture() {
    const [admin, alice] = await ethers.getSigners();
    const KeyRegistry = await ethers.getContractFactory("KeyRegistry");
    const reg = await KeyRegistry.deploy();
    await reg.waitForDeployment();
    return { reg, alice };
  }

  const KEY = "0x" + "ab".repeat(32); // 32-byte public key
  const TERMS_REF = "0x" + "cd".repeat(32);

  it("registerKeyWithEligibility stores the key and emits both events", async function () {
    const { reg, alice } = await loadFixture(deployFixture);
    const tx = reg.connect(alice).registerKeyWithEligibility(KEY, TERMS_REF);
    await expect(tx).to.emit(reg, "KeyRegistered").withArgs(alice.address, KEY, anyValue);
    await expect(tx).to.emit(reg, "EligibilityAcknowledged").withArgs(alice.address, TERMS_REF, anyValue);
    expect(await reg.hasKey(alice.address)).to.equal(true);
    expect(await reg.getPublicKey(alice.address)).to.equal(KEY);
  });

  it("legacy registerKey still works and emits no EligibilityAcknowledged", async function () {
    const { reg, alice } = await loadFixture(deployFixture);
    const tx = reg.connect(alice).registerKey(KEY);
    await expect(tx).to.emit(reg, "KeyRegistered");
    await expect(tx).to.not.emit(reg, "EligibilityAcknowledged");
  });

  it("rejects a too-short key on the eligibility path (parity)", async function () {
    const { reg, alice } = await loadFixture(deployFixture);
    await expect(
      reg.connect(alice).registerKeyWithEligibility("0x1234", TERMS_REF)
    ).to.be.revertedWithCustomError(reg, "KeyTooShort");
  });
});
