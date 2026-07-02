const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { deployToken, defaultParams, usdc } = require('../helpers/zkpool');

// PublicWagerPool (spec 034 resolution redesign) — the non-anonymous, address-based drop-in template.
// Members join / approve / claim with their real wallet; the payout matrix keys on the winner's address
// (the public "claim code"), so there is no per-member Semaphore nullifier to exchange. This suite drives
// the full lifecycle against a factory whose template is PublicWagerPool, proving it is a drop-in for the
// factory's `ZKWagerPool(pool).initialize(...)` call (identical selector) with no factory change.

const ZERO = ethers.ZeroAddress;

/** address-keyed payout matrix hash — must equal proposalId / lockedOutcome. */
function matrixHash(entries) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(['tuple(address winner,uint256 amount)[]'], [entries.map((e) => ({ winner: e.winner, amount: e.amount }))])
  );
}

async function deployFactoryWithPublicTemplate(admin) {
  const Semaphore = await ethers.getContractFactory('MockSemaphore');
  const semaphore = await Semaphore.deploy();
  await semaphore.waitForDeployment();

  const Pool = await ethers.getContractFactory('PublicWagerPool');
  const poolImpl = await Pool.deploy();
  await poolImpl.waitForDeployment();

  const Factory = await ethers.getContractFactory('ZKWagerPoolFactory');
  const factory = await upgrades.deployProxy(
    Factory,
    [admin.address, await poolImpl.getAddress(), await semaphore.getAddress(), ZERO, ZERO, false],
    { kind: 'uups' }
  );
  await factory.waitForDeployment();
  return { factory, semaphore, poolImpl };
}

async function createPublicPool(factory, creator, params) {
  const rc = await (await factory.connect(creator).createPool(params)).wait();
  const ev = rc.logs
    .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === 'PoolCreated');
  return ethers.getContractAt('PublicWagerPool', ev.args.pool);
}

