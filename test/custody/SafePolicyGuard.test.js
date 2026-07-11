const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Spec 049 — SafePolicyGuard unit suite. The guard treats msg.sender as the Safe, so a plain
// signer stands in as the "vault" for rule-logic tests; MockSafe covers the Safe-shaped
// execTransaction flow. Covers every FR-002 rule alone and combined (SC-002), the lockout-proof
// exemptions under a maximally strict policy (SC-003), the delegatecall / gas-refund / value-to-
// guard hard denials, msg.sender authority, FR-015 config validation, typed error payloads, and
// previewTransaction parity with enforcement.

const NATIVE = ethers.ZeroAddress;
const DAY = 24 * 60 * 60;

const erc20 = new ethers.Interface([
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
]);

/** configureRules with keyword-ish defaults so tests read as intent. */
function cfg({ limits = [], cooldown = 0, allowlistEnabled = false, add = [], remove = [] } = {}) {
  return [limits, cooldown, allowlistEnabled, add, remove];
}

/** checkTransaction with only the fields the guard evaluates. */
function checkArgs({ to, value = 0n, data = "0x", operation = 0, gasPrice = 0n, sender = ethers.ZeroAddress }) {
  return [to, value, data, operation, 0, 0, gasPrice, ethers.ZeroAddress, ethers.ZeroAddress, "0x", sender];
}

