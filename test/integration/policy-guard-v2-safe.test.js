const { expect } = require("chai");
const { ethers } = require("hardhat");

// Spec 068 — integration suite for the ORDERED policy engine against the REAL Safe v1.4.1
// (devDependency, compiled via contracts/mocks/vendor/SafeVendorImports.sol). This is the suite
// that proves the feature's headline claims against the actual bytecode custody vaults run, in
// particular that approver-set rules verify against the Safe's own on-chain approval registry:
//   • US2 acceptance walk: "A and B together, or C alone, up to a limit" — all four outcomes
//   • tiered bands: either owner up to X, both together up to Y
//   • token-specific limits and destination sets (US3, incl. FR-013 limits still apply)
//   • no-match denial (policy silence is denial)
//   • FR-010: a rule naming a removed owner can no longer be satisfied
//   • FR-017/US4: a threshold-approved setRules reorder changes which rule governs
//   • FR-020/FR-021: adopting V2 over a v1-guarded vault, and loosening a too-strict policy

const SAFE_QN = "@safe-global/safe-contracts/contracts/SafeL2.sol:SafeL2";
const FACTORY_QN = "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol:SafeProxyFactory";
const HANDLER_QN = "@safe-global/safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol:CompatibilityFallbackHandler";

const NATIVE = ethers.ZeroAddress;
const ANY = "0x0000000000000000000000000000000000000001";
const AddressZero = ethers.ZeroAddress;
const ONE = ethers.parseEther("1");

/** Rule tuple in contract field order. */
function rule({
  asset = ANY,
  perTxLimit = 0n,
  windowLimit = 0n,
  approvalsRequired = 0,
  banded = false,
  approvers = [],
  targets = [],
} = {}) {
  return [asset, perTxLimit, windowLimit, approvalsRequired, banded, approvers, targets];
}