describe('PublicWagerPool (address-based, non-anonymous)', function () {
  let admin, creator, m2, m3, outsider, factory, token, pool;

  beforeEach(async function () {
    [admin, creator, m2, m3, outsider] = await ethers.getSigners();
    ({ factory } = await deployFactoryWithPublicTemplate(admin));
    token = await deployToken([creator, m2, m3, outsider]);
  });

  async function newPool(overrides = {}) {
    const params = await defaultParams(token, { maxMembers: 2, thresholdBips: 10000, ...overrides });
    pool = await createPublicPool(factory, creator, params);
    return pool;
  }

  async function join(signer) {
    await token.connect(signer).approve(await pool.getAddress(), await pool.buyIn());
    return pool.connect(signer).join();
  }

  it('is a drop-in template: the factory clones + initializes it (open state, correct config)', async function () {
    await newPool({ maxMembers: 5, thresholdBips: 6000 });
    expect(await pool.state()).to.equal(0n); // JoiningOpen
    expect(await pool.creator()).to.equal(creator.address);
    expect(await pool.maxMembers()).to.equal(5);
    expect(await pool.thresholdBips()).to.equal(6000);
    expect(await pool.token()).to.equal(await token.getAddress());
  });

  it('members join with their wallet; the pool auto-closes when full', async function () {
    await newPool({ maxMembers: 2 });
    await expect(join(creator)).to.emit(pool, 'Joined').withArgs(creator.address);
    expect(await pool.state()).to.equal(0n);
    await join(m2);
    expect(await pool.memberCount()).to.equal(2);
    expect(await pool.state()).to.equal(1n); // JoiningClosed (auto)
    expect(await pool.frozenDenominator()).to.equal(2);
    expect(await pool.escrowTotal()).to.equal(usdc(20));
  });

  it('rejects a double join and a join after joining closes', async function () {
    await newPool({ maxMembers: 3 });
    await join(creator);
    await expect(join(creator)).to.be.revertedWithCustomError(pool, 'AlreadyJoined');
    await pool.connect(creator).closeJoining();
    await expect(join(m2)).to.be.revertedWithCustomError(pool, 'JoinClosed');
  });

  it('runs the full resolution loop: creator proposes, members approve to threshold, winner claims by address', async function () {
    await newPool({ maxMembers: 2, thresholdBips: 10000 }); // both must approve
    await join(creator);
    await join(m2); // auto-closes; escrow = 20 USDC

    // Creator proposes: creator wins 15, m2 wins 5 (sum == escrow).
    const entries = [
      { winner: creator.address, amount: usdc(15) },
      { winner: m2.address, amount: usdc(5) },
    ];
    const pid = matrixHash(entries);
    await expect(pool.connect(creator).proposeOutcome(pid)).to.emit(pool, 'OutcomeProposed').withArgs(pid);

    // Only the creator can propose.
    await expect(pool.connect(m2).proposeOutcome(pid)).to.be.revertedWithCustomError(pool, 'NotCreator');

    // Approvals: 1 of 2 does not resolve; the 2nd locks it.
    await expect(pool.connect(creator).approve()).to.emit(pool, 'Approved').withArgs(pid, creator.address);
    expect(await pool.proposalApprovals(pid)).to.equal(1);
    expect(await pool.state()).to.equal(1n);
    await expect(pool.connect(creator).approve()).to.be.revertedWithCustomError(pool, 'AlreadyApproved');
    await expect(pool.connect(m2).approve()).to.emit(pool, 'OutcomeLocked').withArgs(pid);
    expect(await pool.state()).to.equal(2n); // Resolved
    expect(await pool.lockedOutcome()).to.equal(pid);

    // Winner claims to any recipient; funds move; double-claim + non-winner are rejected.
    const before = await token.balanceOf(m3.address);
    await expect(pool.connect(creator).claim(entries, 0, m3.address))
      .to.emit(pool, 'Claimed').withArgs(creator.address, m3.address, usdc(15));
    expect(await token.balanceOf(m3.address)).to.equal(before + usdc(15));
    await expect(pool.connect(creator).claim(entries, 0, creator.address)).to.be.revertedWithCustomError(pool, 'AlreadyClaimed');
    // A non-winner cannot claim someone else's row (msg.sender must equal entries[index].winner).
    await expect(pool.connect(m3).claim(entries, 1, m3.address)).to.be.revertedWithCustomError(pool, 'NotWinner');
    // m2 claims their own row.
    await expect(pool.connect(m2).claim(entries, 1, m2.address))
      .to.emit(pool, 'Claimed').withArgs(m2.address, m2.address, usdc(5));
  });

  it('rejects a claim whose matrix does not sum to the escrow, or does not hash to the locked outcome', async function () {
    await newPool({ maxMembers: 2, thresholdBips: 10000 });
    await join(creator);
    await join(m2);
    const good = [
      { winner: creator.address, amount: usdc(20) },
      { winner: m2.address, amount: usdc(0) },
    ];
    await pool.connect(creator).proposeOutcome(matrixHash(good));
    await pool.connect(creator).approve();
    await pool.connect(m2).approve(); // resolved on `good`
    // A different matrix (same sum) doesn't match lockedOutcome.
    const tampered = [
      { winner: creator.address, amount: usdc(10) },
      { winner: m2.address, amount: usdc(10) },
    ];
    await expect(pool.connect(creator).claim(tampered, 0, creator.address)).to.be.revertedWithCustomError(pool, 'OutcomeMismatch');
  });

  it('lets the creator revise a mis-keyed proposal before it locks (approvals restart per id)', async function () {
    await newPool({ maxMembers: 2, thresholdBips: 10000 });
    await join(creator);
    await join(m2);
    const wrong = [{ winner: creator.address, amount: usdc(20) }, { winner: m2.address, amount: usdc(0) }];
    const right = [{ winner: creator.address, amount: usdc(5) }, { winner: m2.address, amount: usdc(15) }];
    await pool.connect(creator).proposeOutcome(matrixHash(wrong));
    await pool.connect(creator).approve(); // 1 approval on `wrong`
    // Revise: new id, approvals for it start at 0.
    await pool.connect(creator).proposeOutcome(matrixHash(right));
    expect(await pool.proposalApprovals(matrixHash(right))).to.equal(0);
    await pool.connect(creator).approve();
    await pool.connect(m2).approve();
    expect(await pool.lockedOutcome()).to.equal(matrixHash(right));
  });

  it('a non-member cannot approve', async function () {
    await newPool({ maxMembers: 3, thresholdBips: 5000 });
    await join(creator);
    await pool.connect(creator).closeJoining();
    const entries = [{ winner: creator.address, amount: usdc(10) }];
    await pool.connect(creator).proposeOutcome(matrixHash(entries));
    await expect(pool.connect(outsider).approve()).to.be.revertedWithCustomError(pool, 'NotMember');
  });

  it('refunds every member after the resolution window elapses without an outcome', async function () {
    await newPool({ maxMembers: 2, thresholdBips: 10000, resolutionWindow: 3600 });
    await join(creator);
    await join(m2); // closed
    await ethers.provider.send('evm_increaseTime', [3601]);
    await ethers.provider.send('evm_mine', []);
    const before = await token.balanceOf(creator.address);
    await expect(pool.connect(creator).refund()).to.emit(pool, 'Refunded').withArgs(creator.address, usdc(10));
    expect(await token.balanceOf(creator.address)).to.equal(before + usdc(10));
    await expect(pool.connect(creator).refund()).to.be.revertedWithCustomError(pool, 'NothingToRefund');
  });

  it('creator cancels while open; members refund; a non-creator cannot cancel', async function () {
    await newPool({ maxMembers: 3 });
    await join(creator);
    await expect(pool.connect(m2).cancel()).to.be.revertedWithCustomError(pool, 'NotCreator');
    await expect(pool.connect(creator).cancel()).to.emit(pool, 'PoolCancelled');
    expect(await pool.state()).to.equal(3n); // Cancelled
    await expect(pool.connect(creator).refund()).to.emit(pool, 'Refunded').withArgs(creator.address, usdc(10));
  });
});
