const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenFactory } = require("../../helpers/proxy");

// Integration (spec 028, User Story 1): the full create path through TokenFactory with the SanctionsGuard wired
// end-to-end — happy path produces a real deployed token + exactly one registry record; unauthorized and
// sanctioned issuers are rejected with no phantom registry entry.

const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));
const Standard = { OPEN_ERC20: 0, OPEN_ERC721: 1 };

describe("Open token creation (integration)", function () {
  let admin, issuer, outsider, guard, factory;

  beforeEach(async function () {
    [admin, issuer, outsider] = await ethers.getSigners();
    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    guard = await Guard.deploy(admin.address, await oracle.getAddress());
    await guard.waitForDeployment();

    ({ factory } = await deployTokenFactory({ admin: admin.address, sanctionsGuard: await guard.getAddress() }));
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
  });

  it("createOpenERC20: real token, issuer-owned, one record, issuer list, guard injected", async function () {
    await expect(factory.connect(issuer).createOpenERC20("Acme", "ACME", 6, tok(500), "ipfs://m", true, true))
      .to.emit(factory, "TokenCreated");

    const rec = await factory.getToken(1);
    expect(rec.standard).to.equal(Standard.OPEN_ERC20);
    expect(await factory.tokenCount()).to.equal(1);
    expect(await factory.getTokensByIssuer(issuer.address)).to.deep.equal([1n]);

    const token = await ethers.getContractAt("OpenERC20", rec.tokenAddress);
    expect(await token.owner()).to.equal(issuer.address);
    expect(await token.balanceOf(issuer.address)).to.equal(tok(500));
    expect(await token.decimals()).to.equal(6);
    // Guard was injected into the issued token (sanctions are non-bypassable on transfers).
    expect(await token.sanctionsGuard()).to.equal(await guard.getAddress());
  });

  it("createOpenERC721: real collection, issuer-owned, recorded", async function () {
    await factory.connect(issuer).createOpenERC721("Art", "ART", "ipfs://base", true);
    const rec = await factory.getToken(1);
    expect(rec.standard).to.equal(Standard.OPEN_ERC721);
    const token = await ethers.getContractAt("OpenERC721", rec.tokenAddress);
    expect(await token.owner()).to.equal(issuer.address);
    expect(await token.sanctionsGuard()).to.equal(await guard.getAddress());
  });

  it("unauthorized caller cannot create (no record)", async function () {
    await expect(factory.connect(outsider).createOpenERC20("X", "X", 18, 0, "u", false, false))
      .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
    expect(await factory.tokenCount()).to.equal(0);
  });

  it("sanctioned issuer cannot create (no record)", async function () {
    await guard.connect(admin).setDenied(issuer.address, true, "test");
    await expect(factory.connect(issuer).createOpenERC20("X", "X", 18, 0, "u", false, false))
      .to.be.revertedWithCustomError(factory, "SanctionedAddress");
    expect(await factory.tokenCount()).to.equal(0);
    expect(await factory.getTokensByIssuer(issuer.address)).to.deep.equal([]);
  });
});
