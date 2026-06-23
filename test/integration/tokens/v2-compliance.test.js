const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenFactoryV2 } = require("../../helpers/proxy");

// Integration (Phase 10, P2-b, US8): a restricted v2 token created via the factory exercises the full
// compliance lifecycle — allowlist add/batch/revoke, default message, sanctions dominance, and the toggleable
// eligibility rule — against real on-chain state.

const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));
const CODE = { SUCCESS: 0, RECIPIENT_NOT_ELIGIBLE: 2, SANCTIONED: 4 };

describe("v2 compliance lifecycle (integration)", function () {
  let admin, issuer, alice, bob, carol, guard, factory, token;

  beforeEach(async function () {
    [admin, issuer, alice, bob, carol] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    guard = await Guard.deploy(admin.address, await oracle.getAddress());
    await guard.waitForDeployment();
    this.oracle = oracle;

    ({ factory } = await deployTokenFactoryV2({ adminSigner: admin, sanctionsGuard: await guard.getAddress() }));
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
    await factory.connect(issuer).createRestrictedERC20V2("Reg", "REG", 18, tok(1000), 0, "u", []);
    const rec = await factory.getToken(1);
    token = await ethers.getContractAt("RestrictedERC20V2", rec.tokenAddress);
  });

  it("allowlist add → eligible transfer; revoke → blocked with matching reason", async function () {
    expect(await token.detectTransferRestriction(issuer.address, alice.address, tok(1))).to.equal(CODE.RECIPIENT_NOT_ELIGIBLE);
    await token.connect(issuer).setEligible(alice.address, true);
    await token.connect(issuer).transfer(alice.address, tok(10));
    expect(await token.balanceOf(alice.address)).to.equal(tok(10));

    await token.connect(issuer).setEligible(alice.address, false);
    expect(await token.detectTransferRestriction(issuer.address, alice.address, tok(1))).to.equal(CODE.RECIPIENT_NOT_ELIGIBLE);
    const msg = await token.messageForTransferRestriction(CODE.RECIPIENT_NOT_ELIGIBLE);
    expect(msg).to.contain("Recipient");
  });

  it("batch allowlist + settable default message", async function () {
    await token.connect(issuer).setEligibleBatch([alice.address, bob.address, carol.address], true);
    expect(await token.eligible(bob.address)).to.equal(true);
    await token.connect(issuer).transfer(bob.address, tok(5));
    expect(await token.balanceOf(bob.address)).to.equal(tok(5));
    await token.connect(issuer).setDefaultRestrictionMessage("KYC required");
    expect(await token.defaultRestrictionMessage()).to.equal("KYC required");
  });

  it("sanctions dominate eligibility (non-bypassable)", async function () {
    await token.connect(issuer).setEligible(alice.address, true);
    await this.oracle.setSanctioned(alice.address, true);
    expect(await token.detectTransferRestriction(issuer.address, alice.address, tok(1))).to.equal(CODE.SANCTIONED);
    await expect(token.connect(issuer).transfer(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(CODE.SANCTIONED);
  });

  it("eligibility-enforced toggle (FR-034) opens/closes the allowlist gate", async function () {
    expect(await token.detectTransferRestriction(issuer.address, carol.address, tok(1))).to.equal(CODE.RECIPIENT_NOT_ELIGIBLE);
    await token.connect(issuer).setEligibilityEnforced(false);
    await token.connect(issuer).transfer(carol.address, tok(3)); // carol not on allowlist, now allowed
    expect(await token.balanceOf(carol.address)).to.equal(tok(3));
    await token.connect(issuer).setEligibilityEnforced(true);
    expect(await token.detectTransferRestriction(issuer.address, carol.address, tok(1))).to.equal(CODE.RECIPIENT_NOT_ELIGIBLE);
  });
});
