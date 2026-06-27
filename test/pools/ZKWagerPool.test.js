const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoolFactory, deployToken, defaultParams, createPool, usdc } = require('../helpers/zkpool');

// T013 [US1] — ZKWagerPool join + close: escrow, addMember, member count, double-join,
// full→auto-close, deadline close, creator close, late-join rejection, sanctioned-joiner rejection
// (spec 034 FR-006/FR-007/FR-007a/FR-021).

const State = { JoiningOpen: 0n, JoiningClosed: 1n, Resolved: 2n, Cancelled: 3n };

describe('ZKWagerPool — join & close', function () {
  let admin, creator, m1, m2, m3;
  let factory, token, pool;

  beforeEach(async function () {
    [admin, creator, m1, m2, m3] = await ethers.getSigners();
    ({ factory } = await deployPoolFactory({ admin: admin.address }));
    token = await deployToken([m1, m2, m3]);
    ({ pool } = await createPool(factory, creator, await defaultParams(token, { maxMembers: 3 })));
  });

  async function join(member, commitment) {
    await token.connect(member).approve(await pool.getAddress(), usdc(10));
    return pool.connect(member).join(commitment);
  }

  it('escrows the buy-in, inserts the commitment, increments member count', async function () {
    await expect(join(m1, 111n)).to.emit(pool, 'Joined').withArgs(111n);
    expect(await pool.memberCount()).to.equal(1);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(usdc(10));
    expect(await pool.hasJoined(m1.address)).to.equal(true);
  });

  it('rejects a second join from the same wallet', async function () {
    await join(m1, 111n);
    await token.connect(m1).approve(await pool.getAddress(), usdc(10));
    await expect(pool.connect(m1).join(222n)).to.be.revertedWithCustomError(pool, 'AlreadyJoined');
  });

  it('auto-closes and freezes the denominator when full', async function () {
    await join(m1, 1n);
    await join(m2, 2n);
    await expect(join(m3, 3n)).to.emit(pool, 'JoiningClosedEvent').withArgs(3);
    expect(await pool.state()).to.equal(State.JoiningClosed);
    expect(await pool.frozenDenominator()).to.equal(3);
    expect(await pool.escrowTotal()).to.equal(usdc(30));
  });

  it('rejects joins after joining closes (late-join, FR-007a)', async function () {
    await join(m1, 1n);
    await pool.connect(creator).closeJoining();
    expect(await pool.state()).to.equal(State.JoiningClosed);
    await token.connect(m2).approve(await pool.getAddress(), usdc(10));
    await expect(pool.connect(m2).join(2n)).to.be.revertedWithCustomError(pool, 'JoinClosed');
  });

  it('lets the creator close joining, and anyone close after the deadline', async function () {
    await join(m1, 1n);
    await expect(pool.connect(m1).closeJoining()).to.be.revertedWithCustomError(pool, 'NotCreator');

    const dl = await pool.joinDeadline();
    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(dl) + 1]);
    await ethers.provider.send('evm_mine', []);
    await expect(pool.connect(m2).pokeDeadline()).to.emit(pool, 'JoiningClosedEvent').withArgs(1);
  });

  it('rejects a sanctioned joiner at join (screening on the real wallet, FR-021d)', async function () {
    const Sanctions = await ethers.getContractFactory('MockPoolSanctions');
    const guard = await Sanctions.deploy();
    const Membership = await ethers.getContractFactory('MockPoolMembership');
    const membership = await Membership.deploy();
    const setup = await deployPoolFactory({
      admin: admin.address,
      screeningRequired: true,
      sanctionsGuard: await guard.getAddress(),
      membershipManager: await membership.getAddress(),
    });
    const tok2 = await deployToken([m1]);
    const { pool: p2 } = await createPool(setup.factory, creator, await defaultParams(tok2, { maxMembers: 3 }));

    await guard.setDenied(m1.address, true);
    await tok2.connect(m1).approve(await p2.getAddress(), usdc(10));
    await expect(p2.connect(m1).join(1n)).to.be.revertedWithCustomError(guard, 'SanctionedAddress');
  });
});
