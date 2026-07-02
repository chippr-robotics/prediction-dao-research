const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { Identity } = require("@semaphore-protocol/identity");
const { Group } = require("@semaphore-protocol/group");
const { generateProof } = require("@semaphore-protocol/proof");

const { deployToken, defaultParams, usdc, claimScope, matrixHash } = require("../../helpers/zkpool");

// Real-Semaphore resolution flow (spec 034, UX round 4 follow-up). The unit/integration suites
// exercise pool tally/threshold logic against {MockSemaphore}, and the Amoy fork suite exercises
// group creation + join against the REAL canonical singleton but explicitly documents that it does
// NOT exercise approve/claim because generating a real Groth16 proof is "impractical to run inside
// this on-chain fork harness" (test/fork/Semaphore.fork.test.js). That gap is exactly where a
// production bug hid: browsers block WebAssembly.instantiate() under a CSP without
// 'wasm-unsafe-eval'/'unsafe-eval', so the frontend's proof generation (join precache, approve/vote,
// claim — frontend/src/lib/pools/semaphoreProof.js) silently failed after the identity-derivation
// signature ("approve does nothing"). See specs/034-zk-wager-pools/implementation-notes.md.
//
// This suite closes that gap: it self-deploys the REAL Semaphore V4 (PoseidonT3 + SemaphoreVerifier +
// Semaphore — the same trio scripts/deploy/deploy-semaphore.js uses for ETC/Mordor) against a plain
// hardhat node, wires a real ZKWagerPoolFactory/ZKWagerPool to it, and drives the FULL resolution loop
// with genuine Groth16 proofs generated via @semaphore-protocol/proof (mirroring
// frontend/src/lib/pools/semaphoreProof.js exactly — same Group-from-Joined-events construction, same
// scope/message conventions). A real on-chain approve()/claim() succeeding here means: no scope/field
// mismatch, no contract-level bug — the CSP was the entire defect.
//
// Real Groth16 proving is slow (witness calc + proving for a depth-16 circuit) and downloads the
// ~5MB circuit artifacts on first run (cached under the OS tmpdir by @zk-kit/artifacts). Generous
// timeout, mirroring the fork suite's 180s.

const HAS_NODE_FETCH = typeof fetch === "function";
const describeReal = HAS_NODE_FETCH ? describe : describe.skip;