describe("SafePolicyGuard", function () {
  let guard, safe, other, recipient, stranger, token;

  beforeEach(async () => {
    [safe, other, recipient, stranger] = await ethers.getSigners();
    guard = await (await ethers.getContractFactory("SafePolicyGuard")).deploy();
    await guard.waitForDeployment();
    token = ethers.getAddress("0x00000000000000000000000000000000000c0ffe"); // classification never calls the token
  });

  // ------------------------------------------------------------------ ERC-165 / interface

  it("supports the Safe guard interface id and ERC-165 (GS300 acceptance)", async () => {
    // XOR of checkTransaction + checkAfterExecution selectors = Safe v1.4.1 Guard interface id.
    const ct = ethers.dataSlice(ethers.id("checkTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes,address)"), 0, 4);
    const cae = ethers.dataSlice(ethers.id("checkAfterExecution(bytes32,bool)"), 0, 4);
    const guardId = ethers.toBeHex(BigInt(ct) ^ BigInt(cae), 4);
    expect(await guard.supportsInterface(guardId)).to.equal(true);
    expect(await guard.supportsInterface("0x01ffc9a7")).to.equal(true);
    expect(await guard.supportsInterface("0xdeadbeef")).to.equal(false);
  });

  // ------------------------------------------------------------------ configuration authority

  it("scopes all configuration to msg.sender — one vault cannot touch another's policy", async () => {
    await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: NATIVE, perTxLimit: 100n, windowLimit: 0n }] }));
    const mine = await guard.getPolicy(safe.address);
    const theirs = await guard.getPolicy(other.address);
    expect(mine.hasRules).to.equal(true);
    expect(theirs.hasRules).to.equal(false);
  });

  it("emits config events and reflects state in views", async () => {
    await expect(
      guard.connect(safe).configureRules(
        ...cfg({
          limits: [{ asset: NATIVE, perTxLimit: 100n, windowLimit: 500n }],
          cooldown: 3600,
          allowlistEnabled: true,
          add: [recipient.address],
        }),
      ),
    )
      .to.emit(guard, "RulesConfigured").withArgs(safe.address, NATIVE, 100n, 500n)
      .and.to.emit(guard, "CooldownSet").withArgs(safe.address, 3600)
      .and.to.emit(guard, "AllowlistEnabled").withArgs(safe.address, true)
      .and.to.emit(guard, "AllowlistChanged").withArgs(safe.address, recipient.address, true);

    const p = await guard.getPolicy(safe.address);
    expect(p.hasRules).to.equal(true);
    expect(p.allowlistEnabled).to.equal(true);
    expect(p.allowlistCount).to.equal(3n - 2n); // 1
    expect(p.cooldown).to.equal(3600n);
    expect(p.configuredAssets).to.deep.equal([NATIVE]);
    const r = await guard.getAssetRule(safe.address, NATIVE);
    expect(r.perTxLimit).to.equal(100n);
    expect(r.windowLimit).to.equal(500n);
    expect(await guard.getAllowlist(safe.address)).to.deep.equal([recipient.address]);
    expect(await guard.isAllowlisted(safe.address, recipient.address)).to.equal(true);
  });

  it("FR-015: rejects enabling the allowlist with zero entries (no accidental deny-all)", async () => {
    await expect(guard.connect(safe).configureRules(...cfg({ allowlistEnabled: true })))
      .to.be.revertedWithCustomError(guard, "EmptyAllowlist");
    // ...including when the same call removes the last entry.
    await guard.connect(safe).configureRules(...cfg({ allowlistEnabled: true, add: [recipient.address] }));
    await expect(
      guard.connect(safe).configureRules(...cfg({ allowlistEnabled: true, remove: [recipient.address] })),
    ).to.be.revertedWithCustomError(guard, "EmptyAllowlist");
  });

  it("FR-015: rejects a cooldown beyond 365 days and oversized batches", async () => {
    await expect(guard.connect(safe).configureRules(...cfg({ cooldown: 366 * DAY })))
      .to.be.revertedWithCustomError(guard, "CooldownTooLong");
    const many = Array.from({ length: 65 }, (_, i) => ethers.getAddress(ethers.toBeHex(i + 1, 20)));
    await expect(guard.connect(safe).configureRules(...cfg({ add: many })))
      .to.be.revertedWithCustomError(guard, "AllowlistBatchTooLarge");
  });

  it("bounds configured assets at MAX_ASSETS and clears cleanly", async () => {
    const limits = Array.from({ length: 16 }, (_, i) => ({
      asset: ethers.getAddress(ethers.toBeHex(i + 1, 20)),
      perTxLimit: 1n,
      windowLimit: 0n,
    }));
    await guard.connect(safe).configureRules(...cfg({ limits }));
    await expect(
      guard.connect(safe).configureRules(...cfg({ limits: [{ asset: token, perTxLimit: 1n, windowLimit: 0n }] })),
    ).to.be.revertedWithCustomError(guard, "TooManyAssets");
    // Clearing an asset (both limits zero) frees a slot and resets live window state.
    await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: limits[0].asset, perTxLimit: 0n, windowLimit: 0n }] }));
    await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: token, perTxLimit: 1n, windowLimit: 0n }] }));
    expect((await guard.getPolicy(safe.address)).configuredAssets).to.have.length(16);
  });

  it("allowlist removal keeps enumeration consistent (swap-and-pop)", async () => {
    const [a, b, c] = [other.address, recipient.address, stranger.address];
    await guard.connect(safe).configureRules(...cfg({ add: [a, b, c] }));
    await guard.connect(safe).configureRules(...cfg({ remove: [a] }));
    const list = await guard.getAllowlist(safe.address);
    expect([...list].sort()).to.deep.equal([b, c].sort());
    expect(await guard.isAllowlisted(safe.address, a)).to.equal(false);
    expect((await guard.getPolicy(safe.address)).allowlistCount).to.equal(2n);
    // Re-add after removal round-trips.
    await guard.connect(safe).configureRules(...cfg({ add: [a] }));
    expect(await guard.isAllowlisted(safe.address, a)).to.equal(true);
  });

  // ------------------------------------------------------------------ no-policy passthrough

  it("FR-010: passes everything through for a vault with no rules", async () => {
    await expect(
      guard.connect(safe).checkTransaction(...checkArgs({ to: stranger.address, value: ethers.parseEther("1000") })),
    ).to.not.be.reverted;
    // Even delegatecall and gas refunds — the hard denials only arm once a policy exists.
    await expect(
      guard.connect(safe).checkTransaction(...checkArgs({ to: stranger.address, operation: 1, gasPrice: 1n })),
    ).to.not.be.reverted;
  });

  // ------------------------------------------------------------------ per-transaction limit

  describe("per-transaction limit", () => {
    beforeEach(async () => {
      await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: NATIVE, perTxLimit: 100n, windowLimit: 0n }] }));
    });

    it("blocks an over-limit native transfer with the typed error payload", async () => {
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 101n })))
        .to.be.revertedWithCustomError(guard, "PerTxLimitExceeded")
        .withArgs(NATIVE, 101n, 100n);
    });

    it("allows exactly at the limit", async () => {
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 100n })))
        .to.not.be.reverted;
    });

    it("values token transfer, transferFrom, and approve against the token's own limit", async () => {
      await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: token, perTxLimit: 50n, windowLimit: 0n }] }));
      const over = [
        erc20.encodeFunctionData("transfer", [recipient.address, 51n]),
        erc20.encodeFunctionData("transferFrom", [safe.address, recipient.address, 51n]),
        erc20.encodeFunctionData("approve", [recipient.address, 51n]),
      ];
      for (const data of over) {
        await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: token, data })))
          .to.be.revertedWithCustomError(guard, "PerTxLimitExceeded")
          .withArgs(token, 51n, 50n);
      }
      await expect(
        guard.connect(safe).checkTransaction(...checkArgs({ to: token, data: erc20.encodeFunctionData("transfer", [recipient.address, 50n]) })),
      ).to.not.be.reverted;
    });

    it("classifies token calldata with extra trailing bytes exactly as the token would execute it", async () => {
      // Solidity functions ignore extra trailing calldata for static args; the guard slices the
      // canonical words so padded calldata neither bypasses classification nor spuriously blocks.
      const padded = erc20.encodeFunctionData("transfer", [recipient.address, 101n]) + "ab".repeat(13);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: token, data: padded })))
        .to.not.be.reverted; // token unconfigured for limits here — but classification must not revert
      await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: token, perTxLimit: 50n, windowLimit: 0n }] }));
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: token, data: padded })))
        .to.be.revertedWithCustomError(guard, "PerTxLimitExceeded")
        .withArgs(token, 101n, 50n);
    });

    it("leaves unconfigured assets unvalued (disclosed passthrough)", async () => {
      const otherToken = ethers.getAddress("0x00000000000000000000000000000000000dead1");
      const data = erc20.encodeFunctionData("transfer", [recipient.address, ethers.MaxUint256]);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: otherToken, data }))).to.not.be.reverted;
    });

    it("checks native and token legs independently in one transaction", async () => {
      await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: token, perTxLimit: 50n, windowLimit: 0n }] }));
      const data = erc20.encodeFunctionData("transfer", [recipient.address, 10n]);
      // token leg fine (10 ≤ 50) but native leg over (101 > 100)
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: token, value: 101n, data })))
        .to.be.revertedWithCustomError(guard, "PerTxLimitExceeded")
        .withArgs(NATIVE, 101n, 100n);
    });
  });

  // ------------------------------------------------------------------ 24h window limit

  describe("window limit", () => {
    beforeEach(async () => {
      await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: NATIVE, perTxLimit: 0n, windowLimit: 100n }] }));
    });

    it("accumulates spends and blocks when the window is exhausted, reporting remaining", async () => {
      await guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 60n }));
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 41n })))
        .to.be.revertedWithCustomError(guard, "WindowLimitExceeded")
        .withArgs(NATIVE, 41n, 40n);
      expect(await guard.remainingInWindow(safe.address, NATIVE)).to.equal(40n);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 40n })))
        .to.not.be.reverted;
      expect(await guard.remainingInWindow(safe.address, NATIVE)).to.equal(0n);
    });

    it("resets 24h after the window opened (boundary-exact)", async () => {
      await guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 100n }));
      const { windowStart } = await guard.getAssetRule(safe.address, NATIVE);
      // One second before the boundary: still closed.
      await time.setNextBlockTimestamp(Number(windowStart) + DAY - 1);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 1n })))
        .to.be.revertedWithCustomError(guard, "WindowLimitExceeded");
      // At the boundary: fresh window.
      await time.setNextBlockTimestamp(Number(windowStart) + DAY);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 100n })))
        .to.not.be.reverted;
      const after = await guard.getAssetRule(safe.address, NATIVE);
      expect(after.spentInWindow).to.equal(100n);
      expect(after.windowStart).to.be.greaterThan(windowStart);
    });

    it("remainingInWindow reports the full limit for an elapsed window without a write", async () => {
      await guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 100n }));
      await time.increase(DAY + 1);
      expect(await guard.remainingInWindow(safe.address, NATIVE)).to.equal(100n);
    });

    it("returns max-uint for assets with no window limit", async () => {
      expect(await guard.remainingInWindow(safe.address, token)).to.equal(ethers.MaxUint256);
    });

    it("an amount that can never fit (> uint128 window limit) is rejected, not wrapped", async () => {
      await expect(
        guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: ethers.MaxUint256 })),
      ).to.be.revertedWithCustomError(guard, "WindowLimitExceeded");
    });
  });

  // ------------------------------------------------------------------ allowlist

  describe("recipient allowlist", () => {
    beforeEach(async () => {
      await guard.connect(safe).configureRules(...cfg({ allowlistEnabled: true, add: [recipient.address, token] }));
    });

    it("blocks native transfers to non-allowlisted targets, allows allowlisted", async () => {
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: stranger.address, value: 1n })))
        .to.be.revertedWithCustomError(guard, "RecipientNotAllowed")
        .withArgs(stranger.address);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 1n })))
        .to.not.be.reverted;
    });

    it("gates the DECODED beneficiary for token actions (transfer/transferFrom/approve)", async () => {
      const bad = [
        erc20.encodeFunctionData("transfer", [stranger.address, 1n]),
        erc20.encodeFunctionData("transferFrom", [safe.address, stranger.address, 1n]),
        erc20.encodeFunctionData("approve", [stranger.address, 1n]),
      ];
      for (const data of bad) {
        await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: token, data })))
          .to.be.revertedWithCustomError(guard, "RecipientNotAllowed")
          .withArgs(stranger.address);
      }
      await expect(
        guard.connect(safe).checkTransaction(...checkArgs({ to: token, data: erc20.encodeFunctionData("transfer", [recipient.address, 1n]) })),
      ).to.not.be.reverted;
    });

    it("gates the call target for generic (unrecognized) calldata — no escape hatch", async () => {
      const data = "0x12345678aabbcc";
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: stranger.address, data })))
        .to.be.revertedWithCustomError(guard, "RecipientNotAllowed")
        .withArgs(stranger.address);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, data })))
        .to.not.be.reverted;
    });

    it("native value riding a token call additionally gates the token target", async () => {
      const nonListedToken = ethers.getAddress("0x00000000000000000000000000000000000dead1");
      const data = erc20.encodeFunctionData("transfer", [recipient.address, 1n]);
      // Recipient allowlisted, but the native leg pays the (unlisted) token contract.
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: nonListedToken, value: 1n, data })))
        .to.be.revertedWithCustomError(guard, "RecipientNotAllowed")
        .withArgs(nonListedToken);
    });
  });

  // ------------------------------------------------------------------ cooldown

  describe("cooldown", () => {
    beforeEach(async () => {
      await guard.connect(safe).configureRules(...cfg({ cooldown: 3600 }));
    });

    it("blocks a second counted transaction inside the cooldown, reporting nextAllowedAt", async () => {
      await guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 1n }));
      const next = await guard.nextAllowedAt(safe.address);
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 1n })))
        .to.be.revertedWithCustomError(guard, "CooldownActive")
        .withArgs(next);
      await time.setNextBlockTimestamp(Number(next));
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 1n })))
        .to.not.be.reverted;
    });

    it("does not rate-limit non-fund calls (value 0, unrecognized calldata)", async () => {
      await guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 1n }));
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: stranger.address, data: "0x12345678" })))
        .to.not.be.reverted;
    });

    it("counts token actions", async () => {
      const data = erc20.encodeFunctionData("transfer", [recipient.address, 1n]);
      await guard.connect(safe).checkTransaction(...checkArgs({ to: token, data }));
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: token, data })))
        .to.be.revertedWithCustomError(guard, "CooldownActive");
    });
  });

  // ------------------------------------------------------------------ hard denials

  describe("hard denials while a policy is active", () => {
    beforeEach(async () => {
      await guard.connect(safe).configureRules(...cfg({ cooldown: 1 }));
    });

    it("rejects delegatecall (guard-bypass channel)", async () => {
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, operation: 1 })))
        .to.be.revertedWithCustomError(guard, "DelegatecallBlocked");
    });

    it("rejects gas-refund transactions (uncounted outflow)", async () => {
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, gasPrice: 1n })))
        .to.be.revertedWithCustomError(guard, "GasRefundBlocked");
    });
  });

  // ------------------------------------------------------------------ lockout-proof exemptions

  describe("lockout-proofing (FR-008 / SC-003) under a maximally strict policy", () => {
    beforeEach(async () => {
      // Strictest expressible policy: 1-wei limits, tiny window, huge cooldown, 1-entry allowlist.
      await guard.connect(safe).configureRules(
        ...cfg({
          limits: [{ asset: NATIVE, perTxLimit: 1n, windowLimit: 1n }],
          cooldown: 365 * DAY,
          allowlistEnabled: true,
          add: [other.address],
        }),
      );
      // Exhaust everything.
      await guard.connect(safe).checkTransaction(...checkArgs({ to: other.address, value: 1n }));
    });

    it("still allows Safe self-management transactions (owners, threshold, setGuard)", async () => {
      await expect(
        guard.connect(safe).checkTransaction(...checkArgs({ to: safe.address, value: 5n, data: "0x deadbeef".replace(" ", "") })),
      ).to.not.be.reverted;
    });

    it("still allows policy-configuration calls to the guard, and a loosening change works", async () => {
      const target = await guard.getAddress();
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: target, data: "0x12345678" })))
        .to.not.be.reverted;
      // The loosening itself (direct config call as the vault) executes despite the strict rules.
      await guard.connect(safe).configureRules(...cfg({ limits: [{ asset: NATIVE, perTxLimit: 0n, windowLimit: 0n }], cooldown: 0, allowlistEnabled: false }));
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: stranger.address, value: ethers.parseEther("1") })))
        .to.not.be.reverted;
    });

    it("rejects native value sent TO the guard (guard holds no funds)", async () => {
      const target = await guard.getAddress();
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: target, value: 1n })))
        .to.be.revertedWithCustomError(guard, "ValueToGuardBlocked");
    });
  });

  // ------------------------------------------------------------------ preview parity

  describe("previewTransaction (FR-011/FR-012)", () => {
    beforeEach(async () => {
      await guard.connect(safe).configureRules(
        ...cfg({ limits: [{ asset: NATIVE, perTxLimit: 100n, windowLimit: 0n }], allowlistEnabled: true, add: [recipient.address] }),
      );
    });

    it("returns ok for a compliant transaction and writes no state", async () => {
      const [ok, data] = await guard.previewTransaction(safe.address, recipient.address, 100n, "0x", 0);
      expect(ok).to.equal(true);
      expect(data).to.equal("0x");
    });

    it("returns the exact revert data enforcement would produce", async () => {
      const [ok, data] = await guard.previewTransaction(safe.address, recipient.address, 101n, "0x", 0);
      expect(ok).to.equal(false);
      const expected = guard.interface.encodeErrorResult("PerTxLimitExceeded", [NATIVE, 101n, 100n]);
      expect(data).to.equal(expected);
      // Enforcement parity: same call through checkTransaction reverts with the same error.
      await expect(guard.connect(safe).checkTransaction(...checkArgs({ to: recipient.address, value: 101n })))
        .to.be.revertedWithCustomError(guard, "PerTxLimitExceeded")
        .withArgs(NATIVE, 101n, 100n);
    });

    it("previews allowlist violations for third parties (read-only, any caller)", async () => {
      const [ok, data] = await guard.connect(stranger).previewTransaction(safe.address, stranger.address, 1n, "0x", 0);
      expect(ok).to.equal(false);
      expect(data).to.equal(guard.interface.encodeErrorResult("RecipientNotAllowed", [stranger.address]));
    });

    it("reports exemptions as ok", async () => {
      const [ok] = await guard.previewTransaction(safe.address, safe.address, 0n, "0x", 0);
      expect(ok).to.equal(true);
    });
  });

  // ------------------------------------------------------------------ Safe-shaped flow via MockSafe

  describe("MockSafe execTransaction flow", () => {
    let mockSafe, mockSafeAddr, guardAddr;

    beforeEach(async () => {
      mockSafe = await (await ethers.getContractFactory("MockSafe")).deploy();
      await mockSafe.waitForDeployment();
      mockSafeAddr = await mockSafe.getAddress();
      guardAddr = await guard.getAddress();
      await mockSafe.setGuard(guardAddr);
      await safe.sendTransaction({ to: mockSafeAddr, value: ethers.parseEther("1") });
      // Configure via the Safe-shaped path: the vault calls the guard about itself (exempt target).
      const configure = guard.interface.encodeFunctionData("configureRules", [
        [{ asset: NATIVE, perTxLimit: 100n, windowLimit: 0n }], 0, false, [], [],
      ]);
      await mockSafe.execTransactionMock(guardAddr, 0, configure, 0, 0);
    });

    it("configured through its own execution path, the vault's policy is live", async () => {
      const p = await guard.getPolicy(mockSafeAddr);
      expect(p.hasRules).to.equal(true);
    });

    it("blocks an approved over-limit execution end-to-end and allows a compliant one", async () => {
      await expect(mockSafe.execTransactionMock(recipient.address, 101n, "0x", 0, 0))
        .to.be.revertedWithCustomError(guard, "PerTxLimitExceeded");
      const before = await ethers.provider.getBalance(recipient.address);
      await mockSafe.execTransactionMock(recipient.address, 100n, "0x", 0, 0);
      expect(await ethers.provider.getBalance(recipient.address)).to.equal(before + 100n);
    });

    it("blocks delegatecall executions for the policy-managed vault", async () => {
      await expect(mockSafe.execTransactionMock(recipient.address, 0, "0x", 1, 0))
        .to.be.revertedWithCustomError(guard, "DelegatecallBlocked");
    });
  });
});
