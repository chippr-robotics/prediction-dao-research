const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenFactory } = require("../../helpers/proxy");

// Integration (spec 028, User Story 3): create an ERC-1404 restricted token via the factory and exercise its
// policy end-to-end — eligible↔eligible succeeds, ineligible reverts with the matching reason, and the
// pre-transfer detector agrees with the actual transfer (SC-003).

const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));
const Standard = { RESTRICTED_ERC1404: 2 };
const CODE = { SUCCESS: 0, RECIPIENT_NOT_ELIGIBLE: 2 };

describe("Restricted token (integration)", function () {
  let admin, issuer, alice, bob, factory;

  beforeEach(async function () {
    [admin, issuer, alice, bob] = await ethers.getSigners();
    ({ factory } = await deployTokenFactory({ admin: admin.address }));
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
  });

  it("createRestrictedERC20 records the standard and deploys an owner-eligible token", async function () {
    await factory.connect(issuer).createRestrictedERC20("Reg", "REG", 18, tok(1000), "u", [alice.address]);
    const rec = await factory.getToken(1);
    expect(rec.standard).to.equal(Standard.RESTRICTED_ERC1404);

    const token = await ethers.getContractAt("RestrictedERC20", rec.tokenAddress);
    expect(await token.owner()).to.equal(issuer.address);
    expect(await token.eligible(issuer.address)).to.equal(true);
    expect(await token.eligible(alice.address)).to.equal(true);
    expect(await token.balanceOf(issuer.address)).to.equal(tok(1000));
  });

  it("eligible↔eligible transfer succeeds; transfer to ineligible reverts with reason; detector agrees", async function () {
    await factory.connect(issuer).createRestrictedERC20("Reg", "REG", 18, tok(1000), "u", [alice.address]);
    const rec = await factory.getToken(1);
    const token = await ethers.getContractAt("RestrictedERC20", rec.tokenAddress);

    // issuer -> alice (both eligible) succeeds, and the detector says SUCCESS first.
    expect(await token.detectTransferRestriction(issuer.address, alice.address, tok(1))).to.equal(CODE.SUCCESS);
    await token.connect(issuer).transfer(alice.address, tok(10));
    expect(await token.balanceOf(alice.address)).to.equal(tok(10));

    // issuer -> bob (ineligible) is rejected, and the detector predicts the same code.
    expect(await token.detectTransferRestriction(issuer.address, bob.address, tok(1)))
      .to.equal(CODE.RECIPIENT_NOT_ELIGIBLE);
    await expect(token.connect(issuer).transfer(bob.address, tok(1)))
      .to.be.revertedWithCustomError(token, "TransferRestricted").withArgs(CODE.RECIPIENT_NOT_ELIGIBLE);

    // After the owner marks bob eligible, the transfer goes through.
    await token.connect(issuer).setEligible(bob.address, true);
    await token.connect(issuer).transfer(bob.address, tok(2));
    expect(await token.balanceOf(bob.address)).to.equal(tok(2));
  });
});
