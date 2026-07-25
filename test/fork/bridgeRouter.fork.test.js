const { expect } = require("chai");
const { ethers, network } = require("hardhat");

/**
 * BridgeRouter fork tests (spec 067, tasks T036-T039).
 *
 * Runs against the REAL Across SpokePool on a forked chain, so the assertions are made against
 * Across's own event encoding rather than a mock's.
 *
 * ── T038 IS MERGE-BLOCKING ──────────────────────────────────────────────────────────────────
 * Across refunds a deposit no relayer fills by `fillDeadline` to the `depositor` address on the
 * ORIGIN chain. If BridgeRouter passed its own address as `depositor`, every unfilled bridge would
 * refund into a contract with no per-member accounting and no withdrawal path — silently, only on
 * the unhappy path, in production, with real money. The happy-path fill test (T036) passes either
 * way, so T038 is the only signal. Do not skip or quarantine it.
 *
 * SCOPE NOTE (a correction to the task as originally written):
 * The plan's T038 said "let it expire and assert the refund lands on the member's address". That is
 * not reproducible in a fork test: an Across refund requires an off-chain dataworker to propose a
 * root bundle on L1, UMA liveness to elapse, and `executeRootBundle` to relay merkle-proved refund
 * leaves back to the SpokePool. Reproducing that would be testing ACROSS's machinery, not ours.
 *
 * What we own — and the only thing we can get wrong — is the `depositor` field recorded in the
 * deposit event, because that is the value Across's bundle logic reads to decide who gets refunded.
 * So T038 asserts exactly that, against the real SpokePool's real event. Equivalent strength, and
 * more robust than a staged expiry because it does not depend on Across's off-chain components.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * REQUIREMENTS TO RUN
 *   These need an ARCHIVE-capable RPC per chain. Public endpoints are NOT sufficient: they serve
 *   plain reads but reject the historical/state methods hardhat's fork uses (observed: HTTP 403
 *   from polygon-bor-rpc.publicnode.com). Set real endpoints:
 *
 *     POLYGON_RPC_URL=...  ARBITRUM_RPC_URL=...  BASE_RPC_URL=...  MAINNET_RPC_URL=...
 *
 *   Forking a non-Ethereum chain also needs a hardfork-activation history, or any call made AT the
 *   fork block throws "No known hardfork for execution on historical block N". `resetFork()` below
 *   handles it by mining one block after the reset; `hardhat.config.js` additionally declares a
 *   `chains` history for 10/137/8453/42161. Use `resetFork`, not a bare `hardhat_reset`.
 *
 *   Without those endpoints this whole suite SKIPS. A skip is not a pass: T038's merge gate is
 *   unsatisfied until this file has actually run green.
 */

// Verified on-chain (scripts/ops/verify-protocol-addresses.js). Note Polygon and Arbitrum share the
// canonical Uniswap addresses but NOT the SpokePool — every one of these is chain-specific.
const CHAINS = {
  polygon: {
    chainId: 137,
    rpcEnv: "POLYGON_RPC_URL",
    spokePool: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    wnative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    destinationChainId: 1,
    destinationUsdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  base: {
    chainId: 8453,
    rpcEnv: "BASE_RPC_URL",
    spokePool: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    wnative: "0x4200000000000000000000000000000000000006",
    // Base → Arbitrum: an L2→L2 route that never touches L1 from the member's perspective (T037).
    destinationChainId: 42161,
    destinationUsdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
};

const FEE_CAP_BPS = 250;

/**
 * Reset onto a fork and immediately mine one block.
 *
 * The mine is required, not cosmetic. Hardhat only consults its hardfork-activation history for
 * blocks at or below the fork block; anything above uses the configured hardfork. An `eth_call` made
 * AT the fork block therefore throws "No known hardfork for execution on historical block N" unless
 * a full activation history is configured for that chain. Mining once moves the head past the fork
 * block so every subsequent read and call is in the safe range.
 *
 * (`hardhat.config.js` also declares a `chains` history for these networks, but it is not applied on
 * a runtime `hardhat_reset` — only at provider construction. This is the reliable fix.)
 */
async function resetFork(rpcUrl) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: rpcUrl } }],
  });
  await network.provider.send("evm_mine", []);
}


