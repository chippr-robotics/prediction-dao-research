const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoolFactory, deployToken, defaultParams, createPool, proof, usdc } = require('../helpers/zkpool');

// T014 [US1] — ZKWagerPool resolution: creator proposes, members approve, fraction-of-joined
// threshold locks the outcome; double-vote rejected; revising resets the tally; approvals blocked
// once the resolution window closes (spec 034 FR-013/FR-014/FR-016/FR-020/FR-020a).

const State = { JoiningOpen: 0n, JoiningClosed: 1n, Resolved: 2n };

describe('ZKWagerPool — resolution', function () {
  let admin, creator, m1, m2, m3, factory, token, pool;

  beforeEach(async function () {
    [admin, creator, m1, m2, m3] = await ethers.getSigners();
    ({ factory } = await deployPoolFactory({ admin: admin.address }));
    token = await deployToken([m1, m2, m3]);
    // maxMembers 5, threshold 60%: with 3 joined, required = ceil(3*0.6) = 2 approvals.
    ({ pool } = await createPool(factory, creator, await defaultParams(token, { maxMembers: 5, thresholdBips: 6000 })));
    for (const [m, c] of [[m1, 1n], [m2, 2n], [m3, 3n]]) {
      await token.connect(m).approve(await pool.getAddress(), usdc(10));
      await pool.connect(m).join(c);
    }
    await pool.connect(creator).closeJoining();
  });

  it('only the creator can propose, and only while resolving', async function () {
    const pid = ethers.id('outcome-1');
    await expect(pool.connect(m1).proposeOutcome(pid)).to.be.revertedWithCustomError(pool, 'NotCreator');
    await expect(pool.connect(creator).proposeOutcome(pid)).to.emit(pool, 'OutcomeProposed').withArgs(pid);
  });

  it('counts approvals and locks at the fraction-of-joined threshold', async function () {
    const pid = ethers.id('outcome-1');
    const scope = BigInt(pid);
    await pool.connect(creator).proposeOutcome(pid);

    await expect(pool.connect(m1).approve(proof({ nullifier: 1001n, scope })))
      .to.emit(pool, 'Approved');
    expect(await pool.state()).to.equal(State.JoiningClosed); // 1 of 2

    await expect(pool.connect(m2).approve(proof({ nullifier: 1002n, scope })))
      .to.emit(pool, 'OutcomeLocked').withArgs(pid);
    expect(await pool.state()).to.equal(State.Resolved);
    expect(await pool.lockedOutcome()).to.equal(pid);
  });

  it('rejects a duplicate vote (same nullifier) — no double-voting', async function () {
    const pid = ethers.id('outcome-1');
    const scope = BigInt(pid);
    await pool.connect(creator).proposeOutcome(pid);
    await pool.connect(m1).approve(proof({ nullifier: 2001n, scope }));
    await expect(pool.connect(m1).approve(proof({ nullifier: 2001n, scope }))).to.be.reverted; // mock UsedNullifierTwice
  });

  it('rejects an approval whose scope is not the current proposal', async function () {
    const pid = ethers.id('outcome-1');
    await pool.connect(creator).proposeOutcome(pid);
    await expect(pool.connect(m1).approve(proof({ nullifier: 3001n, scope: 999n })))
      .to.be.revertedWithCustomError(pool, 'WrongScope');
  });

  it('revising the proposal uses a fresh tally (FR-020a)', async function () {
    const pid1 = ethers.id('outcome-1');
    const pid2 = ethers.id('outcome-2');
    await pool.connect(creator).proposeOutcome(pid1);
    await pool.connect(m1).approve(proof({ nullifier: 4001n, scope: BigInt(pid1) }));
    expect(await pool.proposalApprovals(pid1)).to.equal(1);

    await pool.connect(creator).proposeOutcome(pid2);
    await pool.connect(m1).approve(proof({ nullifier: 5001n, scope: BigInt(pid2) }));
    expect(await pool.proposalApprovals(pid2)).to.equal(1);
    expect(await pool.state()).to.equal(State.JoiningClosed); // still 1 of 2 on the new proposal
  });

  it('blocks approvals once the resolution window has closed (refund-only, FR-019)', async function () {
    const pid = ethers.id('outcome-1');
    await pool.connect(creator).proposeOutcome(pid);
    const closedAt = await pool.closedAt();
    const win = await pool.resolutionWindow();
    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(closedAt) + Number(win) + 1]);
    await ethers.provider.send('evm_mine', []);
    await expect(pool.connect(m1).approve(proof({ nullifier: 6001n, scope: BigInt(pid) })))
      .to.be.revertedWithCustomError(pool, 'ResolutionWindowClosed');
  });
});
