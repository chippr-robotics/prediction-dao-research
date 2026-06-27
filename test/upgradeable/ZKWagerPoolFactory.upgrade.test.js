const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { deployPoolFactory, deployToken, defaultParams, createPool } = require('../helpers/zkpool');

// T016 [US1] — ZKWagerPoolFactory upgrade safety: UUPS upgrade is gated by UPGRADER_ROLE, the
// implementation is storage-layout compatible, and registry state survives the upgrade (spec 034;
// constitution upgradeable-contracts rules).

describe('ZKWagerPoolFactory — upgrade', function () {
  let admin, creator;

  beforeEach(async function () {
    [admin, creator] = await ethers.getSigners();
  });

  it('upgrades in place (layout-compatible) and preserves the registry', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    const token = await deployToken();
    const { pool, poolId } = await createPool(factory, creator, await defaultParams(token));
    expect(await factory.poolCount()).to.equal(1n);

    const V2 = await ethers.getContractFactory('ZKWagerPoolFactoryV2Mock');
    const upgraded = await upgrades.upgradeProxy(await factory.getAddress(), V2, {
      unsafeAllow: ['missing-initializer'],
    });

    expect(await upgraded.version()).to.equal(2n);
    expect(await upgraded.poolCount()).to.equal(1n);
    expect(await upgraded.poolById(poolId)).to.equal(await pool.getAddress());
  });

  it('blocks an upgrade from a non-UPGRADER account', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    const V2 = await ethers.getContractFactory('ZKWagerPoolFactoryV2Mock', creator);
    const v2impl = await V2.deploy();
    await v2impl.waitForDeployment();
    await expect(
      factory.connect(creator).upgradeToAndCall(await v2impl.getAddress(), '0x')
    ).to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
  });
});
