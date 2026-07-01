const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  deployPoolFactory, deployToken, defaultParams, createPool, proof, claimScope, matrixHash, usdc,
} = require('../../helpers/zkpool');

// T017 [US1] — ZK-Wager Pool end-to-end lifecycle (spec 034). Wires the factory in value-bearing
// mode (screeningRequired=true) with MockPoolSanctions + MockPoolMembership and exercises the full
// happy path: create -> joins (a sanctioned wallet bounced, allowed wallets in) -> close ->
// creator proposes the payout matrix -> members anonymously approve to the fraction-of-joined
// threshold -> OutcomeLocked -> a winner claims to a FRESH address -> the double-claim is rejected.
// A second, independent pool is created, left unresolved past its resolution window, and refunded
// (the funds-never-stuck invariant, FR-019/SC-007). Deterministic: fixed commitments, nullifiers,
// and an explicit timestamp jump for the timeout pool.

const State = { JoiningOpen: 0n, JoiningClosed: 1n, Resolved: 2n, Cancelled: 3n };

describe('ZK-Wager Pool — end-to-end lifecycle (screening on)', function () {
  let admin, creator, m1, m2, m3, sanctioned;
  let guard, membership, factory, token;

  beforeEach(async function () {
    [admin, creator, m1, m2, m3, sanctioned] = await ethers.getSigners();

    // Value-bearing config: both compliance guards configured and screeningRequired = true (FR-021a).
    const Sanctions = await ethers.getContractFactory('MockPoolSanctions');
    guard = await Sanctions.deploy();
    const Membership = await ethers.getContractFactory('MockPoolMembership');
    membership = await Membership.deploy();

    ({ factory } = await deployPoolFactory({
      admin: admin.address,
      screeningRequired: true,
      sanctionsGuard: await guard.getAddress(),
      membershipManager: await membership.getAddress(),
    }));

    // Mint to every wallet that will attempt a join (including the sanctioned one).
    token = await deployToken([m1, m2, m3, sanctioned]);
  });

  async function join(pool, member, commitment) {
    await token.connect(member).approve(await pool.getAddress(), usdc(10));
    return pool.connect(member).join(commitment);
  }

  it('runs the full create→join→close→resolve→claim path and blocks a double-claim', async function () {
    // maxMembers 5, threshold 60%: with 3 joined, required = ceil(3 * 0.6) = 2 approvals.
    const { pool, poolId } = await createPool(
      factory, creator, await defaultParams(token, { maxMembers: 5, thresholdBips: 6000 })
    );
    expect(await factory.poolById(poolId)).to.equal(await pool.getAddress());
    expect(await pool.state()).to.equal(State.JoiningOpen);

    // --- Joins: the sanctioned wallet is bounced on the REAL wallet (FR-021d), allowed wallets in.
    await guard.setDenied(sanctioned.address, true);
    await token.connect(sanctioned).approve(await pool.getAddress(), usdc(10));
    await expect(pool.connect(sanctioned).join(999n)).to.be.revertedWithCustomError(guard, 'SanctionedAddress');
    expect(await pool.hasJoined(sanctioned.address)).to.equal(false);

    await expect(join(pool, m1, 11n)).to.emit(pool, 'Joined').withArgs(11n);
    await expect(join(pool, m2, 22n)).to.emit(pool, 'Joined').withArgs(22n);
    await expect(join(pool, m3, 33n)).to.emit(pool, 'Joined').withArgs(33n);
    expect(await pool.memberCount()).to.equal(3);
    expect(await token.balanceOf(await pool.getAddress())).to.equal(usdc(30));

    // --- Creator closes joining: denominator + escrow freeze at 3 members (FR-007a).
    await expect(pool.connect(creator).closeJoining()).to.emit(pool, 'JoiningClosedEvent').withArgs(3);
    expect(await pool.state()).to.equal(State.JoiningClosed);
    expect(await pool.frozenDenominator()).to.equal(3);
    expect(await pool.escrowTotal()).to.equal(usdc(30));

    // --- Creator proposes the payout matrix (its hash is the proposalId, FR-013/FR-020).
    // The matrix must allocate the full escrow (usdc(30)): a single winner takes the pot.
    const winnerNullifier = 70001n;
    const entries = [{ claimNullifier: winnerNullifier, amount: usdc(30) }];
    const pid = matrixHash(entries);
    await expect(pool.connect(creator).proposeOutcome(pid)).to.emit(pool, 'OutcomeProposed').withArgs(pid);

    // --- Members anonymously approve to the threshold (2 of 3); the 2nd approval locks the outcome.
    const scope = BigInt(pid);
    await expect(pool.connect(m1).approve(proof({ nullifier: 80001n, scope }))).to.emit(pool, 'Approved');
    expect(await pool.state()).to.equal(State.JoiningClosed); // 1 of 2 — not yet locked
    await expect(pool.connect(m2).approve(proof({ nullifier: 80002n, scope })))
      .to.emit(pool, 'OutcomeLocked').withArgs(pid);
    expect(await pool.state()).to.equal(State.Resolved);
    expect(await pool.lockedOutcome()).to.equal(pid);

    // --- A winner claims to a FRESH address (privacy: payout decoupled from any joining wallet).
    const fresh = ethers.Wallet.createRandom().address;
    expect(await token.balanceOf(fresh)).to.equal(0n);
    const claimProof = proof({
      nullifier: winnerNullifier,
      scope: claimScope(await pool.getAddress()),
      message: BigInt(fresh),
    });
    await expect(pool.connect(m1).claim(entries, 0, claimProof, fresh))
      .to.emit(pool, 'Claimed').withArgs(ethers.zeroPadValue(ethers.toBeHex(winnerNullifier), 32), fresh, usdc(30));
    expect(await token.balanceOf(fresh)).to.equal(usdc(30));
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n); // escrow fully drained

    // --- The double-claim reuses the claim nullifier → the (mock) Semaphore rejects it (FR-017).
    await expect(
      pool.connect(m1).claim(entries, 0, proof({
        nullifier: winnerNullifier, scope: claimScope(await pool.getAddress()), message: BigInt(fresh),
      }), fresh)
    ).to.be.reverted;
    expect(await token.balanceOf(fresh)).to.equal(usdc(30)); // unchanged — no second payout
  });

  it('refunds members of an independent pool that times out unresolved (FR-019/SC-007)', async function () {
    const { pool } = await createPool(
      factory, creator, await defaultParams(token, { maxMembers: 5, thresholdBips: 6000 })
    );

    await join(pool, m1, 101n);
    await join(pool, m2, 202n);
    await pool.connect(creator).closeJoining();
    expect(await pool.state()).to.equal(State.JoiningClosed);
    expect(await pool.escrowTotal()).to.equal(usdc(20));

    // Nobody resolves; jump past the resolution window so the pool becomes refund-only.
    const closedAt = await pool.closedAt();
    const win = await pool.resolutionWindow();
    await ethers.provider.send('evm_setNextBlockTimestamp', [Number(closedAt) + Number(win) + 1]);
    await ethers.provider.send('evm_mine', []);

    // Resolution is now closed; every member can pull their buy-in back exactly once.
    await expect(pool.connect(m1).refund()).to.emit(pool, 'Refunded').withArgs(m1.address, usdc(10));
    await expect(pool.connect(m2).refund()).to.emit(pool, 'Refunded').withArgs(m2.address, usdc(10));
    expect(await token.balanceOf(m1.address)).to.equal(usdc(1000));
    expect(await token.balanceOf(m2.address)).to.equal(usdc(1000));
    expect(await token.balanceOf(await pool.getAddress())).to.equal(0n);

    // No double-refund.
    await expect(pool.connect(m1).refund()).to.be.revertedWithCustomError(pool, 'NothingToRefund');
  });
});
