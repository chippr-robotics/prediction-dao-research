const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTokenFactory, deployTokenTemplates } = require("../helpers/proxy");

// Unit tests for TokenFactory (spec 028, Phase 2 foundational):
// role + sanctions gating on create, registry append/views, CEI (no registry write on revert),
// admin-setter authorization, metadata validation. Per-class create paths are covered in integration tests.

const ZERO = ethers.ZeroAddress;
const tok = (n) => ethers.parseUnits(String(n), 18);
const TOKEN_ISSUER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("TOKEN_ISSUER_ROLE"));
const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));
const Standard = { OPEN_ERC20: 0, OPEN_ERC721: 1, RESTRICTED_ERC1404: 2, PERMISSIONED_ERC3643: 3 };

describe("TokenFactory", function () {
  let admin, issuer, outsider;

  async function withGuard(adminSigner) {
    const MockOracle = await ethers.getContractFactory("MockSanctionsOracle");
    const oracle = await MockOracle.deploy();
    await oracle.waitForDeployment();
    const Guard = await ethers.getContractFactory("SanctionsGuard");
    const guard = await Guard.deploy(adminSigner.address, await oracle.getAddress());
    await guard.waitForDeployment();
    return guard;
  }

  beforeEach(async function () {
    [admin, issuer, outsider] = await ethers.getSigners();
  });

  it("initializes roles + templates; a fresh registry is empty (network-scoped per instance)", async function () {
    const { factory, templates } = await deployTokenFactory({ admin: admin.address });
    expect(await factory.hasRole(await factory.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await factory.hasRole(UPGRADER_ROLE, admin.address)).to.equal(true);
    expect(await factory.openERC20Impl()).to.equal(templates.openERC20Impl);
    expect(await factory.openERC721Impl()).to.equal(templates.openERC721Impl);
    expect(await factory.restrictedERC20Impl()).to.equal(templates.restrictedERC20Impl);
    expect(await factory.tokenCount()).to.equal(0);
  });

  it("rejects re-initialization", async function () {
    const { factory } = await deployTokenFactory({ admin: admin.address });
    await expect(factory.initialize(admin.address, ZERO, ZERO, ZERO, ZERO))
      .to.be.revertedWithCustomError(factory, "InvalidInitialization");
  });

  it("create is gated by TOKEN_ISSUER_ROLE", async function () {
    const { factory } = await deployTokenFactory({ admin: admin.address });
    await expect(factory.connect(outsider).createOpenERC20("A", "A", 18, tok(1), "u", false, false))
      .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
  });

  it("an authorized issuer creates a token: event, deploy, owner, single registry record + views", async function () {
    const { factory } = await deployTokenFactory({ admin: admin.address });
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);

    const tx = await factory.connect(issuer).createOpenERC20("Acme", "ACME", 18, tok(1000), "ipfs://m", true, false);
    await expect(tx).to.emit(factory, "TokenCreated");

    expect(await factory.tokenCount()).to.equal(1);
    const rec = await factory.getToken(1);
    expect(rec.id).to.equal(1);
    expect(rec.standard).to.equal(Standard.OPEN_ERC20);
    expect(rec.issuer).to.equal(issuer.address);
    expect(rec.name).to.equal("Acme");
    expect(rec.symbol).to.equal("ACME");
    expect(rec.metadataURI).to.equal("ipfs://m");
    expect(rec.isBurnable).to.equal(true);
    expect(rec.isPausable).to.equal(false);

    expect(await factory.getTokenIdByAddress(rec.tokenAddress)).to.equal(1);
    expect(await factory.getTokensByIssuer(issuer.address)).to.deep.equal([1n]);

    // The deployed token is real, issuer-owned, and holds the initial supply.
    const token = await ethers.getContractAt("OpenERC20", rec.tokenAddress);
    expect(await token.owner()).to.equal(issuer.address);
    expect(await token.balanceOf(issuer.address)).to.equal(tok(1000));
  });

  it("rejects empty name/symbol (EmptyMetadata)", async function () {
    const { factory } = await deployTokenFactory({ admin: admin.address });
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
    await expect(factory.connect(issuer).createOpenERC20("", "A", 18, 0, "u", false, false))
      .to.be.revertedWithCustomError(factory, "EmptyMetadata");
    await expect(factory.connect(issuer).createOpenERC20("A", "", 18, 0, "u", false, false))
      .to.be.revertedWithCustomError(factory, "EmptyMetadata");
  });

  it("CEI: a sanctioned issuer is rejected with NO registry write", async function () {
    const guard = await withGuard(admin);
    const { factory } = await deployTokenFactory({ admin: admin.address, sanctionsGuard: await guard.getAddress() });
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);
    await guard.connect(admin).setDenied(issuer.address, true, "test");

    await expect(factory.connect(issuer).createOpenERC20("A", "A", 18, tok(1), "u", false, false))
      .to.be.revertedWithCustomError(factory, "SanctionedAddress");
    expect(await factory.tokenCount()).to.equal(0);
    expect(await factory.getTokensByIssuer(issuer.address)).to.deep.equal([]);
  });

  it("reverts TemplateNotSet when a class template is unset", async function () {
    // Deploy a factory whose ERC-721 template is the zero address (others valid).
    const templates = await deployTokenTemplates();
    const Impl = await ethers.getContractFactory("TokenFactory");
    const impl = await Impl.deploy();
    await impl.waitForDeployment();
    const initData = Impl.interface.encodeFunctionData("initialize", [
      admin.address, ZERO, templates.openERC20Impl, ZERO, templates.restrictedERC20Impl,
    ]);
    const Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await Proxy.deploy(await impl.getAddress(), initData);
    await proxy.waitForDeployment();
    const factory = Impl.attach(await proxy.getAddress());
    await factory.connect(admin).grantRole(TOKEN_ISSUER_ROLE, issuer.address);

    await expect(factory.connect(issuer).createOpenERC721("A", "A", "u", false))
      .to.be.revertedWithCustomError(factory, "TemplateNotSet");
  });

  it("admin setters are DEFAULT_ADMIN_ROLE-only", async function () {
    const { factory, templates } = await deployTokenFactory({ admin: admin.address });
    await expect(factory.connect(outsider).setSanctionsGuard(outsider.address))
      .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");
    await expect(factory.connect(outsider).setTemplate(Standard.OPEN_ERC20, templates.openERC20Impl))
      .to.be.revertedWithCustomError(factory, "AccessControlUnauthorizedAccount");

    // Admin can update a template and it takes effect.
    await expect(factory.connect(admin).setTemplate(Standard.OPEN_ERC20, templates.restrictedERC20Impl))
      .to.emit(factory, "TemplateUpdated");
    expect(await factory.openERC20Impl()).to.equal(templates.restrictedERC20Impl);

    // setTemplate rejects the deferred ERC-3643 class (no clone template).
    await expect(factory.connect(admin).setTemplate(Standard.PERMISSIONED_ERC3643, templates.openERC20Impl))
      .to.be.revertedWithCustomError(factory, "TemplateNotSet");
  });

  it("setSanctionsGuard updates screening and emits", async function () {
    const guard = await withGuard(admin);
    const { factory } = await deployTokenFactory({ admin: admin.address });
    await expect(factory.connect(admin).setSanctionsGuard(await guard.getAddress()))
      .to.emit(factory, "SanctionsGuardUpdated").withArgs(await guard.getAddress());
    expect(await factory.sanctionsGuard()).to.equal(await guard.getAddress());
  });
});
