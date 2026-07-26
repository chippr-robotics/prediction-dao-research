/**
 * verify.js — Source-verify the deployed FairWins contracts on the active network's
 * block explorer, and ACCOUNT FOR EVERY ADDRESS in that network's deployments record.
 *
 * Supported networks (family + key handling live in scripts/deploy/lib/explorers.js):
 *   - Ethereum 1, Optimism 10, Polygon 137, Base 8453, Arbitrum One 42161, Amoy 80002
 *     -> Etherscan API V2, one ETHERSCAN_API_KEY for all of them
 *   - Ethereum Classic 61, Mordor 63 -> Blockscout, no API key
 *
 * ── WHY THIS SCRIPT IS SHAPED THE WAY IT IS ────────────────────────────────────────────
 * The previous version built its plan with an `add()` helper that RETURNED EARLY when an
 * address was absent. That is fine for "this network has no UMA adapter" and catastrophic
 * for everything else: eight contracts (feeRouter, stakingRouter, bridgeRouter,
 * liquidityRouter, callsignRegistry, wagerPoolFactory, accountFactory, verifyingPaymaster)
 * had no entry at all, so `npm run verify:polygon` exited 0 having verified NOTHING NEW and
 * printed a cheerful "Done". A verification tool that reports success without verifying is
 * worse than no tool: it manufactures confidence at the exact moment someone is checking
 * whether a mainnet deploy is sound.
 *
 * So the plan is now built by ENUMERATING THE RECORD, not by listing what we remembered to
 * add. Every key under `contracts` and `mocks` lands in exactly one bucket:
 *
 *   VERIFY       we have a source path + constructor args -> submit it
 *   PROXY        an ERC-1967 proxy; the IMPLEMENTATION is what carries the source, so we
 *                verify that and report how this explorer links the pair
 *   SKIPPED      deliberately not ours to verify (external protocol, EOA), with the reason
 *   UNVERIFIABLE we cannot verify it and someone should FIX that — no catalog entry, no
 *                reconstructable constructor args, source not compiled, proxy with no
 *                recorded implementation. This bucket FAILS the run: a key nobody taught
 *                this script about is exactly the silent skip being removed here.
 *   HISTORICAL   we deployed it, its source is no longer in this repo, and no action will
 *                ever change that (the Semaphore-era pool contracts on Mordor). Reported in
 *                full every run, but does not fail it — a permanently-red exit code teaches
 *                operators to ignore red, which costs more than it buys.
 *
 * Usage:
 *   npx hardhat run scripts/deploy/verify.js --network polygon    # needs ETHERSCAN_API_KEY
 *   npx hardhat run scripts/deploy/verify.js --network mainnet    # (also optimism|base|arbitrum)
 *   npx hardhat run scripts/deploy/verify.js --network mordor     # Blockscout, no key
 *   DRY_RUN=true npx hardhat run scripts/deploy/verify.js --network base   # plan only, no network calls
 *
 * Env:
 *   DRY_RUN=true         print the plan (and the skip/unverifiable reasons) and submit nothing.
 *   VERIFY_PROXIES=true  ALSO submit the ERC-1967 proxies themselves via the OpenZeppelin
 *                        upgrades plugin. Off by default — see the PROXY notes below.
 *   PM_OWNER=0x...       owner passed to FairWinsVerifyingPaymaster at deploy time, if it was
 *                        not the deployer (it is not persisted in the record).
 *
 * Exit code is 0 ONLY when every address in the record was verified, already verified,
 * deliberately skipped with a recorded reason, or HISTORICAL as defined above. A missing or
 * rejected API key, a failed submission, an unaccounted-for key, an empty record and a chain
 * with no explorer all exit 1 — and each says which one it was, in words.
 *
 * `npm run verify:<net>` exists for mordor/etc/amoy/polygon; the four control-plane mainnets
 * are run with the explicit `npx hardhat run ... --network <mainnet|optimism|base|arbitrum>`
 * form above.
 */

const hre = require("hardhat");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const { CHAINLINK_FUNCTIONS_ROUTER, UMA_OOV3 } = require("./lib/constants");
const {
  addressUrl,
  apiKeyHelp,
  assertExplorerConfigured,
  explorerForChain,
  isApiKeyProblem,
} = require("./lib/explorers");

const DRY_RUN = String(process.env.DRY_RUN || "").toLowerCase() === "true";
const VERIFY_PROXIES = String(process.env.VERIFY_PROXIES || "").toLowerCase() === "true";
const ZERO = "0x0000000000000000000000000000000000000000";