/**
 * Give `account` an ERC-20 balance by writing the balances mapping directly.
 *
 * The balance slot differs per token (Polygon's native USDC is a proxy over FiatTokenV2_2, which
 * packs the blacklist flag into the balance slot at 9), so we probe. Each probe is wrapped in an
 * evm_snapshot/evm_revert: a wrong guess would otherwise write over a proxy's implementation or
 * admin slot and leave the fork subtly corrupted for every later assertion. Probing destructively
 * was the first version of this helper and it broke exactly that way.
 */
async function dealErc20(token, account, amount) {
  const erc20 = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    token
  );
  const candidates = [9, 0, 1, 2, 3, 4, 5, 51];
  let found = null;

  for (const slot of candidates) {
    const snapshot = await network.provider.send("evm_snapshot", []);
    try {
      const key = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [account, slot])
      );
      await network.provider.send("hardhat_setStorageAt", [token, key, ethers.toBeHex(amount, 32)]);
      if ((await erc20.balanceOf(account)) === amount) found = slot;
    } catch {
      // A corrupting write can make balanceOf revert — that just means it is the wrong slot.
    }
    await network.provider.send("evm_revert", [snapshot]);
    if (found !== null) break;
  }

  if (found === null) throw new Error(`dealErc20: could not locate the balance slot for ${token}`);

  const key = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [account, found])
  );
  await network.provider.send("hardhat_setStorageAt", [token, key, ethers.toBeHex(amount, 32)]);
  if ((await erc20.balanceOf(account)) !== amount) {
    throw new Error(`dealErc20: slot ${found} did not stick for ${token}`);
  }
}

async function deployStack(cfg, admin) {
  // Real FeeRouter (spec 060) so the fee path is exercised end to end, not stubbed.
  const FeeRouter = await ethers.getContractFactory("FeeRouter");
  const feeRouter = await upgradeProxy(FeeRouter, [admin.address, admin.address]);
  await feeRouter.registerService(ethers.id("bridge.transfer"), FEE_CAP_BPS, 2 /* ConfigOnly — see deploy-bridge-liquidity.js */);

  const BridgeRouter = await ethers.getContractFactory("BridgeRouter");
  const router = await upgradeProxy(BridgeRouter, [
    admin.address,
    await feeRouter.getAddress(),
    cfg.spokePool,
    ethers.ZeroAddress, // no sanctions guard on the fork; screening is unit-tested
  ]);
  return { feeRouter, router };
}

/** Deploy a UUPS proxy the same way the deploy scripts do. */
async function upgradeProxy(factory, args) {
  const { upgrades } = require("hardhat");
  const proxy = await upgrades.deployProxy(factory, args, { kind: "uups" });
  await proxy.waitForDeployment();
  return proxy;
}