describe("SafePolicyGuardV2 × real Safe v1.4.1 (integration)", function () {
  let alice, bob, charlie, recipient, outsider;
  let singleton, factory, handler, guard, guardV1, setup, token;
  let saltNonce = 5000n;

  before(async () => {
    [alice, bob, charlie, recipient, outsider] = await ethers.getSigners();
    singleton = await (await ethers.getContractFactory(SAFE_QN)).deploy();
    factory = await (await ethers.getContractFactory(FACTORY_QN)).deploy();
    handler = await (await ethers.getContractFactory(HANDLER_QN)).deploy();
    guard = await (await ethers.getContractFactory("SafePolicyGuardV2")).deploy();
    guardV1 = await (await ethers.getContractFactory("SafePolicyGuard")).deploy();
    setup = await (await ethers.getContractFactory("PolicyGuardSetup")).deploy();
    await Promise.all([singleton, factory, handler, guard, guardV1, setup].map((c) => c.waitForDeployment()));
    token = await (await ethers.getContractFactory("MockERC20")).deploy("Test USD", "TUSD", 18);
    await token.waitForDeployment();
  });

  /** Deploy a 2-of-3 Safe (Alice, Bob, Charlie); optional setup wires the guard at creation. */
  async function createVault({ setupTo = AddressZero, setupData = "0x" } = {}) {
    const owners = [alice.address, bob.address, charlie.address];
    const initializer = singleton.interface.encodeFunctionData("setup", [
      owners, 2n, setupTo, setupData, await handler.getAddress(), AddressZero, 0n, AddressZero,
    ]);
    const tx = await factory.createProxyWithNonce(await singleton.getAddress(), initializer, saltNonce++);
    const receipt = await tx.wait();
    const log = receipt.logs
      .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((p) => p?.name === "ProxyCreation");
    const vault = await ethers.getContractAt(SAFE_QN, log.args.proxy);
    await alice.sendTransaction({ to: log.args.proxy, value: ethers.parseEther("100") });
    await token.mint(log.args.proxy, ethers.parseEther("1000"));
    return vault;
  }

  const setRulesCalldata = (rules, cooldown = 0) =>
    guard.interface.encodeFunctionData("setRules", [rules, cooldown]);

  const enablePolicyCalldata = (rules, cooldown = 0) =>
    setup.interface.encodeFunctionData("enablePolicy", [guard.target, setRulesCalldata(rules, cooldown)]);

  /**
   * Threshold-approve then execute. `signers` are the owners who record an on-chain approveHash;
   * the FIRST of them submits (and so implicitly approves, exactly as the guard counts it).
   * `submitter` overrides who executes, to test the executor-implicit-approval rule.
   */
  async function execAsOwners(vault, { to, value = 0n, data = "0x", operation = 0 }, signers, submitter) {
    const nonce = await vault.nonce();
    const txHash = await vault.getTransactionHash(to, value, data, operation, 0, 0, 0, AddressZero, AddressZero, nonce);
    for (const s of signers) await vault.connect(s).approveHash(txHash);
    // Safe requires the pre-validated signature bundle in ascending owner order.
    const sorted = [...signers].sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
    const signatures = ethers.concat(
      sorted.map((s) => ethers.concat([ethers.zeroPadValue(s.address, 32), ethers.ZeroHash, "0x01"])),
    );
    const sender = submitter || signers[0];
    return vault
      .connect(sender)
      .execTransaction(to, value, data, operation, 0, 0, 0, AddressZero, AddressZero, signatures);
  }

  // ---------------------------------------------------------------- US2 acceptance walk

  describe("US2 — 'A and B together, or C alone, up to a limit'", function () {
    let vault;

    before(async () => {
      // Rule 001: Alice AND Bob, up to 10. Rule 002 (same scope): Charlie alone, up to 10.
      vault = await createVault({
        setupTo: setup.target,
        setupData: enablePolicyCalldata([
          rule({ asset: NATIVE, perTxLimit: ethers.parseEther("10"), approvers: [alice.address, bob.address] }),
          rule({ asset: NATIVE, perTxLimit: ethers.parseEther("10"), approvers: [charlie.address] }),
        ]),
      });
    });

    it("has its rules live before the vault's first transaction", async () => {
      const [rules] = await guard.getRules(vault.target);
      expect(rules.length).to.equal(2);
      expect(rules[0].approvalsRequired).to.equal(2);
      expect(rules[1].approvalsRequired).to.equal(1);
    });

    it("executes when Alice and Bob both approve (rule 001 governs)", async () => {
      const before = await ethers.provider.getBalance(recipient.address);
      await execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, bob]);
      expect(await ethers.provider.getBalance(recipient.address)).to.equal(before + ONE);
    });

    it("executes when Charlie alone approves (same-scope alternative rule 002 governs)", async () => {
      // Charlie's approval + Bob's are collected for the Safe threshold, but only Charlie is named
      // by rule 002 — proving approver evaluation is per-rule, not "whoever signed".
      const before = await ethers.provider.getBalance(recipient.address);
      await execAsOwners(vault, { to: recipient.address, value: ONE }, [charlie, bob]);
      expect(await ethers.provider.getBalance(recipient.address)).to.equal(before + ONE);
    });

    it("blocks a transaction Alice alone backs, naming the rule that needs more approvals", async () => {
      // Alice + outsider-of-the-rule Bob would satisfy 001, so use Alice + Charlie where 001 needs
      // Bob and 002 needs Charlie only... Charlie IS on 002, so drop to a set satisfying neither:
      // Alice alone cannot reach the Safe threshold, so pair her with a second approver who is
      // named by NEITHER rule requirement — impossible with 3 owners, so assert via preview instead.
      const nonce = await vault.nonce();
      const txHash = await vault.getTransactionHash(
        recipient.address, ONE, "0x", 0, 0, 0, 0, AddressZero, AddressZero, nonce,
      );
      await vault.connect(alice).approveHash(txHash);
      const res = await guard.previewTransaction(
        vault.target, recipient.address, ONE, "0x", 0, outsider.address, txHash,
      );
      expect(res.ok).to.equal(false);
      const decoded = guard.interface.parseError(res.revertData);
      expect(decoded.name).to.equal("RuleApproversMissing");
      expect(decoded.args[0]).to.equal(0n); // rule 001 reported first
      expect(decoded.args[1]).to.equal(1n); // only Alice
      expect(decoded.args[2]).to.equal(2n); // needs both
    });

    it("blocks an over-limit transaction however many owners approve", async () => {
      await expect(
        execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("50") }, [alice, bob, charlie]),
      ).to.be.revertedWithCustomError(guard, "RulePerTxExceeded");
    });
  });

  // ---------------------------------------------------------------- tiers, tokens, destinations

  it("tiers by amount: either owner up to X, both together up to Y", async () => {
    const X = ONE;
    const Y = ethers.parseEther("10");
    const vault = await createVault({
      setupTo: setup.target,
      setupData: enablePolicyCalldata([
        rule({ asset: NATIVE, perTxLimit: X, banded: true, approvers: [alice.address, bob.address], approvalsRequired: 1 }),
        rule({ asset: NATIVE, perTxLimit: Y, banded: true, approvers: [alice.address, bob.address] }),
      ]),
    });

    // ≤ X: one named approver is enough (Charlie co-signs only for the Safe threshold).
    await expect(execAsOwners(vault, { to: recipient.address, value: X }, [alice, charlie])).to.not.be.reverted;

    // In (X, Y]: band 002 governs and needs BOTH named owners.
    await expect(
      execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("5") }, [alice, charlie]),
    ).to.be.revertedWithCustomError(guard, "RuleApproversMissing");
    await expect(execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("5") }, [alice, bob])).to.not.be
      .reverted;

    // Above every band: no rule matches at all.
    await expect(
      execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("50") }, [alice, bob]),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");
  });

  it("scopes a limit to one token without constraining others", async () => {
    const vault = await createVault({
      setupTo: setup.target,
      setupData: enablePolicyCalldata([
        rule({ asset: token.target, perTxLimit: ethers.parseEther("100") }),
        rule({ asset: NATIVE, perTxLimit: ethers.parseEther("50") }),
      ]),
    });
    const transfer = (amount) => token.interface.encodeFunctionData("transfer", [recipient.address, amount]);

    await expect(
      execAsOwners(vault, { to: token.target, data: transfer(ethers.parseEther("500")) }, [alice, bob]),
    ).to.be.revertedWithCustomError(guard, "RulePerTxExceeded");

    await execAsOwners(vault, { to: token.target, data: transfer(ethers.parseEther("50")) }, [alice, bob]);
    expect(await token.balanceOf(recipient.address)).to.equal(ethers.parseEther("50"));

    // The token rule does not constrain native movement — that is rule 002's business.
    await expect(execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("5") }, [alice, bob])).to.not.be
      .reverted;
  });

  it("US3: admits approved contracts only, and still applies that rule's limits (FR-013)", async () => {
    const approved = await (await ethers.getContractFactory("MockSafe")).deploy(); // stands in as a service
    await approved.waitForDeployment();
    const vault = await createVault({
      setupTo: setup.target,
      setupData: enablePolicyCalldata([
        rule({ asset: ANY, perTxLimit: ONE, targets: [approved.target] }),
      ]),
    });

    // A call to the approved contract, within the limit.
    await expect(execAsOwners(vault, { to: approved.target, value: ONE, data: "0x" }, [alice, bob])).to.not.be.reverted;

    // The same call to an unlisted contract is not admitted by any rule.
    await expect(
      execAsOwners(vault, { to: outsider.address, value: ONE }, [alice, bob]),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");

    // Contract approval never exempts the amount limit (FR-013).
    await expect(
      execAsOwners(vault, { to: approved.target, value: ethers.parseEther("5") }, [alice, bob]),
    ).to.be.revertedWithCustomError(guard, "RulePerTxExceeded");
  });

  // ---------------------------------------------------------------- lifecycle

  it("FR-010: a rule naming a removed owner can no longer be satisfied", async () => {
    const vault = await createVault({
      setupTo: setup.target,
      setupData: enablePolicyCalldata([
        rule({ asset: NATIVE, perTxLimit: ethers.parseEther("10"), approvers: [alice.address, bob.address] }),
      ]),
    });
    await expect(execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, bob])).to.not.be.reverted;

    // Remove Bob, who rule 001 names. Safe's owner linked list runs SENTINEL → alice → bob →
    // charlie, so Bob's prevOwner is Alice. Threshold stays 2 (alice + charlie can still reach it),
    // which is what makes this the interesting case: the VAULT can still act, but the RULE cannot
    // be satisfied, and the guard must not silently treat "2 of 2 remaining owners" as enough.
    const removeBob = singleton.interface.encodeFunctionData("removeOwner", [alice.address, bob.address, 2n]);
    await execAsOwners(vault, { to: vault.target, data: removeBob }, [alice, bob]);
    expect(await vault.isOwner(bob.address)).to.equal(false);

    await expect(
      execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, charlie]),
    ).to.be.revertedWithCustomError(guard, "RuleApproversMissing");

    // The vault is not stuck: owners amend the policy and funds move again (FR-021).
    await execAsOwners(
      vault,
      { to: guard.target, data: setRulesCalldata([rule({ asset: NATIVE, perTxLimit: ethers.parseEther("10"), approvers: [alice.address, charlie.address] })]) },
      [alice, charlie],
    );
    await expect(execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, charlie])).to.not.be.reverted;
  });

  it("US4/FR-017: a threshold-approved reorder changes which rule governs", async () => {
    // 001 bans everything over 1 (banded); 002 allows up to 10 with both owners.
    const strict = rule({ asset: NATIVE, perTxLimit: ONE, banded: true, approvers: [alice.address], approvalsRequired: 1 });
    const loose = rule({
      asset: NATIVE, perTxLimit: ethers.parseEther("10"), banded: true, approvers: [alice.address, bob.address],
    });
    const vault = await createVault({ setupTo: setup.target, setupData: enablePolicyCalldata([strict, loose]) });

    // A 5-unit transfer falls in the second band and needs both owners.
    await expect(
      execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("5") }, [alice, charlie]),
    ).to.be.revertedWithCustomError(guard, "RuleApproversMissing");

    // Reorder so the wider band (which now covers ≤ 10 including 5) comes first, needing both.
    // Swapping bands changes which rule a boundary transaction lands in — the point of ordering.
    await execAsOwners(
      vault,
      { to: guard.target, data: setRulesCalldata([loose, strict]) },
      [alice, bob],
    );
    const [rules] = await guard.getRules(vault.target);
    expect(rules[0].perTxLimit).to.equal(ethers.parseEther("10"));

    // A 1-unit transfer now lands in rule 001 (the wide band) and needs BOTH owners, where before
    // it was governed by the strict single-approver rule.
    await expect(
      execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, charlie]),
    ).to.be.revertedWithCustomError(guard, "RuleApproversMissing");
    await expect(execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, bob])).to.not.be.reverted;
  });

  it("FR-020: a v1-guarded vault adopts V2 through a threshold-approved two-step", async () => {
    // Start on the v1 guard with a strict per-tx limit.
    const v1Configure = guardV1.interface.encodeFunctionData("configureRules", [
      [{ asset: NATIVE, perTxLimit: ONE, windowLimit: 0n }], 0, false, [], [],
    ]);
    const v1Setup = setup.interface.encodeFunctionData("enablePolicy", [guardV1.target, v1Configure]);
    const vault = await createVault({ setupTo: setup.target, setupData: v1Setup });
    await expect(
      execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("5") }, [alice, bob]),
    ).to.be.revertedWithCustomError(guardV1, "PerTxLimitExceeded");

    // Step 1: configure V2 rules (inert — V2 is not this vault's guard yet).
    await execAsOwners(
      vault,
      { to: guard.target, data: setRulesCalldata([rule({ asset: NATIVE, perTxLimit: ethers.parseEther("10") })]) },
      [alice, bob],
    );
    // Step 2: point the vault's guard slot at V2.
    const setGuard = singleton.interface.encodeFunctionData("setGuard", [guard.target]);
    await execAsOwners(vault, { to: vault.target, data: setGuard }, [alice, bob]);

    // The V2 policy now governs; the v1 limit is inert.
    await expect(execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("5") }, [alice, bob])).to.not.be
      .reverted;
  });

  it("FR-021: owners can always loosen a policy that turned out to be too strict", async () => {
    // A deny-almost-everything policy: nothing above 1 wei matches any rule.
    const vault = await createVault({
      setupTo: setup.target,
      setupData: enablePolicyCalldata([rule({ asset: NATIVE, perTxLimit: 1n, banded: true })]),
    });
    await expect(
      execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, bob]),
    ).to.be.revertedWithCustomError(guard, "NoRuleMatches");

    // Policy management is never blocked by fund rules.
    await execAsOwners(
      vault,
      { to: guard.target, data: setRulesCalldata([rule({ asset: ANY })]) },
      [alice, bob],
    );
    await expect(execAsOwners(vault, { to: recipient.address, value: ONE }, [alice, bob])).to.not.be.reverted;
  });

  it("FR-020: a vault with no guard behaves exactly as a stock Safe", async () => {
    const vault = await createVault();
    await expect(execAsOwners(vault, { to: recipient.address, value: ethers.parseEther("25") }, [alice, bob])).to.not.be
      .reverted;
  });
});