// Real Chainalysis sanctions oracle per chain (mirrors deploy.js). Testnets deploy a
// MockSanctionsOracle instead, recorded under record.mocks.mockSanctionsOracle.
const CHAINALYSIS_ORACLE = { 137: "0x40C57923924B5c5c5455c48D93317139ADDaC8fb" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isAddr = (a) => typeof a === "string" && ethers.isAddress(a) && a.toLowerCase() !== ZERO;

/** Shared reason for the Semaphore-era pool contracts (see the "Retired" block in CATALOG). */
const RETIRED_SEMAPHORE =
  "source removed from the repo when spec 034 dropped Semaphore from wager pools; this " +
  "checkout cannot reproduce the deployed bytecode. Verify from the commit that deployed it " +
  "(git log -- contracts/pools) or leave it unverified — it is not on any live value path.";

// =============================================================================
// THE CATALOG — every key that can appear under record.contracts / record.mocks
// =============================================================================
/**
 * One entry per recorded key. `kind` decides the bucket:
 *
 *   "impl"     UUPS implementation. Verify it; its `proxyKey` is what the app talks to.
 *   "contract" plain contract we deployed. Verify it.
 *   "template" immutable ERC-1167 clone template. Verify it (clones need no verification
 *              of their own — explorers resolve a minimal proxy to its template).
 *   "mock"     test double we deployed on a testnet. Verify it so its source is readable.
 *   "proxy"    ERC-1967 proxy. `implKey` names the implementation that carries the source.
 *   "external" someone else's contract, recorded so the app can find it. Never ours to verify.
 *   "eoa"      an externally-owned account recorded among the contracts. Nothing to verify.
 *   "retired"  we deployed it, but its source is no longer in this repo, so this checkout
 *              CANNOT produce matching bytecode. Reported as unverifiable, with why.
 *
 * `args(ctx)` reconstructs the constructor arguments for records that predate
 * `record.constructorArgs` (the current amoy/polygon records predate it for the core
 * contracts). Persisted args always win — they are the exact deploy-time values. Returning
 * `null` from `args` means "cannot reconstruct", which puts the entry in UNVERIFIABLE with
 * the entry's `argsNote` as the reason rather than submitting a guess that would fail
 * against the explorer's bytecode comparison anyway.
 *
 * WHEN YOU ADD A CONTRACT TO A DEPLOY SCRIPT, ADD IT HERE. A recorded key with no entry
 * fails the run by design.
 */
const CATALOG = {
  // --- Access / membership -------------------------------------------------------------
  membershipManager: {
    kind: "proxy",
    label: "MembershipManager",
    implKey: "membershipManagerImpl",
    // Pre-spec-027 records have no membershipManagerImpl: back then this key WAS the
    // contract, not a proxy. buildPlan() detects that and verifies it directly.
    legacy: {
      fqn: "contracts/access/MembershipManager.sol:MembershipManager",
      args: (ctx) => [ctx.deployer, ctx.record.paymentToken, ctx.treasury],
    },
  },
  membershipManagerImpl: {
    kind: "impl",
    label: "MembershipManager (implementation)",
    fqn: "contracts/access/MembershipManager.sol:MembershipManager",
    proxyKey: "membershipManager",
    args: () => [],
  },
  membershipVoucher: {
    kind: "contract",
    label: "MembershipVoucher",
    fqn: "contracts/access/MembershipVoucher.sol:MembershipVoucher",
    args: (ctx) => [ctx.deployer, ctx.c.membershipManager],
  },
  voucherBatchMinter: {
    kind: "contract",
    label: "VoucherBatchMinter",
    fqn: "contracts/access/VoucherBatchMinter.sol:VoucherBatchMinter",
    args: (ctx) => [ctx.c.membershipVoucher],
  },
  sanctionsGuard: {
    kind: "contract",
    label: "SanctionsGuard",
    fqn: "contracts/access/SanctionsGuard.sol:SanctionsGuard",
    // The oracle arg differs per chain (real Chainalysis on 137, the deployed mock on
    // testnets). Guessing it wrong verifies nothing, so refuse rather than submit.
    args: (ctx) => (isAddr(ctx.sanctionsOracle) ? [ctx.deployer, ctx.sanctionsOracle] : null),
    argsNote:
      "SanctionsGuard's oracle constructor arg could not be resolved for this chain " +
      "(expected record.mocks.mockSanctionsOracle on a testnet, or the Chainalysis oracle on 137). " +
      "Set CHAINALYSIS_SANCTIONS_ORACLE_137, or add the deploy-time args to record.constructorArgs.",
  },

  // --- Wagers --------------------------------------------------------------------------
  wagerRegistry: {
    kind: "proxy",
    label: "WagerRegistry",
    implKey: "wagerRegistryImpl",
    // Pre-spec-025 records have no wagerRegistryImpl: this key was the contract itself.
    legacy: {
      fqn: "contracts/wagers/WagerRegistry.sol:WagerRegistry",
      args: (ctx) => [
        ctx.deployer,
        ctx.c.membershipManager,
        isAddr(ctx.c.polymarketAdapter) ? ctx.c.polymarketAdapter : ZERO,
        [ctx.record.paymentToken, ctx.record.wmatic].filter(isAddr),
      ],
    },
  },
  wagerRegistryImpl: {
    kind: "impl",
    label: "WagerRegistry (main implementation)",
    fqn: "contracts/wagers/WagerRegistry.sol:WagerRegistry",
    proxyKey: "wagerRegistry",
    args: () => [],
  },
  wagerRegistryIntents: {
    kind: "impl",
    label: "WagerRegistryIntents (gasless facet)",
    fqn: "contracts/wagers/WagerRegistryIntents.sol:WagerRegistryIntents",
    // Second facet behind the SAME proxy (specs 035+036): the main impl delegatecalls
    // unknown selectors here. It is not a proxy of its own — it is reached through
    // wagerRegistry, which is why it points at that proxy too.
    proxyKey: "wagerRegistry",
    args: () => [],
  },
  keyRegistry: {
    kind: "contract",
    label: "KeyRegistry",
    fqn: "contracts/privacy/KeyRegistry.sol:KeyRegistry",
    args: () => [],
  },

  // --- Wager pools (spec 034) ----------------------------------------------------------
  wagerPoolFactory: { kind: "proxy", label: "WagerPoolFactory", implKey: "wagerPoolFactoryImpl" },
  wagerPoolFactoryImpl: {
    kind: "impl",
    label: "WagerPoolFactory (implementation)",
    fqn: "contracts/pools/WagerPoolFactory.sol:WagerPoolFactory",
    proxyKey: "wagerPoolFactory",
    args: () => [],
  },
  poolImpl: {
    kind: "template",
    label: "WagerPool (ERC-1167 clone template)",
    fqn: "contracts/pools/WagerPool.sol:WagerPool",
    args: () => [],
  },

  // --- Tokens (spec 028) ---------------------------------------------------------------
  tokenFactory: { kind: "proxy", label: "TokenFactory", implKey: "tokenFactoryImpl" },
  tokenFactoryImpl: {
    kind: "impl",
    label: "TokenFactory (implementation)",
    fqn: "contracts/tokens/TokenFactory.sol:TokenFactory",
    proxyKey: "tokenFactory",
    args: () => [],
  },
  openERC20Impl: {
    kind: "template",
    label: "OpenERC20 (clone template)",
    fqn: "contracts/tokens/templates/OpenERC20.sol:OpenERC20",
    args: () => [],
  },
  openERC721Impl: {
    kind: "template",
    label: "OpenERC721 (clone template)",
    fqn: "contracts/tokens/templates/OpenERC721.sol:OpenERC721",
    args: () => [],
  },
  restrictedERC20Impl: {
    kind: "template",
    label: "RestrictedERC20 (clone template)",
    fqn: "contracts/tokens/templates/RestrictedERC20.sol:RestrictedERC20",
    args: () => [],
  },
  openERC20V2Impl: {
    kind: "template",
    label: "OpenERC20V2 (clone template)",
    fqn: "contracts/tokens/templates/OpenERC20V2.sol:OpenERC20V2",
    args: () => [],
  },
  openERC721V2Impl: {
    kind: "template",
    label: "OpenERC721V2 (clone template)",
    fqn: "contracts/tokens/templates/OpenERC721V2.sol:OpenERC721V2",
    args: () => [],
  },
  restrictedERC20V2Impl: {
    kind: "template",
    label: "RestrictedERC20V2 (clone template)",
    fqn: "contracts/tokens/templates/RestrictedERC20V2.sol:RestrictedERC20V2",
    args: () => [],
  },

  // --- Oracle adapters (only on Polymarket/Chainlink/UMA-enabled networks) --------------
  polymarketAdapter: {
    kind: "contract",
    label: "PolymarketOracleAdapter",
    fqn: "contracts/oracles/PolymarketOracleAdapter.sol:PolymarketOracleAdapter",
    args: (ctx) => (isAddr(ctx.record.polymarketCTF) ? [ctx.deployer, ctx.record.polymarketCTF] : null),
    argsNote: "record.polymarketCTF is missing, so the adapter's CTF constructor arg cannot be reconstructed.",
  },
  chainlinkDataFeedAdapter: {
    kind: "contract",
    label: "ChainlinkDataFeedOracleAdapter",
    fqn: "contracts/oracles/ChainlinkDataFeedOracleAdapter.sol:ChainlinkDataFeedOracleAdapter",
    args: (ctx) => [ctx.deployer],
  },
  chainlinkFunctionsAdapter: {
    kind: "contract",
    label: "ChainlinkFunctionsOracleAdapter",
    fqn: "contracts/oracles/ChainlinkFunctionsOracleAdapter.sol:ChainlinkFunctionsOracleAdapter",
    args: (ctx) =>
      isAddr(CHAINLINK_FUNCTIONS_ROUTER[ctx.networkName])
        ? [ctx.deployer, CHAINLINK_FUNCTIONS_ROUTER[ctx.networkName]]
        : null,
    argsNote:
      "CHAINLINK_FUNCTIONS_ROUTER has no entry for this network in scripts/deploy/lib/constants.js, " +
      "so the router constructor arg cannot be reconstructed.",
  },
  umaAdapter: {
    kind: "contract",
    label: "UMAOptimisticOracleV3Adapter",
    fqn: "contracts/oracles/UMAOptimisticOracleV3Adapter.sol:UMAOptimisticOracleV3Adapter",
    args: (ctx) => (isAddr(UMA_OOV3[ctx.networkName]) ? [ctx.deployer, UMA_OOV3[ctx.networkName]] : null),
    argsNote:
      "UMA_OOV3 has no entry for this network in scripts/deploy/lib/constants.js, so the " +
      "OptimisticOracleV3 constructor arg cannot be reconstructed.",
  },

  // --- Control plane: fees (060), staking (066), bridge + liquidity (067) ---------------
  feeRouter: { kind: "proxy", label: "FeeRouter", implKey: "feeRouterImpl" },
  feeRouterImpl: {
    kind: "impl",
    label: "FeeRouter (implementation)",
    fqn: "contracts/fees/FeeRouter.sol:FeeRouter",
    proxyKey: "feeRouter",
    args: () => [],
  },
  stakingRouter: { kind: "proxy", label: "StakingRouter", implKey: "stakingRouterImpl" },
  stakingRouterImpl: {
    kind: "impl",
    label: "StakingRouter (implementation)",
    fqn: "contracts/staking/StakingRouter.sol:StakingRouter",
    proxyKey: "stakingRouter",
    args: () => [],
  },
  bridgeRouter: { kind: "proxy", label: "BridgeRouter", implKey: "bridgeRouterImpl" },
  bridgeRouterImpl: {
    kind: "impl",
    label: "BridgeRouter (implementation)",
    fqn: "contracts/bridge/BridgeRouter.sol:BridgeRouter",
    proxyKey: "bridgeRouter",
    args: () => [],
  },
  liquidityRouter: { kind: "proxy", label: "LiquidityRouter", implKey: "liquidityRouterImpl" },
  liquidityRouterImpl: {
    kind: "impl",
    label: "LiquidityRouter (implementation)",
    fqn: "contracts/liquidity/LiquidityRouter.sol:LiquidityRouter",
    proxyKey: "liquidityRouter",
    args: () => [],
  },

  // --- Identity (spec 054) -------------------------------------------------------------
  callsignRegistry: { kind: "proxy", label: "CallsignRegistry", implKey: "callsignRegistryImpl" },
  callsignRegistryImpl: {
    kind: "impl",
    label: "CallsignRegistry (implementation)",
    fqn: "contracts/naming/CallsignRegistry.sol:CallsignRegistry",
    proxyKey: "callsignRegistry",
    args: () => [],
  },

  // --- DAO connector (spec 030) --------------------------------------------------------
  externalDAORegistry: { kind: "proxy", label: "ExternalDAORegistry", implKey: "externalDAORegistryImpl" },
  externalDAORegistryImpl: {
    kind: "impl",
    label: "ExternalDAORegistry (implementation)",
    fqn: "contracts/clearpath/ExternalDAORegistry.sol:ExternalDAORegistry",
    proxyKey: "externalDAORegistry",
    args: () => [],
  },

  // --- Backup pointer (spec 032) -------------------------------------------------------
  backupPointerRegistry: {
    kind: "contract",
    label: "BackupPointerRegistry",
    fqn: "contracts/privacy/BackupPointerRegistry.sol:BackupPointerRegistry",
    args: () => [],
  },

  // --- Custody (specs 043 + 049) -------------------------------------------------------
  safePolicyGuard: {
    kind: "contract",
    label: "SafePolicyGuard",
    fqn: "contracts/custody/SafePolicyGuard.sol:SafePolicyGuard",
    args: () => [],
  },
  policyGuardSetup: {
    kind: "contract",
    label: "PolicyGuardSetup",
    fqn: "contracts/custody/PolicyGuardSetup.sol:PolicyGuardSetup",
    args: () => [],
  },
  safeProposalHub: {
    kind: "contract",
    label: "SafeProposalHub",
    fqn: "contracts/custody/SafeProposalHub.sol:SafeProposalHub",
    args: () => [],
  },

  // --- Passkey account stack (spec 041) + sponsored paymaster (spec 050) ----------------
  accountImpl: {
    kind: "contract",
    label: "CoinbaseSmartWallet (account implementation)",
    fqn: "contracts/account/CoinbaseSmartWallet.sol:CoinbaseSmartWallet",
    args: () => [],
  },
  accountFactory: {
    kind: "contract",
    label: "CoinbaseSmartWalletFactory",
    fqn: "contracts/account/CoinbaseSmartWalletFactory.sol:CoinbaseSmartWalletFactory",
    // CREATE2-deployed with the account implementation as its single constructor arg
    // (deploy-account-stack.js). Same address on every chain, by design.
    args: (ctx) => (isAddr(ctx.c.accountImpl) ? [ctx.c.accountImpl] : null),
    argsNote:
      "contracts.accountImpl is missing from the record, and it is the factory's only " +
      "constructor arg. Re-run deploy-account-stack.js (idempotent) to record it.",
  },
  verifyingPaymaster: {
    kind: "contract",
    label: "FairWinsVerifyingPaymaster",
    fqn: "contracts/account/FairWinsVerifyingPaymaster.sol:FairWinsVerifyingPaymaster",
    // constructor(entryPoint, verifyingSigner, owner). deploy-verifying-paymaster.js does
    // NOT persist these, and `owner` defaults to the deployer but can be overridden with
    // PM_OWNER — so we reconstruct with that same precedence and say so. If the deploy used
    // a custom owner, re-run this script with PM_OWNER set; a wrong arg fails the explorer's
    // bytecode comparison, it does not verify the wrong source.
    args: (ctx) =>
      isAddr(ctx.c.entryPoint) && isAddr(ctx.c.verifyingPaymasterSigner)
        ? [ctx.c.entryPoint, ctx.c.verifyingPaymasterSigner, process.env.PM_OWNER || ctx.deployer]
        : null,
    argsNote:
      "contracts.entryPoint and/or contracts.verifyingPaymasterSigner are missing, and both are " +
      "constructor args of the paymaster.",
    note: "owner arg assumed = PM_OWNER or the recorded deployer (not persisted at deploy time)",
  },
  verifyingPaymasterSigner: {
    kind: "eoa",
    label: "Paymaster verifying signer",
    reason: "an EOA (the KMS-held ERC-7677 signer address), not a contract — there is no source to verify",
  },
  entryPoint: {
    kind: "external",
    label: "ERC-4337 EntryPoint v0.6",
    reason: "canonical EntryPoint deployed and verified by the ERC-4337 team; FairWins only records the address",
  },
  p256Verifier: {
    kind: "external",
    label: "P-256 verifier",
    reason:
      "external RIP-7212 precompile / third-party verifier where one exists; recorded null when the " +
      "account falls back to inlined FreshCryptoLib",
  },

  // --- Mocks (testnets only) -----------------------------------------------------------
  mockSanctionsOracle: {
    kind: "mock",
    label: "MockSanctionsOracle",
    fqn: "contracts/mocks/MockSanctionsOracle.sol:MockSanctionsOracle",
    args: () => [],
  },
  mockUSDC: {
    kind: "mock",
    label: "MockERC20 (USDC)",
    fqn: "contracts/mocks/MockERC20.sol:MockERC20",
    args: () => ["USD Coin", "USDC", 0],
  },
  mockWMATIC: {
    kind: "mock",
    label: "MockERC20 (WMATIC)",
    fqn: "contracts/mocks/MockERC20.sol:MockERC20",
    args: () => ["Wrapped Matic", "WMATIC", 0],
  },
  mockPolymarketCTF: {
    kind: "mock",
    label: "MockPolymarketCTF",
    fqn: "contracts/test/MockPolymarketCTF.sol:MockPolymarketCTF",
    args: () => [],
  },

  // --- Retired: deployed once, source since removed from the repo -----------------------
  // Spec 034 dropped Semaphore/anonymity from pools and DELETED these sources. The Mordor
  // record still carries the addresses (deployments/ is a historical record, not a wish
  // list). This checkout cannot reproduce their bytecode, so they can never verify from
  // here — that is a fact to state, not a failure to hide behind a silent skip.
  zkWagerPoolFactory: { kind: "retired", label: "ZKWagerPoolFactory (proxy)", reason: RETIRED_SEMAPHORE },
  zkWagerPoolFactoryImpl: { kind: "retired", label: "ZKWagerPoolFactory (implementation)", reason: RETIRED_SEMAPHORE },
  zkWagerPoolSemaphore: { kind: "retired", label: "ZKWagerPool (Semaphore clone template)", reason: RETIRED_SEMAPHORE },
  semaphoreVerifier: {
    kind: "retired",
    label: "SemaphoreVerifier",
    reason:
      "vendored Semaphore verifier, removed with the anonymity path in spec 034. Verify from the " +
      "Semaphore release that was vendored at deploy time, or leave unverified.",
  },
  poseidonT3: {
    kind: "retired",
    label: "PoseidonT3",
    reason:
      "Poseidon hasher generated by poseidon-solidity, removed with the anonymity path in spec 034. " +
      "Its bytecode is generated, not stored in this repo.",
  },
};

/**
 * Top-level record keys that hold addresses but are NOT things we deployed. Listed so the
 * summary can say so explicitly instead of leaving the operator to wonder why USDC never
 * appears in the plan.
 */
const EXTERNAL_TOP_LEVEL = {
  paymentToken: "stake/settlement stablecoin (e.g. Circle USDC) — deployed and verified by its issuer",
  wmatic: "wrapped native token — deployed and verified by its issuer",
  polymarketCTF: "Polymarket/Gnosis Conditional Tokens Framework — third-party protocol",
};

// =============================================================================
// PLAN CONSTRUCTION
// =============================================================================

/** Does this checkout actually contain the source behind `fqn`? */
async function sourceExists(fqn) {
  try {
    await hre.artifacts.readArtifact(fqn);
    return true;
  } catch {
    return false;
  }
}

/**
 * Turn a deployment record into an ordered, fully-accounted plan.
 *
 * Every key under contracts/mocks with a usable address lands in exactly one of `verify`,
 * `proxies`, `skipped`, `historical` or `unverifiable`. Nothing is dropped on the floor: an
 * address that goes nowhere is the bug this function exists to prevent. The ONLY silent
 * case is an explicit null (recorded on purpose to mean "not deployed here").
 */
async function buildPlan(ctx) {
  // `recordTop` carries the record's top-level address fields (paymentToken, wmatic,
  // polymarketCTF) so the summary can list them as deliberately-external rather than
  // leaving them unmentioned — "unmentioned" is how an address gets forgotten.
  const plan = { verify: [], proxies: [], skipped: [], unverifiable: [], historical: [], recordTop: ctx.record };

  const sections = [
    ["contracts", ctx.c],
    ["mocks", ctx.m],
  ];

  for (const [section, bag] of sections) {
    for (const [key, value] of Object.entries(bag || {})) {
      // An explicit null/absent address means "not deployed on this network" — normal, and
      // the only case where saying nothing is correct (p256Verifier is recorded as null on
      // purpose so the frontend capability check stays honest).
      if (value === null || value === undefined || value === "") continue;

      if (!isAddr(value)) {
        plan.unverifiable.push({
          key,
          address: String(value),
          label: key,
          reason: `record.${section}.${key} is not a usable address ("${value}").`,
        });
        continue;
      }

      const entry = CATALOG[key];
      if (!entry) {
        plan.unverifiable.push({
          key,
          address: value,
          label: key,
          reason:
            `no entry in CATALOG (scripts/deploy/verify.js) for record.${section}.${key}. ` +
            `Something deployed a contract and recorded it without teaching this script how to ` +
            `verify it. Add an entry — that is what keeps "verified nothing" from reading as "all good".`,
        });
        continue;
      }

      // Non-verifiable-by-design buckets.
      if (entry.kind === "external" || entry.kind === "eoa") {
        plan.skipped.push({ key, address: value, label: entry.label, reason: entry.reason });
        continue;
      }
      if (entry.kind === "retired") {
        plan.historical.push({ key, address: value, label: entry.label, reason: entry.reason });
        continue;
      }

      // Proxies: the implementation carries the source. Report the pairing, and only
      // complain if the implementation is missing from the record — in that case nobody can
      // read this proxy's source on the explorer, which is worth failing over.
      if (entry.kind === "proxy") {
        const impl = ctx.c[entry.implKey];
        if (isAddr(impl)) {
          plan.proxies.push({ key, address: value, label: entry.label, implKey: entry.implKey, impl });
          continue;
        }
        if (entry.legacy && (await sourceExists(entry.legacy.fqn))) {
          // Pre-UUPS record: this key IS the contract (spec 025 for wagerRegistry, spec 027
          // for membershipManager both migrated an already-deployed non-proxy contract).
          const args = resolveArgs(ctx, key, entry.legacy);
          pushVerifyOrUnverifiable(plan, {
            key,
            address: value,
            label: `${entry.label} (pre-proxy deployment)`,
            fqn: entry.legacy.fqn,
            args,
            entry,
          });
          continue;
        }
        plan.unverifiable.push({
          key,
          address: value,
          label: entry.label,
          reason:
            `proxy recorded without its implementation (contracts.${entry.implKey} is missing), so there ` +
            `is nothing to verify and the explorer has no source to link. Record the implementation ` +
            `(scripts/deploy/lib/upgradeable.js getImplementation) and re-run.`,
        });
        continue;
      }

      // Verifiable kinds: impl / contract / template / mock.
      if (!(await sourceExists(entry.fqn))) {
        plan.unverifiable.push({
          key,
          address: value,
          label: entry.label,
          reason:
            `${entry.fqn} is not in this checkout's artifacts. Either the contract was renamed/removed ` +
            `since it was deployed (verify from the deploying commit instead), or you need to run ` +
            `\`npx hardhat compile\` first.`,
        });
        continue;
      }

      pushVerifyOrUnverifiable(plan, {
        key,
        address: value,
        label: entry.label,
        fqn: entry.fqn,
        args: resolveArgs(ctx, key, entry),
        entry,
      });
    }
  }

  // Verify implementations before proxies, and keep a stable, readable order otherwise.
  const rank = { impl: 0, contract: 1, template: 2, mock: 3 };
  plan.verify.sort((a, b) => (rank[a.entry.kind] ?? 9) - (rank[b.entry.kind] ?? 9));

  return plan;
}

/** Persisted deploy-time args win; otherwise reconstruct; `null` means "cannot". */
function resolveArgs(ctx, key, entry) {
  const persisted = ctx.record.constructorArgs || {};
  if (persisted[key] !== undefined) return persisted[key];
  return typeof entry.args === "function" ? entry.args(ctx) : null;
}

function pushVerifyOrUnverifiable(plan, item) {
  if (item.args === null || item.args === undefined) {
    plan.unverifiable.push({
      key: item.key,
      address: item.address,
      label: item.label,
      reason:
        (item.entry.argsNote ||
          `constructor arguments are neither recorded in record.constructorArgs.${item.key} nor ` +
            `reconstructable here`) +
        ` Submitting a guess would fail the explorer's bytecode comparison, so it is not attempted.`,
    });
    return;
  }
  plan.verify.push(item);
}

// =============================================================================
// SUBMISSION
// =============================================================================

/** Raised when the explorer rejects our credentials — fatal for the whole run, not one contract. */
class ApiKeyRejected extends Error {}

async function verifyOne({ label, address, args, fqn }, explorer) {
  const params = { address, constructorArguments: args, contract: fqn };

  // A dry run submits nothing; the plan is reported once, in the summary (which prints the
  // source path and the exact constructor args it WOULD send).
  if (DRY_RUN) return { status: "planned" };

  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await hre.run("verify:verify", params);
      console.log(`  ✓ verified ${label} @ ${address}`);
      return { status: "verified" };
    } catch (err) {
      const msg = String((err && err.message) || err);

      // Already verified -> success (re-runnable). Covers Etherscan + Blockscout strings.
      if (/already verified|already been verified|smart-contract already verified/i.test(msg)) {
        console.log(`  • already verified ${label} @ ${address}`);
        return { status: "already-verified" };
      }

      // A rejected key fails every contract identically. Retrying it 6 times each just
      // buries the one line that explains the problem, so stop the run here.
      if (isApiKeyProblem(msg)) {
        throw new ApiKeyRejected(`${apiKeyHelp(explorer)}\n  Explorer said: ${msg.split("\n")[0]}`);
      }

      // Explorer hasn't indexed the bytecode yet, or transient network error -> backoff.
      if (
        attempt < maxAttempts &&
        /does not have bytecode|has not been deployed|Unable to locate ContractCode|not found|Pending in queue|rate limit|ECONNRESET|ETIMEDOUT|50[23]/i.test(msg)
      ) {
        const wait = Math.min(2000 * 2 ** (attempt - 1), 30000); // 2s,4s,8s,16s,30s
        console.log(`  … ${label} attempt ${attempt} not ready (${msg.split("\n")[0]}); retry in ${wait}ms`);
        await sleep(wait);
        continue;
      }

      // One contract failing is not a reason to skip the rest — collect it and carry on so
      // the summary shows the WHOLE picture in one run.
      console.error(`  ✗ ${label} @ ${address} failed: ${msg.split("\n")[0]}`);
      return { status: "failed", reason: msg.split("\n")[0] };
    }
  }
  return { status: "failed", reason: "explorer never indexed the bytecode (gave up after 6 attempts)" };
}

