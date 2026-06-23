const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenFactory } = require("../../helpers/proxy");

// Integration (spec 028, User Story 2): administer an open token created via the factory —
// owner mint, pause/unpause, capability gating, ownership transfer — against real on-chain state
// (FR-016/FR-018/FR-019/FR-020).

const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));

describe("Open token administration (integration)", function () {
  let admin, issuer, alice, factory;

  beforeEach(async function () {
    [admin, issuer, alice] = await ethers.getSigners();
    ({ factory } = await deployTokenFactory({ admin: admin.address }));
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
  });

  async function createOpen20(burnable, pausable) {
    await factory.connect(issuer).createOpenERC20("Acme", "ACME", 18, tok(100), "u", burnable, pausable);
    const rec = await factory.getToken(await factory.tokenCount());
    return ethers.getContractAt("OpenERC20", rec.tokenAddress);
  }

  it("owner mint increases balance & supply; non-owner rejected", async function () {
    const token = await createOpen20(false, false);
    await token.connect(issuer).mint(alice.address, tok(25));
    expect(await token.balanceOf(alice.address)).to.equal(tok(25));
    expect(await token.totalSupply()).to.equal(tok(125));
    await expect(token.connect(alice).mint(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("pause blocks transfers; unpause resumes (pausable token)", async function () {
    const token = await createOpen20(false, true);
    await token.connect(issuer).pause();
    await expect(token.connect(issuer).transfer(alice.address, tok(1)))
      .to.be.revertedWithCustomError(token, "EnforcedPause");
    await token.connect(issuer).unpause();
    await token.connect(issuer).transfer(alice.address, tok(1));
    expect(await token.balanceOf(alice.address)).to.equal(tok(1));
  });

  it("a non-pausable token offers no working pause control (FR-018)", async function () {
    const token = await createOpen20(false, false);
    await expect(token.connect(issuer).pause()).to.be.revertedWithCustomError(token, "PausableDisabled");
  });

  it("ownership transfer moves administrative authority (FR-020)", async function () {
    const token = await createOpen20(false, true);
    await token.connect(issuer).transferOwnership(alice.address);
    expect(await token.owner()).to.equal(alice.address);
    await token.connect(alice).pause();
    await expect(token.connect(issuer).unpause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });
});
