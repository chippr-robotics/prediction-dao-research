const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Spec 068 — SafePolicyGuardV2 unit suite. The guard treats msg.sender as the Safe; where a test
// only exercises scope/limit logic a plain signer stands in as the "vault". Approver-set rules read
// the vault back (isOwner / approvedHashes / nonce / getTransactionHash), so those tests drive a
// MockSafe whose hash derivation is byte-identical to Safe v1.4.1.
//
// Coverage: config bounds + typed errors (FR-009), zero-regression passthrough, hard denials,
// lockout-proof exemptions (FR-021), asset/band/target matching and first-match ordering (FR-011),
// the same-scope alternative that makes "a + b / c" expressible, approver verification incl.
// K-of-N and removed owners (FR-010), per-rule 24 h windows, cooldown, and preview parity.

const NATIVE = ethers.ZeroAddress;
const ANY = "0x0000000000000000000000000000000000000001";
const DAY = 24 * 60 * 60;
const ONE = 10n ** 18n;

const erc20 = new ethers.Interface([
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
]);

/** A rule with intent-revealing defaults; mirrors the on-chain struct field order. */
function rule({
  asset = ANY,
  perTxLimit = 0n,
  windowLimit = 0n,
  approvalsRequired = 0,
  banded = false,
  approvers = [],
  targets = [],
} = {}) {
  return { asset, perTxLimit, windowLimit, approvalsRequired, banded, approvers, targets };
}

/** checkTransaction argument tuple with only the fields the guard evaluates. */
function checkArgs({ to, value = 0n, data = "0x", operation = 0, gasPrice = 0n, sender = ethers.ZeroAddress }) {
  return [to, value, data, operation, 0, 0, gasPrice, ethers.ZeroAddress, ethers.ZeroAddress, "0x", sender];
}