/**
 * Optional: submit the ERC-1967 proxy itself.
 *
 * OFF by default. Both explorer families already resolve a proxy to its implementation
 * (Blockscout reads the EIP-1967 slot automatically; Etherscan does it on demand behind
 * "Is this a proxy?"), so the implementation being verified is what actually makes the
 * source readable. Submitting the proxy adds the OpenZeppelin plugin's own ERC1967Proxy
 * artifact into the mix, which fails confusingly when the deployed proxy came from a
 * different @openzeppelin/contracts version than the one installed today. Opt in with
 * VERIFY_PROXIES=true when you want the explicit link recorded.
 */
async function verifyProxy(item, explorer) {
  if (DRY_RUN) {
    console.log(`  [plan] proxy ${item.label} @ ${item.address} -> impl ${item.impl}`);
    return { status: "planned" };
  }
  try {
    // The @openzeppelin/hardhat-upgrades plugin extends the top-level `verify` task to
    // understand proxies; the low-level verify:verify task does not.
    await hre.run("verify", { address: item.address, constructorArgsParams: [] });
    console.log(`  ✓ proxy linked ${item.label} @ ${item.address}`);
    return { status: "verified" };
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/already verified|already been verified|smart-contract already verified/i.test(msg)) {
      console.log(`  • proxy already verified ${item.label} @ ${item.address}`);
      return { status: "already-verified" };
    }
    if (isApiKeyProblem(msg)) throw new ApiKeyRejected(apiKeyHelp(explorer));
    console.warn(`  ⚠ proxy ${item.label} @ ${item.address} not linked: ${msg.split("\n")[0]}`);
    return { status: "manual", reason: msg.split("\n")[0] };
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const networkName = hre.network.name;
  // Prefer the configured chainId (no RPC round-trip; works in DRY_RUN offline).
  const chainId = hre.network.config.chainId
    ? Number(hre.network.config.chainId)
    : Number((await ethers.provider.getNetwork()).chainId);

  // Pre-flight FIRST: if this chain has no explorer, or the key is absent, say so before
  // touching anything. A run that cannot verify must never reach a summary an operator could
  // mistake for a clean result.
  //
  // The one concession: a DRY RUN whose ONLY problem is the API key still prints its plan,
  // because "what would this attempt on Base?" is a question worth answering before the key
  // is minted. It states the pre-flight failure at the top, repeats it in the verdict, and
  // exits non-zero — the plan is informative, not a pass.
  let explorer;
  let preflightError = null;
  try {
    explorer = assertExplorerConfigured(chainId, networkName);
  } catch (err) {
    const known = explorerForChain(chainId);
    // Only the key problem is survivable. An unknown chain (no explorer facts at all) or a
    // network/chainId mismatch means every address and URL below would be wrong.
    if (!DRY_RUN || !known || known.network !== networkName) throw err;
    explorer = known;
    preflightError = err;
    console.error(`\nPRE-FLIGHT FAILED — nothing could be submitted even if this were not a dry run:\n`);
    console.error(`${err.message}\n`);
    console.error(`Continuing to print the PLAN ONLY, because this is a dry run.\n`);
  }

  const recordPath = path.join(__dirname, "..", "..", "deployments", `${networkName}-chain${chainId}-v2.json`);
  if (!fs.existsSync(recordPath)) {
    throw new Error(
      `No deployment record at ${recordPath}, so there is nothing to verify on ${networkName}.\n` +
        `Deploy first (deployments/ is the source of truth — this script only reads it):\n` +
        `  full stack (wagers + membership + oracles):\n` +
        `    npx hardhat run scripts/deploy/deploy.js --network ${networkName}\n` +
        `  control plane only (FeeRouter + BridgeRouter/LiquidityRouter, no core):\n` +
        `    npx hardhat run scripts/deploy/init-deployment-record.js --network ${networkName}\n` +
        `    then deploy-fee-router.js and deploy-bridge-liquidity.js --network ${networkName}`
    );
  }

  const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
  const c = record.contracts || {};
  const m = record.mocks || {};

  console.log("=".repeat(72));
  console.log(
    `Verify FairWins contracts — ${networkName} (chainId ${chainId})${DRY_RUN ? "  [DRY RUN — nothing submitted]" : ""}`
  );
  console.log(`Explorer: ${explorer.label} ${explorer.browserUrl} (${explorer.family})`);
  console.log(`Record:   ${recordPath}`);
  console.log("=".repeat(72) + "\n");

  const ctx = {
    record,
    c,
    m,
    chainId,
    networkName,
    deployer: record.deployer,
    treasury: record.treasury,
    // SanctionsGuard oracle arg: real Chainalysis on 137, else the deployed mock (testnets).
    sanctionsOracle:
      chainId === 137
        ? process.env.CHAINALYSIS_SANCTIONS_ORACLE_137 || CHAINALYSIS_ORACLE[137]
        : m.mockSanctionsOracle,
  };

  const plan = await buildPlan(ctx);
  const totalAddresses =
    plan.verify.length + plan.proxies.length + plan.skipped.length + plan.unverifiable.length + plan.historical.length;

  // A record with no addresses at all is not a success state. Refuse rather than print
  // "Done": an empty record means either nothing is deployed yet (a freshly initialized
  // record from init-deployment-record.js), or the deploy died before recording, or this is
  // the wrong network — and all three deserve a stop, not a green tick.
  if (totalAddresses === 0) {
    throw new Error(
      `${recordPath} records no contract addresses at all, so nothing was verified.\n` +
        `If the record was just created by init-deployment-record.js, deploy something first ` +
        `(deploy-fee-router.js / deploy-bridge-liquidity.js). Otherwise check that you targeted the ` +
        `right network and that the deploy actually completed and wrote its addresses.`
    );
  }

  // On-chain pre-flight: is there actually CODE at each address, on THIS chain?
  //
  // The same contract name lives at a different address on every chain (only the CREATE2
  // account stack is address-identical), so the classic multi-chain mistake is a record entry
  // copied from a sibling network. The explorer's answer to that is "Unable to locate
  // ContractCode", which this script would otherwise retry six times before giving up — six
  // backoffs per address, and a failure message that describes the explorer rather than the
  // mistake. One eth_getCode call each says it plainly and immediately instead.
  if (!DRY_RUN) {
    const toCheck = [...plan.verify, ...plan.proxies];
    console.log(`Checking ${toCheck.length} address(es) actually carry bytecode on chain ${chainId}…`);
    for (const item of toCheck) {
      let code;
      try {
        code = await ethers.provider.getCode(item.address);
      } catch (err) {
        // A dead RPC is not a verification result; refuse rather than guess.
        throw new Error(
          `Could not read code at ${item.address} on ${networkName} (chainId ${chainId}): ` +
            `${err.message || err}\nThe RPC endpoint for this network is unreachable — fix it (see ` +
            `requiredRpcUrl in hardhat.config.js for which variable it reads) and re-run. Nothing was submitted.`
        );
      }
      if (code && code !== "0x") continue;

      plan.unverifiable.push({
        key: item.key,
        address: item.address,
        label: item.label,
        reason:
          `NO BYTECODE at this address on ${networkName} (chainId ${chainId}). The record claims a ` +
          `contract here and the chain disagrees, so nothing can be verified against it. Almost always ` +
          `an address copied from another network, or a record written for a deploy that reverted — ` +
          `fix deployments/ (the source of truth) rather than this script.`,
      });
      plan.verify = plan.verify.filter((i) => i !== item);
      plan.proxies = plan.proxies.filter((i) => i !== item);
    }
    console.log("");
  }

  const results = [];
  let fatal = null;

  // --- implementations, standalone contracts, templates, mocks ---
  if (plan.verify.length) {
    console.log(`Submitting ${plan.verify.length} contract source(s):\n`);
    for (const item of plan.verify) {
      try {
        const r = await verifyOne(item, explorer);
        results.push({ ...item, ...r });
      } catch (err) {
        if (err instanceof ApiKeyRejected) {
          fatal = err;
          results.push({ ...item, status: "not-attempted", reason: "run aborted: API key rejected" });
          break;
        }
        throw err;
      }
    }
    // Anything we never reached after a fatal still has to appear in the summary.
    if (fatal) {
      const done = new Set(results.map((r) => r.key));
      for (const item of plan.verify.filter((i) => !done.has(i.key))) {
        results.push({ ...item, status: "not-attempted", reason: "run aborted: API key rejected" });
      }
    }
  }

  // --- proxies ---
  const proxyResults = [];
  if (plan.proxies.length && !fatal) {
    if (VERIFY_PROXIES) {
      console.log(`\nSubmitting ${plan.proxies.length} ERC-1967 proxy/proxies (VERIFY_PROXIES=true):\n`);
      for (const item of plan.proxies) {
        try {
          proxyResults.push({ ...item, ...(await verifyProxy(item, explorer)) });
        } catch (err) {
          if (err instanceof ApiKeyRejected) {
            fatal = err;
            break;
          }
          throw err;
        }
      }
    } else {
      for (const item of plan.proxies) proxyResults.push({ ...item, status: "not-submitted" });
    }
  }

  printSummary({ plan, results, proxyResults, explorer, recordPath, fatal, preflightError });

  const implVerified = results.filter((r) => r.status === "verified" || r.status === "already-verified").length;
  const failures =
    results.filter((r) => r.status === "failed" || r.status === "not-attempted").length + plan.unverifiable.length;

  if (preflightError) return 1;
  if (fatal) {
    console.error(`\nFATAL: ${fatal.message}\n`);
    return 1;
  }
  if (failures > 0) return 1;
  // In a dry run nothing is verified by definition; the plan itself is the deliverable.
  if (!DRY_RUN && implVerified === 0 && plan.verify.length > 0) return 1;
  return 0;
}

