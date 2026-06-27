const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoolFactory, deployToken, defaultParams, createPool, ZERO } = require('../helpers/zkpool');

// T012 [US1] — ZKWagerPoolFactory: create + creator screening, sanctions-guard-required revert,
// phrase uniqueness/collision, clone+registry, PoolCreated, param validation (spec 034 FR-001..008,
// FR-002a, FR-003, FR-021).

describe('ZKWagerPoolFactory', function () {
  let admin, creator, other;

  beforeEach(async function () {
    [admin, creator, other] = await ethers.getSigners();
  });

  it('initializes and exposes an empty, network-scoped registry', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    expect(await factory.hasRole(await factory.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await factory.poolCount()).to.equal(0);
    expect(await factory.poolImpl()).to.not.equal(ZERO);
  });

  it('rejects re-initialization', async function () {
    const { factory, poolImpl, semaphore } = await deployPoolFactory({ admin: admin.address });
    await expect(
      factory.initialize(
        admin.address,
        await poolImpl.getAddress(),
        await semaphore.getAddress(),
        ZERO,
        ZERO,
        false
      )
    ).to.be.revertedWithCustomError(factory, 'InvalidInitialization');
  });

  it('reverts deployment when screening is required but guards are unset (FR-021a)', async function () {
    await expect(deployPoolFactory({ admin: admin.address, screeningRequired: true })).to.be.reverted;
  });

  it('creates a pool: emits PoolCreated, clones a pool, records it, resolves by phrase', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    const token = await deployToken();
    const params = await defaultParams(token);

    const tx = await factory.connect(creator).createPool(params);
    await expect(tx).to.emit(factory, 'PoolCreated');

    const { pool, poolId, wordIndices } = await createPool(factory, creator, await defaultParams(token));
    expect(poolId).to.equal(2n); // first create above was id 1
    expect(await factory.poolById(poolId)).to.equal(await pool.getAddress());
    expect(await factory.poolAddressToId(await pool.getAddress())).to.equal(poolId);

    // gateway resolution both directions (convert the frozen event Result to a plain array)
    const wi = wordIndices.map((x) => Number(x));
    expect(await factory.poolByPhrase(wi)).to.equal(await pool.getAddress());
    const phrase = await factory.phraseOfPool(await pool.getAddress());
    expect(phrase.map(Number)).to.deep.equal(wi);

    // the pool was seeded correctly + creator recorded
    expect(await pool.creator()).to.equal(creator.address);
    expect(await pool.thresholdBips()).to.equal(params.thresholdBips);
    expect(await pool.maxMembers()).to.equal(params.maxMembers);
  });

  it('assigns unique 4-word phrases across pools (FR-003)', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    const token = await deployToken();
    const a = await createPool(factory, creator, await defaultParams(token));
    const b = await createPool(factory, creator, await defaultParams(token));
    expect(a.wordIndices.map(Number)).to.not.deep.equal(b.wordIndices.map(Number));
    a.wordIndices.forEach((i) => expect(Number(i)).to.be.lessThan(2048));
  });

  it('validates params (cap, threshold, buyIn, deadline)', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    const token = await deployToken();
    const now = (await ethers.provider.getBlock('latest')).timestamp;

    await expect(factory.connect(creator).createPool(await defaultParams(token, { maxMembers: 1001 })))
      .to.be.revertedWithCustomError(factory, 'InvalidParams');
    await expect(factory.connect(creator).createPool(await defaultParams(token, { maxMembers: 1 })))
      .to.be.revertedWithCustomError(factory, 'InvalidParams');
    await expect(factory.connect(creator).createPool(await defaultParams(token, { thresholdBips: 0 })))
      .to.be.revertedWithCustomError(factory, 'InvalidParams');
    await expect(factory.connect(creator).createPool(await defaultParams(token, { thresholdBips: 10001 })))
      .to.be.revertedWithCustomError(factory, 'InvalidParams');
    await expect(factory.connect(creator).createPool(await defaultParams(token, { buyIn: 0 })))
      .to.be.revertedWithCustomError(factory, 'InvalidParams');
    await expect(factory.connect(creator).createPool(await defaultParams(token, { joinDeadline: now - 1 })))
      .to.be.revertedWithCustomError(factory, 'InvalidParams');
  });

  it('screens the creator: sanctioned and non-member creators are rejected (FR-021)', async function () {
    const Sanctions = await ethers.getContractFactory('MockPoolSanctions');
    const guard = await Sanctions.deploy();
    const Membership = await ethers.getContractFactory('MockPoolMembership');
    const membership = await Membership.deploy();
    const { factory } = await deployPoolFactory({
      admin: admin.address,
      screeningRequired: true,
      sanctionsGuard: await guard.getAddress(),
      membershipManager: await membership.getAddress(),
    });
    const token = await deployToken();

    await guard.setDenied(creator.address, true);
    await expect(factory.connect(creator).createPool(await defaultParams(token)))
      .to.be.revertedWithCustomError(guard, 'SanctionedAddress');

    await guard.setDenied(creator.address, false);
    await membership.setAllowed(false);
    await expect(factory.connect(creator).createPool(await defaultParams(token)))
      .to.be.revertedWithCustomError(factory, 'MembershipDenied');

    await membership.setAllowed(true);
    await expect(factory.connect(creator).createPool(await defaultParams(token))).to.emit(factory, 'PoolCreated');
  });

  it('gates admin setters', async function () {
    const { factory } = await deployPoolFactory({ admin: admin.address });
    await expect(factory.connect(other).setTemplate(other.address))
      .to.be.revertedWithCustomError(factory, 'AccessControlUnauthorizedAccount');
  });
});