describe("SafePolicyGuardV2", function () {
  let guard, vault, alice, bob, charlie, recipient, stranger, token;

  beforeEach(async () => {
    [vault, alice, bob, charlie, recipient, stranger] = await ethers.getSigners();
    guard = await (await ethers.getContractFactory("SafePolicyGuardV2")).deploy();
    await guard.waitForDeployment();
    token = ethers.getAddress("0x00000000000000000000000000000000000c0ffe"); // never called: classification is pure
  });

  // ------------------------------------------------------------------ interface / authority

  it("supports the Safe guard interface id and ERC-165 (GS300 acceptance)", async () => {
    const ct = ethers.dataSlice(
      ethers.id("checkTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,address)"),
      0,
      4,
    );
    const cae = ethers.dataSlice(ethers.id("checkAfterExecution(bytes32,bool)"), 0, 4);
    const guardId = ethers.toBeHex(BigInt(ct) ^ BigInt(cae), 4);
    expect(await guard.supportsInterface(guardId)).to.equal(true);
    expect(await guard.supportsInterface("0x01ffc9a7")).to.equal(true);
    expect(await guard.supportsInterface("0xdeadbeef")).to.equal(false);
  });

  it("scopes rules to msg.sender — one vault cannot touch another's policy", async () => {
    await guard.connect(vault).setRules([rule({ perTxLimit: 100n })], 0);
    expect(await guard.ruleCount(vault.address)).to.equal(1n);
    expect(await guard.ruleCount(alice.address)).to.equal(0n);
  });

  // ------------------------------------------------------------------ configuration validation

  it("rejects rule sets that exceed the bounds", async () => {
    const many = Array.from({ length: 17 }, () => rule({ perTxLimit: 1n }));
    await expect(guard.connect(vault).setRules(many, 0)).to.be.revertedWithCustomError(guard, "TooManyRules");

    const approvers = (await ethers.getSigners()).slice(0, 9).map((s) => s.address);
    await expect(
      guard.connect(vault).setRules([rule({ approvers })], 0),
    ).to.be.revertedWithCustomError(guard, "TooManyApprovers");

    const targets = Array.from({ length: 17 }, (_, i) => ethers.getAddress(`0x${(i + 1).toString(16).padStart(40, "0")}`));
    await expect(guard.connect(vault).setRules([rule({ targets })], 0)).to.be.revertedWithCustomError(
      guard,
      "TooManyTargets",
    );

    await expect(guard.connect(vault).setRules([rule()], 366 * DAY)).to.be.revertedWithCustomError(
      guard,
      "CooldownTooLong",
    );
  });

  it("rejects incoherent approver and band configuration", async () => {
    // approvalsRequired without approvers
    await expect(
      guard.connect(vault).setRules([rule({ approvalsRequired: 1 })], 0),
    ).to.be.revertedWithCustomError(guard, "BadApprovalsRequired");
    // more approvals than approvers
    await expect(
      guard.connect(vault).setRules([rule({ approvers: [alice.address], approvalsRequired: 2 })], 0),
    ).to.be.revertedWithCustomError(guard, "BadApprovalsRequired");
    // banded without a limit to band on
    await expect(
      guard.connect(vault).setRules([rule({ banded: true })], 0),
    ).to.be.revertedWithCustomError(guard, "BandedNeedsLimit");
    // duplicates
    await expect(
      guard.connect(vault).setRules([rule({ approvers: [alice.address, alice.address] })], 0),
    ).to.be.revertedWithCustomError(guard, "DuplicateApprover");
    await expect(
      guard.connect(vault).setRules([rule({ targets: [recipient.address, recipient.address] })], 0),
    ).to.be.revertedWithCustomError(guard, "DuplicateTarget");
  });

  it("normalizes 'all listed approvers' to an explicit count and reports rules back", async () => {
    await guard.connect(vault).setRules(
      [rule({ asset: NATIVE, perTxLimit: ONE, approvers: [alice.address, bob.address] })],
      3600,
    );
    const [rules, cooldown] = await guard.getRules(vault.address);
    expect(rules.length).to.equal(1);
    expect(rules[0].approvalsRequired).to.equal(2); // 0 => all
    expect(rules[0].approvers).to.deep.equal([alice.address, bob.address]);
    expect(cooldown).to.equal(3600n);
    const meta = await guard.getMeta(vault.address);
    expect(meta.hasApproverRules).to.equal(true);
    expect(meta.rulesVersion).to.equal(1n);
  });

  it("replaces the whole rule set atomically and restarts window accounting", async () => {
    await guard.connect(vault).setRules([rule({ asset: NATIVE, windowLimit: 10n })], 0);
    await guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 4n }));
    expect((await guard.getRuleAccounting(vault.address, 0)).spentInWindow).to.equal(4n);

    await guard.connect(vault).setRules([rule({ asset: NATIVE, windowLimit: 10n })], 0);
    expect((await guard.getRuleAccounting(vault.address, 0)).spentInWindow).to.equal(0n);
    expect((await guard.getMeta(vault.address)).rulesVersion).to.equal(2n);
  });

  // ------------------------------------------------------------------ passthrough & denials

  it("passes every transaction through when the vault has no rules (zero regression)", async () => {
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: stranger.address, value: 10n ** 21n })))
      .to.not.be.reverted;
  });

  it("blocks delegatecall and gas refunds while a policy is active", async () => {
    await guard.connect(vault).setRules([rule()], 0);
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, operation: 1 })),
    ).to.be.revertedWithCustomError(guard, "DelegatecallBlocked");
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, gasPrice: 1n })),
    ).to.be.revertedWithCustomError(guard, "GasRefundBlocked");
  });

  it("keeps vault self-management and policy configuration exempt under a deny-all policy", async () => {
    // An empty rule set with the guard attached denies every fund movement...
    await guard.connect(vault).setRules([rule({ asset: NATIVE, perTxLimit: 1n, banded: true })], 0);
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 5n })),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");
    // ...but owners can always reach the vault itself and this guard to loosen it (FR-021).
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: vault.address, value: 0n }))).to.not.be
      .reverted;
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: await guard.getAddress() }))).to.not.be
      .reverted;
    // Value may never ride into the guard.
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: await guard.getAddress(), value: 1n })),
    ).to.be.revertedWithCustomError(guard, "ValueToGuardBlocked");
  });

  it("denies a transaction no rule matches — policy silence is denial", async () => {
    await guard.connect(vault).setRules([rule({ asset: token, perTxLimit: ONE })], 0);
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 1n })),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");
  });

  // ------------------------------------------------------------------ matching

  it("scopes rules by asset: native-only, token-only, and any", async () => {
    const transfer = erc20.encodeFunctionData("transfer", [recipient.address, ONE]);
    await guard.connect(vault).setRules([rule({ asset: NATIVE, perTxLimit: 10n * ONE })], 0);

    // native matches
    let m = await guard.matchTransaction(vault.address, recipient.address, ONE, "0x");
    expect(m.matched).to.equal(true);
    // token does not
    m = await guard.matchTransaction(vault.address, token, 0n, transfer);
    expect(m.matched).to.equal(false);

    await guard.connect(vault).setRules([rule({ asset: token, perTxLimit: 10n * ONE })], 0);
    m = await guard.matchTransaction(vault.address, token, 0n, transfer);
    expect(m.matched).to.equal(true);
    m = await guard.matchTransaction(vault.address, recipient.address, ONE, "0x");
    expect(m.matched).to.equal(false);
  });

  it("routes mixed native+token transactions to ANY_ASSET rules only", async () => {
    const transfer = erc20.encodeFunctionData("transfer", [recipient.address, ONE]);
    await guard.connect(vault).setRules([rule({ asset: NATIVE }), rule({ asset: token })], 0);
    let m = await guard.matchTransaction(vault.address, token, 5n, transfer); // both legs
    expect(m.matched).to.equal(false);

    await guard.connect(vault).setRules([rule({ asset: NATIVE }), rule({ asset: ANY })], 0);
    m = await guard.matchTransaction(vault.address, token, 5n, transfer);
    expect(m.matched).to.equal(true);
    expect(m.ruleIndex).to.equal(1n);
  });

  it("gates destinations: token beneficiary, call target, and native value riding a token call", async () => {
    const transfer = erc20.encodeFunctionData("transfer", [stranger.address, ONE]);
    const allowed = erc20.encodeFunctionData("transfer", [recipient.address, ONE]);
    await guard.connect(vault).setRules([rule({ targets: [recipient.address] })], 0);

    // decoded beneficiary must be listed
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: token, data: transfer })),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: token, data: allowed }))).to.not.be.reverted;

    // generic calldata gates the call target — no escape hatch
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: stranger.address, data: "0xdeadbeef" })),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, data: "0xdeadbeef" })))
      .to.not.be.reverted;

    // native value riding an allowed token call still gates the target (the token contract)
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: token, value: 1n, data: allowed })),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");
  });

  it("governs with the lowest-numbered matching rule and never falls through on a limit failure", async () => {
    await guard.connect(vault).setRules(
      [
        rule({ asset: NATIVE, perTxLimit: ONE }), // rule 001 — strict
        rule({ asset: NATIVE, perTxLimit: 100n * ONE }), // rule 002 — would allow, must NOT be consulted
      ],
      0,
    );
    const m = await guard.matchTransaction(vault.address, recipient.address, 5n * ONE, "0x");
    expect(m.ruleIndex).to.equal(0n);
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 5n * ONE })))
      .to.be.revertedWithCustomError(guard, "RulePerTxExceeded")
      .withArgs(0n, NATIVE, 5n * ONE, ONE);
  });

  it("bands by amount so ordered rules form tiers", async () => {
    await guard.connect(vault).setRules(
      [
        rule({ asset: NATIVE, perTxLimit: ONE, banded: true }), // ≤ 1
        rule({ asset: NATIVE, perTxLimit: 10n * ONE, banded: true }), // (1, 10]
      ],
      0,
    );
    expect((await guard.matchTransaction(vault.address, recipient.address, ONE, "0x")).ruleIndex).to.equal(0n);
    expect((await guard.matchTransaction(vault.address, recipient.address, 5n * ONE, "0x")).ruleIndex).to.equal(1n);
    expect((await guard.matchTransaction(vault.address, recipient.address, 50n * ONE, "0x")).matched).to.equal(false);
  });

  // ------------------------------------------------------------------ approver sets (MockSafe)

  describe("approver-set rules", function () {
    let safe, safeAddr;

    beforeEach(async () => {
      safe = await (await ethers.getContractFactory("MockSafe")).deploy();
      await safe.waitForDeployment();
      safeAddr = await safe.getAddress();
      await safe.setOwners([alice.address, bob.address, charlie.address]);
      await safe.setGuard(await guard.getAddress());
      await vault.sendTransaction({ to: safeAddr, value: 100n * ONE });
    });

    /** Configure rules as the vault itself (impersonated), mirroring a threshold self-transaction. */
    async function setRulesAsVault(rules, cooldown = 0) {
      const signer = await ethers.getImpersonatedSigner(safeAddr);
      await vault.sendTransaction({ to: safeAddr, value: ONE }); // gas for the impersonated account
      await guard.connect(signer).setRules(rules, cooldown);
    }

    /** Pre-approve the pending transaction on behalf of the given owners. */
    async function approveBy(owners, to, value, data = "0x") {
      const hash = await safe.pendingTransactionHash(to, value, data, 0);
      for (const owner of owners) await safe.approveHashFor(owner, hash);
      return hash;
    }

    it("expresses 'A and B together, or C alone' as two same-scope rules", async () => {
      await setRulesAsVault([
        rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [alice.address, bob.address] }), // 001: both
        rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [charlie.address] }), // 002: solo
      ]);

      // A + B → governed by rule 001
      await approveBy([alice.address, bob.address], recipient.address, ONE);
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0)).to.not.be.reverted;

      // C alone → rule 001's approvers are unmet, the same-scope alternative 002 takes over
      await approveBy([charlie.address], recipient.address, ONE);
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0)).to.not.be.reverted;

      // A alone → neither rule is satisfied; the FIRST failure is reported
      await approveBy([alice.address], recipient.address, ONE);
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0))
        .to.be.revertedWithCustomError(guard, "RuleApproversMissing")
        .withArgs(0n, 1n, 2n);

      // over the limit → blocked regardless of who approved. The rules are unbanded, so rule 001
      // still GOVERNS the transaction and reports its own limit: a limit failure never falls
      // through to rule 002, even though 002 would have admitted the same approvers.
      await approveBy([alice.address, bob.address, charlie.address], recipient.address, 50n * ONE);
      await expect(safe.execTransactionApproved(recipient.address, 50n * ONE, "0x", 0))
        .to.be.revertedWithCustomError(guard, "RulePerTxExceeded")
        .withArgs(0n, NATIVE, 50n * ONE, 10n * ONE);
    });

    it("supports K-of-N approver sets ('A or B')", async () => {
      await setRulesAsVault([
        rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [alice.address, bob.address], approvalsRequired: 1 }),
      ]);
      await approveBy([bob.address], recipient.address, ONE);
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0)).to.not.be.reverted;

      await approveBy([], recipient.address, ONE);
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0))
        .to.be.revertedWithCustomError(guard, "RuleApproversMissing")
        .withArgs(0n, 0n, 1n);
    });

    it("tiers limits: either owner up to X, both together up to Y", async () => {
      const X = ONE;
      const Y = 10n * ONE;
      await setRulesAsVault([
        rule({
          asset: NATIVE,
          perTxLimit: X,
          banded: true,
          approvers: [alice.address, bob.address],
          approvalsRequired: 1,
        }),
        rule({ asset: NATIVE, perTxLimit: Y, banded: true, approvers: [alice.address, bob.address] }),
      ]);

      // ≤ X with one approval
      await approveBy([alice.address], recipient.address, X);
      await expect(safe.execTransactionApproved(recipient.address, X, "0x", 0)).to.not.be.reverted;

      // in (X, Y] with one approval → band 002 governs and needs both
      await approveBy([alice.address], recipient.address, 5n * ONE);
      await expect(safe.execTransactionApproved(recipient.address, 5n * ONE, "0x", 0))
        .to.be.revertedWithCustomError(guard, "RuleApproversMissing")
        .withArgs(1n, 1n, 2n);

      // in (X, Y] with both approvals
      await approveBy([alice.address, bob.address], recipient.address, 5n * ONE);
      await expect(safe.execTransactionApproved(recipient.address, 5n * ONE, "0x", 0)).to.not.be.reverted;
    });

    it("never counts an approver who has stopped being an owner (FR-010)", async () => {
      await setRulesAsVault([
        rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [alice.address, bob.address] }),
      ]);
      await approveBy([alice.address, bob.address], recipient.address, ONE);
      await safe.removeOwner(bob.address);
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0))
        .to.be.revertedWithCustomError(guard, "RuleApproversMissing")
        .withArgs(0n, 1n, 2n);
    });

    it("counts the executing owner as an approver (Safe pre-validated-signature parity)", async () => {
      await setRulesAsVault([
        rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [alice.address, bob.address] }),
      ]);
      // Only Alice records an on-chain approval; Bob executes, which is his consent.
      await approveBy([alice.address], recipient.address, ONE);
      await expect(safe.connect(bob).execTransactionApproved(recipient.address, ONE, "0x", 0)).to.not.be.reverted;
    });

    it("does not let an approval for a different transaction unlock this one", async () => {
      await setRulesAsVault([rule({ asset: NATIVE, perTxLimit: 10n * ONE, approvers: [alice.address] })]);
      await approveBy([alice.address], stranger.address, ONE); // approval bound to another recipient
      await expect(safe.execTransactionApproved(recipient.address, ONE, "0x", 0))
        .to.be.revertedWithCustomError(guard, "RuleApproversMissing")
        .withArgs(0n, 0n, 1n);
    });

    it("blocks an approved-but-violating transaction end to end and lets a compliant one through", async () => {
      await setRulesAsVault([rule({ asset: NATIVE, perTxLimit: ONE, approvers: [alice.address] })]);
      await approveBy([alice.address], recipient.address, 5n * ONE);
      await expect(safe.execTransactionApproved(recipient.address, 5n * ONE, "0x", 0)).to.be.revertedWithCustomError(
        guard,
        "RulePerTxExceeded",
      );

      const before = await ethers.provider.getBalance(recipient.address);
      await approveBy([alice.address], recipient.address, ONE);
      await safe.execTransactionApproved(recipient.address, ONE, "0x", 0);
      expect(await ethers.provider.getBalance(recipient.address)).to.equal(before + ONE);
    });
  });

  // ------------------------------------------------------------------ limits, windows, cooldown

  it("enforces a per-rule 24-hour window that resets on the boundary", async () => {
    await guard.connect(vault).setRules([rule({ asset: NATIVE, windowLimit: 10n })], 0);
    await guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 6n }));
    expect((await guard.getRuleAccounting(vault.address, 0)).remaining).to.equal(4n);

    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 5n })))
      .to.be.revertedWithCustomError(guard, "RuleWindowExceeded")
      .withArgs(0n, NATIVE, 5n, 4n);

    await time.increase(DAY);
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 9n }))).to.not.be
      .reverted;
  });

  it("keeps window accounting independent per rule", async () => {
    await guard.connect(vault).setRules(
      [rule({ asset: NATIVE, windowLimit: 10n }), rule({ asset: token, windowLimit: 10n })],
      0,
    );
    await guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 7n }));
    expect((await guard.getRuleAccounting(vault.address, 0)).spentInWindow).to.equal(7n);
    expect((await guard.getRuleAccounting(vault.address, 1)).spentInWindow).to.equal(0n);
  });

  it("reports no window cap as unlimited remaining", async () => {
    await guard.connect(vault).setRules([rule({ asset: NATIVE, perTxLimit: 5n })], 0);
    expect((await guard.getRuleAccounting(vault.address, 0)).remaining).to.equal(ethers.MaxUint256);
  });

  it("rate-limits counted transactions with the policy-wide cooldown and exempts non-fund calls", async () => {
    await guard.connect(vault).setRules([rule()], 3600);
    await guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 1n }));
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 1n })),
    ).to.be.revertedWithCustomError(guard, "CooldownActive");
    // a call that moves nothing is not rate-limited
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, data: "0xabcdef12" })))
      .to.not.be.reverted;
    await time.increase(3600);
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 1n }))).to.not.be
      .reverted;
  });

  it("values ERC-20 transfer, transferFrom and approve, including padded calldata", async () => {
    await guard.connect(vault).setRules([rule({ asset: token, perTxLimit: ONE })], 0);
    for (const data of [
      erc20.encodeFunctionData("transfer", [recipient.address, 2n * ONE]),
      erc20.encodeFunctionData("transferFrom", [vault.address, recipient.address, 2n * ONE]),
      erc20.encodeFunctionData("approve", [recipient.address, 2n * ONE]),
    ]) {
      await expect(
        guard.connect(vault).checkTransaction(...checkArgs({ to: token, data })),
      ).to.be.revertedWithCustomError(guard, "RulePerTxExceeded");
    }
    const padded = erc20.encodeFunctionData("transfer", [recipient.address, 2n * ONE]) + "00".repeat(32);
    await expect(
      guard.connect(vault).checkTransaction(...checkArgs({ to: token, data: padded })),
    ).to.be.revertedWithCustomError(guard, "RulePerTxExceeded");
  });

  // ------------------------------------------------------------------ preview parity

  it("previews without writing state and matches enforcement exactly", async () => {
    await guard.connect(vault).setRules([rule({ asset: NATIVE, perTxLimit: ONE, windowLimit: 2n * ONE })], 0);

    const ok = await guard.previewTransaction(
      vault.address, recipient.address, ONE, "0x", 0, vault.address, ethers.ZeroHash,
    );
    expect(ok.ok).to.equal(true);
    expect((await guard.getRuleAccounting(vault.address, 0)).spentInWindow).to.equal(0n); // read-only

    const bad = await guard.previewTransaction(
      vault.address, recipient.address, 5n * ONE, "0x", 0, vault.address, ethers.ZeroHash,
    );
    expect(bad.ok).to.equal(false);
    const decoded = guard.interface.parseError(bad.revertData);
    expect(decoded.name).to.equal("RulePerTxExceeded");
    expect(decoded.args[0]).to.equal(0n);

    // enforcement produces the identical payload
    await expect(guard.connect(vault).checkTransaction(...checkArgs({ to: recipient.address, value: 5n * ONE })))
      .to.be.revertedWithCustomError(guard, "RulePerTxExceeded")
      .withArgs(0n, NATIVE, 5n * ONE, ONE);
  });

  it("previews approver rules conservatively when no approved hash is supplied", async () => {
    await guard.connect(vault).setRules([rule({ asset: NATIVE, perTxLimit: ONE, approvers: [alice.address] })], 0);
    const res = await guard.previewTransaction(
      vault.address, recipient.address, ONE, "0x", 0, stranger.address, ethers.ZeroHash,
    );
    expect(res.ok).to.equal(false);
    expect(guard.interface.parseError(res.revertData).name).to.equal("RuleApproversMissing");
  });

  it("previews exemptions as allowed", async () => {
    await guard.connect(vault).setRules([rule({ asset: NATIVE, perTxLimit: 1n })], 0);
    const self = await guard.previewTransaction(
      vault.address, vault.address, 0n, "0x", 0, vault.address, ethers.ZeroHash,
    );
    expect(self.ok).to.equal(true);
  });
});
