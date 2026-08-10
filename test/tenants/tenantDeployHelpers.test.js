const { expect } = require("chai");
const { ethers } = require("hardhat");
const { generateSalt, activeTenantId } = require("../../scripts/deploy/lib/helpers");

/**
 * Tenant dimension of the deploy helpers (spec 072, research D5 / T013).
 *
 * TENANT_ID scopes CREATE2 salts (and deployment record paths) so a tenant
 * gets a deterministic, distinct address set. With no tenant in scope —
 * including TENANT_ID=fairwins, the default tenant — behavior is byte-identical
 * to before the tenant dimension existed.
 */
describe("tenant deploy helpers (spec 072)", function () {
  const ORIGINAL = process.env.TENANT_ID;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.TENANT_ID;
    else process.env.TENANT_ID = ORIGINAL;
  });

  it("no TENANT_ID: salts are unprefixed (default estate unchanged)", () => {
    delete process.env.TENANT_ID;
    expect(activeTenantId()).to.equal(null);
    expect(generateSalt("FairWins-v2:WagerRegistry")).to.equal(ethers.id("FairWins-v2:WagerRegistry"));
  });

  it("TENANT_ID=fairwins is the default tenant: identical to no tenant", () => {
    process.env.TENANT_ID = "fairwins";
    expect(activeTenantId()).to.equal(null);
    expect(generateSalt("FairWins-v2:WagerRegistry")).to.equal(ethers.id("FairWins-v2:WagerRegistry"));
  });

  it("a tenant in scope prefixes salts deterministically and distinctly", () => {
    process.env.TENANT_ID = "acme";
    expect(activeTenantId()).to.equal("acme");
    const acmeSalt = generateSalt("FairWins-v2:WagerRegistry");
    expect(acmeSalt).to.equal(ethers.id("tenant:acme:FairWins-v2:WagerRegistry"));
    expect(acmeSalt).to.not.equal(ethers.id("FairWins-v2:WagerRegistry"));

    process.env.TENANT_ID = "other";
    expect(generateSalt("FairWins-v2:WagerRegistry")).to.not.equal(acmeSalt);
  });

  it("rejects invalid tenant ids loudly (salts must never derive from typos)", () => {
    for (const bad of ["Acme", "a", "-acme", "acme_x", "tenant with spaces"]) {
      process.env.TENANT_ID = bad;
      expect(() => activeTenantId(), `TENANT_ID="${bad}"`).to.throw(/invalid/);
    }
  });
});
