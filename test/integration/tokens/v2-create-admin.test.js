const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenFactoryV2 } = require("../../helpers/proxy");

// Integration (spec 028 expansion, US6/US9): the factory creates role-based v2 tokens with the issuer holding
// all roles, optional caps enforced, ownership transferable; unauthorized + sanctioned issuers are rejected.

const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));
const role = (n) => ethers.keccak256(ethers.toUtf8Bytes(n));

describe("v2 token create + admin (integration)", function () {
  let admin, issuer, outsider, guard, factory;

  beforeEach(async function () {
    [admin, issuer, outsider] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    guard = await Guard.deploy(admin.address, await oracle.getAddress());
    await guard.waitForDeployment();

    ({ factory } = await deployTokenFactoryV2({ adminSigner: admin, sanctionsGuard: await guard.getAddress() }));
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
  });

  it("createOpenERC20V2: issuer holds all roles, cap enforced, guard injected", async function () {
    await expect(factory.connect(issuer).createOpenERC20V2("Acme", "ACME", 18, tok(80), tok(100), "ipfs://m"))
      .to.emit(factory, "TokenCreated");
    const rec = await factory.getToken(1);
    const token = await ethers.getContractAt("OpenERC20V2", rec.tokenAddress);
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), issuer.address)).to.equal(true);
    expect(await token.hasRole(role("MINTER_ROLE"), issuer.address)).to.equal(true);
    expect(await token.capped()).to.equal(true);
    expect(await token.balanceOf(issuer.address)).to.equal(tok(80));
    expect(await token.sanctionsGuard()).to.equal(await guard.getAddress());
    // over-cap mint rejected
    await expect(token.connect(issuer).mint(issuer.address, tok(21)))
      .to.be.revertedWithCustomError(token, "ERC20ExceededCap");
  });

  it("createRestrictedERC20V2: COMPLIANCE held by issuer, eligibility seeded", async function () {
    await factory.connect(issuer).createRestrictedERC20V2("Reg", "REG", 18, tok(10), 0, "u", [outsider.address]);
    const rec = await factory.getToken(1);
    const token = await ethers.getContractAt("RestrictedERC20V2", rec.tokenAddress);
    expect(await token.hasRole(role("COMPLIANCE_ROLE"), issuer.address)).to.equal(true);
    expect(await token.eligible(issuer.address)).to.equal(true);
    expect(await token.eligible(outsider.address)).to.equal(true);
  });

  it("createOpenERC721V2 records the standard + issuer ownership", async function () {
    await factory.connect(issuer).createOpenERC721V2("Art", "ART", "ipfs://base");
    const rec = await factory.getToken(1);
    const token = await ethers.getContractAt("OpenERC721V2", rec.tokenAddress);
    expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), issuer.address)).to.equal(true);
  });

  it("unauthorized caller and sanctioned issuer are rejected (no registry write)", async function () {
    await expect(factory.connect(outsider).createOpenERC20V2("X", "X", 18, 0, 0, "u"))
      .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
    await guard.connect(admin).setDenied(issuer.address, true, "test");
    await expect(factory.connect(issuer).createOpenERC20V2("X", "X", 18, 0, 0, "u"))
      .to.be.revertedWithCustomError(factory, "SanctionedAddress");
    expect(await factory.tokenCount()).to.equal(0);
  });

  it("reverts when a v2 template slot is unset", async function () {
    // Fresh factory without v2 slots set → v2 create reverts TemplateNotSet.
    const { deployTokenFactory } = require("../../helpers/proxy");
    const { factory: bare } = await deployTokenFactory({ admin: admin.address });
    await bare.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
    await expect(bare.connect(issuer).createOpenERC20V2("X", "X", 18, 0, 0, "u"))
      .to.be.revertedWithCustomError(bare, "TemplateNotSet");
  });
});