describeReal("ZKWagerPool resolution — REAL Semaphore V4 verifier + real Groth16 proofs", function () {
  this.timeout(600_000);

  const FQN_POSEIDON = "poseidon-solidity/PoseidonT3.sol:PoseidonT3";
  const FQN_VERIFIER = "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol:SemaphoreVerifier";
  const FQN_SEMAPHORE = "@semaphore-protocol/contracts/Semaphore.sol:Semaphore";
  const DEPTH = 16;

  let creator, m2;
  let factory, pool, token;
  let identityCreator, identityM2;

  /** Mirrors frontend/src/lib/pools/poolContracts.js::poolClaimScope. */
  function poolClaimScope(poolAddress) {
    return BigInt(ethers.keccak256(ethers.solidityPacked(["address", "string"], [poolAddress, "ZKPOOL_CLAIM"])));
  }

  before(async function () {
    [creator, m2] = await ethers.getSigners();

    // 1) Self-deploy the REAL Semaphore V4 trio (same shape as scripts/deploy/deploy-semaphore.js).
    const poseidonFactory = await ethers.getContractFactory(FQN_POSEIDON, creator);
    const poseidon = await poseidonFactory.deploy();
    await poseidon.waitForDeployment();

    const verifierFactory = await ethers.getContractFactory(FQN_VERIFIER, creator);
    const verifier = await verifierFactory.deploy();
    await verifier.waitForDeployment();

    const semaphoreFactory = await ethers.getContractFactory(FQN_SEMAPHORE, {
      signer: creator,
      libraries: { [FQN_POSEIDON]: await poseidon.getAddress() },
    });
    const semaphore = await semaphoreFactory.deploy(await verifier.getAddress());
    await semaphore.waitForDeployment();

    // 2) The real pool template + factory, wired to the real Semaphore (no compliance guards — this
    //    suite isolates the ZK plumbing, same posture as the Amoy fork suite).
    const Pool = await ethers.getContractFactory("ZKWagerPool");
    const poolImpl = await Pool.deploy();
    await poolImpl.waitForDeployment();

    const Factory = await ethers.getContractFactory("ZKWagerPoolFactory");
    factory = await upgrades.deployProxy(
      Factory,
      [creator.address, await poolImpl.getAddress(), await semaphore.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, false],
      { kind: "uups" }
    );
    await factory.waitForDeployment();

    token = await deployToken([creator, m2]);

    // 3) Create a 2-member pool, 100% threshold (both approvals required) — exercises the full
    //    approval-counting AND resolution-locking path, not just "one vote resolves it".
    const params = await defaultParams(token, { maxMembers: 2, thresholdBips: 10000 });
    const tx = await factory.connect(creator).createPool(params);
    const rc = await tx.wait();
    const ev = rc.logs
      .map((l) => {
        try {
          return factory.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "PoolCreated");
    pool = await ethers.getContractAt("ZKWagerPool", ev.args.pool);

    // 4) Both members join — including the CREATOR (round-4 "creator can join their own pool"
    //    feature) — with real Semaphore identities, exactly like frontend/src/lib/pools/identity.js
    //    (createPoolIdentity derives the identity from a signed, pool-scoped message).
    identityCreator = new Identity(
      await creator.signMessage(`FairWins ZK-Wager Pool\nDerive my anonymous identity for pool:\n${await pool.getAddress()}`)
    );
    identityM2 = new Identity(
      await m2.signMessage(`FairWins ZK-Wager Pool\nDerive my anonymous identity for pool:\n${await pool.getAddress()}`)
    );

    await token.connect(creator).approve(await pool.getAddress(), usdc(10));
    await pool.connect(creator).join(identityCreator.commitment);
    await token.connect(m2).approve(await pool.getAddress(), usdc(10));
    await pool.connect(m2).join(identityM2.commitment);

    expect(await pool.memberCount()).to.equal(2);
    // maxMembers reached -> auto-closed (ZKWagerPool._maybeAutoClose).
    expect(await pool.state()).to.equal(1n); // JoiningClosed
  });

  function groupFromJoinedEvents(joinedLogs) {
    // Mirrors frontend usePools.js::getMemberCommitments — the prover's group is reconstructed from
    // the SAME on-chain Joined-event order the contract's Merkle insertion used.
    return new Group(joinedLogs.map((e) => BigInt(e.args.identityCommitment)));
  }

  it("both members can derive a real claim code (join-time precache path) via a real Groth16 proof", async function () {
    // This is exactly frontend/src/hooks/usePools.js::getMyClaimCode's proof shape (message=0n at the
    // pool's fixed claim scope). Success here means the witness calculator + prover run end-to-end —
    // the step a CSP without 'wasm-unsafe-eval' blocks in a browser.
    const joined = await pool.queryFilter(pool.filters.Joined());
    const group = groupFromJoinedEvents(joined);
    const scope = poolClaimScope(await pool.getAddress());

    const proofCreator = await generateProof(identityCreator, group, 0n, scope, DEPTH);
    const proofM2 = await generateProof(identityM2, group, 0n, scope, DEPTH);

    // The package returns proof fields as numeric strings (frontend/src/hooks/usePools.js reads them
    // via .toString() for the cached claim code) — assert they parse to positive BigInts, not any
    // particular JS type.
    expect(() => BigInt(proofCreator.nullifier)).to.not.throw();
    expect(() => BigInt(proofM2.nullifier)).to.not.throw();
    expect(BigInt(proofCreator.nullifier)).to.be.above(0n);
    expect(proofCreator.nullifier).to.not.equal(proofM2.nullifier); // distinct members -> distinct claim codes
    expect(proofCreator.points).to.have.length(8);
    // Full on-chain acceptance (the real verifier, via ZKWagerPool.approve/claim) is exercised in the
    // next test — this one isolates that off-chain proof generation itself succeeds.
  });

  it("creator proposes a payout; both members approve with REAL Groth16 proofs; the pool resolves on-chain", async function () {
    const joined = await pool.queryFilter(pool.filters.Joined());
    const group = groupFromJoinedEvents(joined);
    const claimScopeVal = poolClaimScope(await pool.getAddress());

    // Real claim codes (message=0n at the claim scope) — exactly what the frontend hands the creator.
    const creatorClaimProof = await generateProof(identityCreator, group, 0n, claimScopeVal, DEPTH);
    const m2ClaimProof = await generateProof(identityM2, group, 0n, claimScopeVal, DEPTH);
    const creatorCode = creatorClaimProof.nullifier;
    const m2Code = m2ClaimProof.nullifier;

    // Whole escrow (2 * 10 USDC) to the creator; m2 gets nothing — still a valid, fully-allocated matrix.
    const entries = [
      { claimNullifier: creatorCode, amount: usdc(20) },
      { claimNullifier: m2Code, amount: usdc(0) },
    ];
    const proposalId = matrixHash(entries);

    await expect(pool.connect(creator).proposeOutcome(proposalId)).to.emit(pool, "OutcomeProposed").withArgs(proposalId);
    expect(await pool.currentProposalId()).to.equal(proposalId);

    // Real approval proofs: scope = proposalId, message = 1n (approve) — mirrors usePools.js::vote.
    const approveCreator = await generateProof(identityCreator, group, 1n, BigInt(proposalId), DEPTH);
    await expect(pool.connect(creator).approve(approveCreator)).to.emit(pool, "Approved");
    expect(await pool.proposalApprovals(proposalId)).to.equal(1);
    expect(await pool.state()).to.equal(1n); // still JoiningClosed — only 1 of 2 approvals in

    const approveM2 = await generateProof(identityM2, group, 1n, BigInt(proposalId), DEPTH);
    await expect(pool.connect(m2).approve(approveM2)).to.emit(pool, "OutcomeLocked").withArgs(proposalId);

    expect(await pool.state()).to.equal(2n); // Resolved
    expect(await pool.lockedOutcome()).to.equal(proposalId);

    // A double-approval with the SAME real proof must revert — the real verifier's nullifier-reuse
    // guard (not the mock's) is what's protecting this.
    await expect(pool.connect(creator).approve(approveCreator)).to.be.reverted;

    // Winner claims with a REAL claim proof bound to their own wallet as recipient.
    const claimProof = await generateProof(identityCreator, group, BigInt(creator.address), claimScopeVal, DEPTH);
    const before = await token.balanceOf(creator.address);
    await expect(pool.connect(creator).claim(entries, 0, claimProof, creator.address))
      .to.emit(pool, "Claimed")
      .withArgs(ethers.toBeHex(claimProof.nullifier, 32), creator.address, usdc(20));
    expect(await token.balanceOf(creator.address)).to.equal(before + usdc(20));
  });
});