for (const [name, cfg] of Object.entries(CHAINS)) {
  const rpc = process.env[cfg.rpcEnv];
  const describeFork = rpc ? describe : describe.skip;

  describeFork(`BridgeRouter fork — ${name} (${cfg.chainId})`, function () {
    this.timeout(300_000);

    let admin, member, router, feeRouter, usdc;

    before(async function () {
      await resetFork(rpc);
      [admin, member] = await ethers.getSigners();
      ({ feeRouter, router } = await deployStack(cfg, admin));

      usdc = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        cfg.usdc
      );

      // Curate the route under test.
      await router.setRoute({
        inputToken: cfg.usdc,
        enabled: true,
        nativeInput: false,
        expectedFillSeconds: 300,
        outputToken: cfg.destinationUsdc,
        destinationChainId: cfg.destinationChainId,
        maxAmount: 0,
      });
    });

    after(async function () {
      await network.provider.request({ method: "hardhat_reset", params: [] });
    });

    async function bridge({ amount, maxFeeBps = FEE_CAP_BPS, from = member }) {
      const routeId = await router.computeRouteId(cfg.usdc, cfg.destinationUsdc, cfg.destinationChainId);
      await dealErc20(cfg.usdc, from.address, amount);
      await usdc.connect(from).approve(await router.getAddress(), amount);
      const block = await ethers.provider.getBlock("latest");
      return router.connect(from).bridgeWithFee(
        routeId,
        amount,
        (amount * 995n) / 1000n, // outputAmount — the spread is Across's LP+relayer fee
        from.address,
        block.timestamp,
        block.timestamp + 3600,
        0,
        ethers.ZeroAddress,
        maxFeeBps
      );
    }

    // ---------------------------------------------------------------- T036
    it("bridges USDC through the real SpokePool, fee to treasury, router balance zero", async () => {
      const amount = 100_000_000n; // 100 USDC
      await feeRouter.setFeeBps(ethers.id("bridge.transfer"), 50); // 0.5%

      const treasuryBefore = await usdc.balanceOf(admin.address);
      await expect(bridge({ amount })).to.emit(router, "BridgeInitiated");

      expect(await usdc.balanceOf(admin.address)).to.equal(treasuryBefore + amount / 200n);
      expect(await usdc.balanceOf(await router.getAddress())).to.equal(0n);
      expect(await usdc.allowance(await router.getAddress(), cfg.spokePool)).to.equal(0n);
    });

    // ---------------------------------------------------------------- T038 (MERGE-BLOCKING)
    it("records the MEMBER as depositor on the real SpokePool — not the router", async () => {
      const amount = 50_000_000n;
      const tx = await bridge({ amount });
      const receipt = await tx.wait();

      // Across's deposit event, decoded from the REAL SpokePool's logs. The `depositor` topic is
      // what Across's bundle logic reads to decide who an expired deposit refunds to.
      const spoke = new ethers.Interface([
        "event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint32 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address indexed depositor, address recipient, address exclusiveRelayer, bytes message)",
        "event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)",
      ]);

      let sawDeposit = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== cfg.spokePool.toLowerCase()) continue;
        let parsed;
        try {
          parsed = spoke.parseLog(log);
        } catch {
          continue;
        }
        if (!parsed) continue;
        sawDeposit = true;
        // bytes32-flavoured (newer) events left-pad the address.
        const depositor = ethers.getAddress("0x" + parsed.args.depositor.toString().slice(-40));
        expect(depositor).to.equal(member.address);
        expect(depositor).to.not.equal(await router.getAddress());
      }
      expect(sawDeposit, "no SpokePool deposit event found — the bridge did not reach Across").to.be
        .true;

      // Belt and braces: our own event records the same value, so an indexer can audit the property
      // without decoding Across's log.
      const routerAddress = (await router.getAddress()).toLowerCase();
      const initiated = receipt.logs
        .filter((l) => l.address.toLowerCase() === routerAddress)
        .map((l) => {
          try {
            return router.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p) => p && p.name === "BridgeInitiated");
      expect(initiated.args.depositor).to.equal(member.address);
    });

    // ---------------------------------------------------------------- T039
    it("reverts FeeAboveQuoted when the live rate exceeds the quoted ceiling", async () => {
      await feeRouter.setFeeBps(ethers.id("bridge.transfer"), 100); // 1%
      await expect(bridge({ amount: 10_000_000n, maxFeeBps: 50 })).to.be.revertedWithCustomError(
        router,
        "FeeAboveQuoted"
      );
    });

    it("charges nothing and moves no treasury funds at a zero rate (FR-029)", async () => {
      await feeRouter.setFeeBps(ethers.id("bridge.transfer"), 0);
      const treasuryBefore = await usdc.balanceOf(admin.address);
      await bridge({ amount: 10_000_000n });
      expect(await usdc.balanceOf(admin.address)).to.equal(treasuryBefore);
      expect(await usdc.balanceOf(await router.getAddress())).to.equal(0n);
    });
  });
}