/**
 * The summary is the whole point of this script. It must be impossible to read
 * "nothing was verified" as "everything is fine", so:
 *   - every recorded address appears in exactly one section, with a reason if not verified;
 *   - the headline states the counts AND a verdict, and the verdict is FAILED whenever a
 *     recorded contract was left unaccounted for.
 */
function printSummary({ plan, results, proxyResults, explorer, recordPath, fatal, preflightError }) {
  const count = (...statuses) => results.filter((r) => statuses.includes(r.status)).length;
  const verified = count("verified");
  const already = count("already-verified");
  const planned = count("planned");
  const failed = count("failed");
  const notAttempted = count("not-attempted");
  const externalTop = Object.entries(EXTERNAL_TOP_LEVEL).filter(([k]) => isAddr(plan.recordTop?.[k]));
  const totalAddresses =
    plan.verify.length +
    plan.proxies.length +
    plan.skipped.length +
    plan.unverifiable.length +
    plan.historical.length +
    externalTop.length;

  console.log("\n" + "=".repeat(72));
  console.log(`VERIFICATION SUMMARY — ${explorer.chainName} via ${explorer.label}`);
  console.log(`${totalAddresses} address(es) recorded in ${path.basename(recordPath)}, all accounted for below`);
  console.log("=".repeat(72));

  if (results.length) {
    console.log(`\nCONTRACT SOURCES (${results.length})`);
    for (const r of results) {
      const mark =
        { verified: "✓", "already-verified": "•", planned: "→", failed: "✗", "not-attempted": "?" }[r.status] || "?";
      console.log(`  ${mark} [${r.status}] ${r.label}`);
      console.log(`      ${r.address}  ${addressUrl(explorer, r.address)}`);
      if (DRY_RUN) {
        console.log(`      contract=${r.fqn}`);
        console.log(`      args=${JSON.stringify(r.args)}`);
      }
      if (r.entry?.note) console.log(`      note: ${r.entry.note}`);
      if (r.reason) console.log(`      reason: ${r.reason}`);
    }
  }

  if (proxyResults.length) {
    console.log(`\nPROXIES (${proxyResults.length}) — the IMPLEMENTATION above carries the source`);
    for (const p of proxyResults) {
      const linking =
        explorer.proxyLinking === "automatic"
          ? "explorer reads the EIP-1967 slot automatically"
          : 'click "Is this a proxy?" on the explorer once to link it';
      const state =
        p.status === "not-submitted"
          ? `not submitted (${linking}; set VERIFY_PROXIES=true to submit it explicitly)`
          : p.status === "manual"
            ? `NOT LINKED — ${p.reason}; ${linking}`
            : p.status;
      console.log(`  ▸ ${p.label} proxy ${p.address}`);
      console.log(`      impl (${p.implKey}) ${p.impl}`);
      console.log(`      ${state}`);
      console.log(`      ${addressUrl(explorer, p.address)}`);
    }
  }

  const skippedTotal = plan.skipped.length + externalTop.length;
  if (skippedTotal) {
    console.log(`\nINTENTIONALLY SKIPPED (${skippedTotal}) — not ours to verify`);
    for (const s of plan.skipped) console.log(`  – ${s.label} ${s.address}\n      ${s.reason}`);
    for (const [k, why] of externalTop) console.log(`  – ${k} ${plan.recordTop[k]}\n      ${why}`);
  }

  if (plan.historical.length) {
    console.log(
      `\nHISTORICAL — NOT VERIFIABLE FROM THIS CHECKOUT (${plan.historical.length}), and no run will change that`
    );
    for (const h of plan.historical) {
      console.log(`  ~ ${h.label} (record key: ${h.key})`);
      console.log(`      ${h.address}  ${addressUrl(explorer, h.address)}`);
      console.log(`      ${h.reason}`);
    }
  }

  if (plan.unverifiable.length) {
    console.log(`\nUNVERIFIABLE (${plan.unverifiable.length}) — recorded on-chain, NOT verified, needs a fix`);
    for (const u of plan.unverifiable) {
      console.log(`  ✗ ${u.label} (record key: ${u.key})`);
      console.log(`      ${u.address}  ${addressUrl(explorer, u.address)}`);
      console.log(`      ${u.reason}`);
    }
  }

  const problems = failed + notAttempted + plan.unverifiable.length;
  // "OK" never hides a caveat: a run with historical addresses says so in the verdict itself,
  // because those addresses ARE part of this deployment and a reader deserves to know they
  // will never carry source.
  const okVerdict = plan.historical.length
    ? `OK (${plan.historical.length} historical, source gone — see above)`
    : "OK";
  const verdict = preflightError
    ? "FAILED (pre-flight: nothing could be submitted)"
    : fatal
      ? "FAILED (aborted)"
      : problems > 0
        ? "FAILED"
        : DRY_RUN
          ? "DRY RUN — nothing submitted"
          : verified + already === 0 && plan.verify.length > 0
            ? "FAILED"
            : okVerdict;

  console.log("\n" + "-".repeat(72));
  console.log(
    `Result: ${verdict} — ${verified} verified, ${already} already verified, ${planned} planned, ` +
      `${failed} failed, ${notAttempted} not attempted, ${plan.unverifiable.length} unverifiable, ` +
      `${plan.historical.length} historical, ${skippedTotal} skipped by design ` +
      `(${totalAddresses} recorded address(es) in total)`
  );
  if (preflightError) {
    console.log(
      `NOTHING WAS SUBMITTED — the plan above is what this run WOULD attempt once the pre-flight ` +
        `failure at the top of the output is fixed. Do not read it as a verified deployment.`
    );
  }
  if (problems > 0) {
    console.log(
      `${problems} recorded contract(s) are NOT verified. Read the reasons above — an unverified ` +
        `contract on a mainnet is an unreadable contract for everyone auditing this deployment.`
    );
  }
  console.log("-".repeat(72));
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n${err.message || err}\n`);
    process.exit(1);
  });
