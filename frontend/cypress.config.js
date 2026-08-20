import { defineConfig } from 'cypress'
import { ethers } from 'ethers'
import { readFileSync, unlinkSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// WAGER_PARTICIPANT_ROLE used by membership grants.
const WAGER_PARTICIPANT_ROLE = ethers.keccak256(ethers.toUtf8Bytes('WAGER_PARTICIPANT_ROLE'))

// Minimal ABIs for the setup transactions the E2E suite needs to arrange
// on-chain preconditions that have no UI (oracle resolution) or that are faster
// to set directly (pause/freeze/grant). All sent from Hardhat account #0, which
// the local deploy seeds with DEFAULT_ADMIN/GUARDIAN/ACCOUNT_MODERATOR/ROLE_MANAGER.
const REGISTRY_ABI = [
  'function pause()',
  'function unpause()',
  'function paused() view returns (bool)',
  'function freezeAccount(address user, string reason)',
  'function unfreezeAccount(address user)',
  'function isFrozen(address) view returns (bool)',
  'function nextWagerId() view returns (uint256)',
  'function createWager(address opponent,address arbitrator,address token,uint128 creatorStake,uint128 opponentStake,uint64 acceptDeadline,uint64 resolveDeadline,uint8 resolutionType,bytes32 polymarketConditionId,bool creatorIsYes,bytes32 metadataHash,string metadataUri) returns (uint256)',
  'function acceptWager(uint256 wagerId)',
  'function declareWinner(uint256 wagerId, address winner)',
  'function claimRefund(uint256 wagerId)',
  'function claimPayout(uint256 wagerId)',
  'function cancelOpen(uint256 wagerId)',
  'function declineWager(uint256 wagerId)',
  'function autoResolveFromPolymarket(uint256 wagerId)',
  'function getWager(uint256 wagerId) view returns (tuple(address creator,address opponent,address arbitrator,address token,uint128 creatorStake,uint128 opponentStake,uint64 acceptDeadline,uint64 resolveDeadline,uint8 resolutionType,uint8 status,bool paid,bool creatorIsYes,address winner,bytes32 metadataHash,bytes32 polymarketConditionId,string metadataUri))',
]
const MEMBERSHIP_ABI = [
  'function grantMembership(address user, bytes32 role, uint8 tier, uint32 durationDays)',
]
// Hardhat default account private keys (#0–#4) — public test keys, test-only.
const ACCOUNT_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
]
const CTF_ABI = [
  'function resolveCondition(bytes32 conditionId, uint256[] payouts)',
  'function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount)',
  'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) pure returns (bytes32)',
]
const TOKEN_ABI = [
  'function mint(address to, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]
// ReentrantToken (contracts/mocks) — a test-only ERC-20 whose next transfer re-enters an armed
// target and bubbles that call's revert. The legacy-recovery sweep uses it to model a token that
// REFUSES a transfer it is perfectly able to make (a blocklisting stablecoin is the real-world
// case), which is the only way to fail one asset and not the others: the sweep re-reads balances
// itself, so anything that changes the balance simply drops the asset from the run instead.
const ARMED_TOKEN_ABI = ['function arm(address target, bytes data)']
const KEYREG_ABI = [
  'function hasKey(address user) view returns (bool)',
  'function getPublicKey(address user) view returns (bytes)',
]
/*
 * Spec 060 platform fees (#1233). `Service` is returned as a struct, so the fragment must spell
 * the tuple out — a bare `returns (uint16,uint16,uint8)` decodes a DIFFERENT calldata shape and
 * would report a plausible-looking rate that is not the one the router holds.
 *
 * `FeeBpsChanged` is here because it is the audit history the third flow reads back: the admin UI
 * renders it, and a test that only re-read `getService` could not tell a rate that was CHANGED
 * from one that was always that value.
 */
const FEE_ROUTER_ABI = [
  'function getService(bytes32 serviceId) view returns (tuple(uint16 capBps, uint16 feeBps, uint8 kind))',
  'function setFeeBps(bytes32 serviceId, uint16 newBps)',
  'function treasury() view returns (address)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function FEE_ADMIN_ROLE() view returns (bytes32)',
  'event FeeBpsChanged(bytes32 indexed serviceId, uint16 oldBps, uint16 newBps, address indexed actor)',
]
// The local MockERC4626Vault (scripts/deploy/deploy-local-earn-vault.js) — the Earn deposit's
// destination, and where a member's NET principal must land when a fee is taken.
const VAULT_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function totalAssets() view returns (uint256)',
  'function asset() view returns (address)',
]

// Spec 034 Wager Pools — minimal ABIs for the setup/drive transactions the pools e2e suite (#1232)
// needs to arrange directly (create/join/propose/approve/claim/refund), the same bypass-the-UI
// pattern the wager helpers above use. Addresses come from the deployment record's
// `wagerPoolFactory` key, appended by `deploy-wager-pool-factory.js` (never part of `deploy:local`).
const POOL_FACTORY_ABI = [
  'function createPool((address token,uint256 buyIn,uint32 maxMembers,uint16 thresholdBips,uint64 acceptDeadline,uint64 resolveDeadline) p) returns (uint256 poolId, address pool)',
  'event PoolCreated(uint256 indexed poolId, address indexed pool, address indexed creator, uint32[4] wordIndices, address token, uint256 buyIn, uint32 maxMembers, uint16 thresholdBips, uint64 acceptDeadline, uint64 resolveDeadline)',
]
const POOL_ABI = [
  'function join()',
  'function joinWithAuthorization(address from, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
  'function closeJoining()',
  'function cancel()',
  'function proposeOutcome((address winner,uint256 amount)[] entries)',
  'function approve()',
  'function claim((address winner,uint256 amount)[] entries, uint256 index, address recipient)',
  'function refund()',
  'function state() view returns (uint8)',
  'function memberCount() view returns (uint32)',
  'function maxMembers() view returns (uint32)',
  'function buyIn() view returns (uint256)',
  'function token() view returns (address)',
  'function acceptDeadline() view returns (uint64)',
  'function resolveDeadline() view returns (uint64)',
  'function frozenDenominator() view returns (uint32)',
  'function thresholdBips() view returns (uint16)',
  'function escrowTotal() view returns (uint256)',
  'function currentProposalId() view returns (bytes32)',
  'function hasJoined(address) view returns (bool)',
  'function refunded(address) view returns (bool)',
  'function claimedIndex(uint256) view returns (bool)',
  'function proposalApprovals(bytes32) view returns (uint32)',
  'function approvedBy(bytes32, address) view returns (bool)',
  'event Joined(address indexed member)',
]
// EIP-3009 domain/typehash for MockUSDCPermit (contracts/mocks/MockUSDCPermit.sol) — a 6-decimal USDC
// double supporting `receiveWithAuthorization`, deployed on demand by the `deployMockUSDCPermit` task
// since the local core payment token (18-dec MockERC20) has no EIP-3009 support. OZ ERC20Permit domain
// version is its default "1".
const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

/**
 * Read the local deployment record written by `npm run deploy:local`
 * (`--network localhost` → `deployments/localhost-chain1337-v2.json`). This is
 * the same source `sync:frontend-contracts` mirrors into the UI's
 * HARDHAT_CONTRACTS, so the addresses match what the app uses.
 */
// The chain id this session's mock claims and the tasks target. Default stays 1337 because this
// config also serves the FAST tier, whose specs assert against the chain the mock claims — a
// changed default would silently re-cohort them. The FULL tier's entry points (the CI job and
// scripts that boot hardhat AS Amoy via HARDHAT_LOCAL_CHAIN_ID=80002) pass CYPRESS_NETWORK_ID=80002
// so the local node is the app's membership home; see hardhat.config.js for why impersonation
// rather than reconfiguration.
const E2E_CHAIN_ID = Number(globalThis.process?.env?.CYPRESS_NETWORK_ID) || 1337

function loadLocalDeployment() {
  const path = resolve(__dirname, '..', 'deployments', `localhost-chain${E2E_CHAIN_ID}-v2.json`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Read a Hardhat-compiled artifact (abi + bytecode) written by `npm run compile` / `deploy:local`. */
function loadArtifact(contractPath, contractName) {
  const path = resolve(__dirname, '..', 'artifacts', 'contracts', contractPath, `${contractName}.json`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

/*
 * Name the custom error behind a revert.
 *
 * The task drives the registry through a minimal human-readable ABI, which carries no error
 * fragments — so every custom error arrived as the useless "execution reverted (unknown custom
 * error)". ORC-01/02 reported exactly that. Decode against the compiled artifacts instead;
 * BOTH facets are needed because the proxy delegates unknown selectors to WagerRegistryIntents,
 * which is where autoResolveFrom* lives (spec 035/036). The pool contracts (spec 034) are
 * included too, so a reverting pool precondition names its custom error the same way.
 *
 * Best-effort: if the artifacts have not been compiled, fall through to the raw message rather
 * than failing the task for a diagnostic.
 */
let __revertIface = null
function revertInterface() {
  if (__revertIface) return __revertIface
  const fragments = []
  for (const rel of [
    '../artifacts/contracts/wagers/WagerRegistry.sol/WagerRegistry.json',
    '../artifacts/contracts/wagers/WagerRegistryIntents.sol/WagerRegistryIntents.json',
    '../artifacts/contracts/pools/WagerPool.sol/WagerPool.json',
    '../artifacts/contracts/pools/WagerPoolFactory.sol/WagerPoolFactory.json',
    // Spec 060: `FeeAboveQuoted` and `CapExceeded` are the two reverts the fee specs assert on,
    // and both are custom errors — without the fragments they arrive as "unknown custom error"
    // and a test could not tell the ceiling holding from an unrelated failure.
    '../artifacts/contracts/fees/FeeRouter.sol/FeeRouter.json',
  ]) {
    try {
      fragments.push(...JSON.parse(readFileSync(resolve(__dirname, rel), 'utf8')).abi)
    } catch {
      // Not compiled in this environment — decode with whatever else we found.
    }
  }
  __revertIface = new ethers.Interface(fragments)
  return __revertIface
}

function describeRevert(e) {
  const base = e.shortMessage || e.reason || e.message
  const data = e.data ?? e.info?.error?.data ?? e.error?.data
  if (typeof data === 'string' && data.length >= 10) {
    try {
      const parsed = revertInterface().parseError(data)
      if (parsed) {
        const args = parsed.args?.length ? `(${parsed.args.map(String).join(', ')})` : ''
        return `${parsed.name}${args}`
      }
    } catch {
      // Unknown selector — the raw message plus the selector still beats "unknown custom error".
    }
    return `${base} [selector ${data.slice(0, 10)}]`
  }
  return base
}

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    /*
     * Cypress 13+ defaults videoCompression to false, i.e. raw video: the fast suite
     * produced ~45 MB per run, which on a private repo (artifacts bill against the
     * account storage quota) was 84% of all CI artifact storage and eventually failed
     * every job on upload. 32 is Cypress's own pre-13 default CRF.
     */
    videoCompression: 32,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,

    env: {
      // Spec 094: which viewport profile this run uses — `desktop` (1280×720, what every existing
      // spec was written against) or `phone` (390×844). CI runs the no-chain tier once per profile.
      // Override with CYPRESS_VIEWPORT_PROFILE.
      VIEWPORT_PROFILE: 'desktop',
      // Hardhat local testnet configuration (Amoy-shaped when the full tier passes
      // CYPRESS_NETWORK_ID=80002 — see E2E_CHAIN_ID above)
      NETWORK_ID: E2E_CHAIN_ID,
      RPC_URL: 'http://localhost:8545',
      // Test wallet private key (Hardhat account #0 — holds all admin roles locally)
      PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },

    setupNodeEvents(on, config) {
      /*
       * Chain-state checkpoint (full tier only). Eight of the fifteen full specs move the chain
       * clock with evm_increaseTime — 02-membership alone jumps it 31 days to expire a membership —
       * and chain time can NEVER move backwards. Without isolation, whichever spec runs first
       * poisons every later one: create forms compute deadlines from the browser clock, the chain
       * rejects them as ~a month in its past, and the failure surfaces as "Invalid deadlines" in
       * specs that did nothing wrong. Which specs pass then depends on RUN ORDER — the definition
       * of a suite without isolation, and why single-spec experiments kept contradicting full runs.
       *
       * The plugin process lives for the whole `cypress run`, so this closure survives across
       * specs. Each spec reverts to the post-seed snapshot and immediately re-snapshots (hardhat
       * consumes a snapshot id on revert).
       */
      let chainSnapshotId = null

      on('task', {
        log(message) {
          console.log(message)
          return null
        },

        /*
         * Spec 094: hand the runner the installed axe-core source so cy.a11yScan can evaluate it
         * in the app window. Resolved through require.resolve rather than a hardcoded path — the
         * package hoists to the ROOT node_modules in this workspace (spec 075) but need not, and a
         * path that silently missed would make every accessibility scan quietly do nothing.
         *
         * Returns null on failure rather than throwing, so the command raises the honest error
         * ("could not load axe-core") instead of a task rejection with no context.
         */
        axeSource() {
          try {
            return readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
          } catch (e) {
            console.error('axeSource: could not resolve axe-core —', e.message)
            return null
          }
        },

        /**
         * Send a setup transaction to the local Hardhat node as account #0.
         * action ∈ pause | unpause | freeze | unfreeze | grantMembership | resolveCondition
         * Returns a small status object (never the raw tx) so specs stay declarative.
         */
        async chainTx({ action, args = {} }) {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const provider = new ethers.JsonRpcProvider(rpcUrl, E2E_CHAIN_ID, { staticNetwork: true })
          const wallet = new ethers.Wallet(config.env.PRIVATE_KEY, provider)
          const d = loadLocalDeployment()
          const registry = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, wallet)
          const membership = new ethers.Contract(d.contracts.membershipManager, MEMBERSHIP_ABI, wallet)
          const ctfAddr = (d.mocks && d.mocks.mockPolymarketCTF) || d.polymarketCTF
          const ctf = new ethers.Contract(ctfAddr, CTF_ABI, wallet)
          const token = new ethers.Contract(d.paymentToken, TOKEN_ABI, wallet)

          try {
          let tx
          switch (action) {
            case 'fund':
              // Mint a large stake-token balance so create/accept never reverts on
              // transferFrom (the mock is 18-dec; this covers any stake amount).
              tx = await token.mint(args.address, args.amount || (10n ** 24n)); break
            case 'approve': {
              // Approve the registry as account #idx (uses that account's key).
              const aw = new ethers.Wallet(ACCOUNT_KEYS[args.index ?? 0], provider)
              tx = await new ethers.Contract(d.paymentToken, TOKEN_ABI, aw)
                .approve(d.contracts.wagerRegistry, ethers.MaxUint256)
              break
            }
            case 'createWager': {
              // Reliable on-chain wager creation as account #creatorIndex (bypasses
              // the UI create wizard, which doesn't send txs under the mock wallet).
              const cw = new ethers.Wallet(ACCOUNT_KEYS[args.creatorIndex ?? 0], provider)
              const creg = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, cw)
              const now = (await provider.getBlock('latest')).timestamp
              // creatorStake/opponentStake default to the shared `stake` (the common equal-stakes
              // case); pass them individually for an asymmetric "offer" wager. Either-party
              // resolution requires equal stakes on chain (EitherRequiresEqualStakes) — an
              // asymmetric wager needs resolutionType Creator/Opponent/ThirdParty.
              const base = BigInt(args.stake ?? (10n ** 18n))
              const creatorStake = args.creatorStake !== undefined ? BigInt(args.creatorStake) : base
              const opponentStake = args.opponentStake !== undefined ? BigInt(args.opponentStake) : base
              const sent = await creg.createWager(
                args.opponent, args.arbitrator || ethers.ZeroAddress, d.paymentToken,
                creatorStake, opponentStake,
                now + (args.acceptIn ?? 3600), now + (args.resolveIn ?? 7200),
                args.resolutionType ?? 0, args.conditionId ?? ethers.ZeroHash,
                args.creatorIsYes ?? false, ethers.id('e2e-meta'), ''
              )
              const rc = await sent.wait(1)
              const reg = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, provider)
              return { ok: rc.status === 1, wagerId: Number(await reg.nextWagerId()) - 1 }
            }
            case 'acceptWager': {
              const ow = new ethers.Wallet(ACCOUNT_KEYS[args.opponentIndex ?? 1], provider)
              tx = await new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, ow)
                .acceptWager(args.wagerId)
              break
            }
            case 'declareWinner': {
              const rw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, rw)
                .declareWinner(args.wagerId, args.winner)
              break
            }
            case 'claimRefund': {
              const cw2 = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, cw2)
                .claimRefund(args.wagerId)
              break
            }
            case 'claimPayout': {
              const pw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, pw)
                .claimPayout(args.wagerId)
              break
            }
            case 'cancelOpen': {
              const cow = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, cow)
                .cancelOpen(args.wagerId)
              break
            }
            case 'declineWager': {
              const dw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, dw)
                .declineWager(args.wagerId)
              break
            }
            case 'hasKey': {
              const kr = new ethers.Contract(d.contracts.keyRegistry, KEYREG_ABI, provider)
              return { ok: true, registered: await kr.hasKey(args.address) }
            }
            case 'tokenBalance': {
              const t = new ethers.Contract(args.token || d.paymentToken, TOKEN_ABI, provider)
              return { ok: true, balance: (await t.balanceOf(args.address)).toString() }
            }
            // ---- Spec 034 Wager Pools (#1232) ----
            case 'deployMockUSDCPermit': {
              // A fresh, isolated 6-dec USDC double with EIP-3009 support, for the gasless-join spec —
              // the local core payment token (18-dec MockERC20) has no `receiveWithAuthorization`.
              //
              // Explicit nonce management for the deploy-then-mint pair: two back-to-back sends from
              // the SAME wallet, each auto-computing its nonce via getTransactionCount('pending'),
              // intermittently raced under resetChainBetweenTests()' per-test evm_revert (observed in
              // CI as "Nonce too low. Expected nonce to be N+1 but got N") — the revert leaves the
              // node's pending-nonce bookkeeping momentarily inconsistent with 'latest'. Fetching once
              // from 'latest' and incrementing locally sidesteps it.
              let nonce = await provider.getTransactionCount(wallet.address, 'latest')
              const art = loadArtifact('mocks/MockUSDCPermit.sol', 'MockUSDCPermit')
              const cf = new ethers.ContractFactory(art.abi, art.bytecode, wallet)
              const c = await cf.deploy({ nonce: nonce++ })
              await c.waitForDeployment()
              const tokenAddr = await c.getAddress()
              if (args.mintTo) {
                await (await c.mint(args.mintTo, BigInt(args.amount ?? 10n ** 12n), { nonce: nonce++ })).wait(1)
              }
              return { ok: true, token: tokenAddr }
            }
            case 'createPool': {
              if (!d.contracts.wagerPoolFactory) {
                return { ok: false, error: 'wagerPoolFactory is not deployed — run deploy-wager-pool-factory.js --network localhost' }
              }
              const cw = new ethers.Wallet(ACCOUNT_KEYS[args.creatorIndex ?? 0], provider)
              const factory = new ethers.Contract(d.contracts.wagerPoolFactory, POOL_FACTORY_ABI, cw)
              // `resetChainBetweenTests()` reverts to a checkpoint taken once, real minutes before a
              // later test runs, and a `now` predicted from either `Date.now()` or a mere READ of
              // 'latest' kept reverting BadDeadlines() in CI regardless of which clock (or their max)
              // it was anchored to — a short window is exactly what exposes a predicted `now` that's
              // wrong by any amount. Stop predicting: force-mine an empty block and read what
              // timestamp Hardhat's automine ACTUALLY assigned it. That is (mechanism-independent of
              // whatever Hardhat does internally across the revert) the same rule the createPool tx's
              // own block gets, so anchoring to it is exact rather than estimated.
              await provider.send('evm_mine', [])
              const now = (await provider.getBlock('latest')).timestamp
              const params = {
                token: args.token || d.paymentToken,
                buyIn: BigInt(args.buyIn ?? 10n * 10n ** 18n),
                maxMembers: args.maxMembers ?? 5,
                thresholdBips: args.thresholdBips ?? 5100,
                acceptDeadline: now + (args.acceptIn ?? 3600),
                resolveDeadline: now + (args.resolveIn ?? 7200),
              }
              const sent = await factory.createPool(params)
              const rc = await sent.wait(1)
              const ev = rc.logs
                .map((l) => { try { return factory.interface.parseLog(l) } catch { return null } })
                .find((e) => e && e.name === 'PoolCreated')
              if (!ev) return { ok: false, error: 'PoolCreated event not found in receipt' }
              return { ok: rc.status === 1, poolId: Number(ev.args.poolId), pool: ev.args.pool }
            }
            case 'joinPool': {
              // Approve-then-join as account #index — mirrors the self-submit path usePools.joinPool
              // takes when no relayer is live (the path the mocked-wallet Cypress harness always hits).
              // Explicit nonce management: see the comment on deployMockUSDCPermit — the same
              // approve-then-send pattern from one wallet hit the same post-revert nonce race.
              const jw = new ethers.Wallet(ACCOUNT_KEYS[args.index ?? 1], provider)
              const tokenAddr = args.token || d.paymentToken
              const jTok = new ethers.Contract(tokenAddr, TOKEN_ABI, jw)
              const jPool = new ethers.Contract(args.pool, POOL_ABI, jw)
              const buyIn = BigInt(args.buyIn)
              let nonce = await provider.getTransactionCount(jw.address, 'latest')
              const allowance = await jTok.allowance(jw.address, args.pool)
              if (allowance < buyIn) await (await jTok.approve(args.pool, buyIn, { nonce: nonce++ })).wait(1)
              tx = await jPool.join({ nonce: nonce++ })
              break
            }
            case 'closeJoiningPool': {
              const ccw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(args.pool, POOL_ABI, ccw).closeJoining()
              break
            }
            case 'proposePoolOutcome': {
              const ppw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              const entries = args.entries.map((e) => ({ winner: e.winner, amount: BigInt(e.amount) }))
              tx = await new ethers.Contract(args.pool, POOL_ABI, ppw).proposeOutcome(entries)
              break
            }
            case 'approvePoolOutcome': {
              const apw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(args.pool, POOL_ABI, apw).approve()
              break
            }
            case 'claimPool': {
              const clw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              const entries = args.entries.map((e) => ({ winner: e.winner, amount: BigInt(e.amount) }))
              tx = await new ethers.Contract(args.pool, POOL_ABI, clw)
                .claim(entries, args.index, args.recipient || clw.address)
              break
            }
            case 'refundPool': {
              const rfw = new ethers.Wallet(ACCOUNT_KEYS[args.callerIndex ?? 0], provider)
              tx = await new ethers.Contract(args.pool, POOL_ABI, rfw).refund()
              break
            }
            case 'poolInfo': {
              const piPool = new ethers.Contract(args.pool, POOL_ABI, provider)
              const [state, memberCount, maxMembers, buyIn, tokenAddr, acceptDeadline, resolveDeadline, frozenDenominator, thresholdBips, currentProposalId] =
                await Promise.all([
                  piPool.state(), piPool.memberCount(), piPool.maxMembers(), piPool.buyIn(), piPool.token(),
                  piPool.acceptDeadline(), piPool.resolveDeadline(), piPool.frozenDenominator(),
                  piPool.thresholdBips(), piPool.currentProposalId(),
                ])
              return {
                ok: true,
                state: Number(state),
                memberCount: Number(memberCount),
                maxMembers: Number(maxMembers),
                buyIn: buyIn.toString(),
                token: tokenAddr,
                acceptDeadline: Number(acceptDeadline),
                resolveDeadline: Number(resolveDeadline),
                frozenDenominator: Number(frozenDenominator),
                thresholdBips: Number(thresholdBips),
                currentProposalId,
              }
            }
            case 'poolMemberInfo': {
              const pmPool = new ethers.Contract(args.pool, POOL_ABI, provider)
              const hasJoined = await pmPool.hasJoined(args.address)
              const refunded = await pmPool.refunded(args.address)
              const approvedBy = args.proposalId ? await pmPool.approvedBy(args.proposalId, args.address) : null
              return { ok: true, hasJoined, refunded, approvedBy }
            }
            case 'signPoolJoinAuthorization': {
              // Client-side signing only — no transaction. `fromIndex` is the JOINING member; they never
              // submit anything themselves (see submitPoolJoinAuthorization for the relayer leg).
              const fromWallet = new ethers.Wallet(ACCOUNT_KEYS[args.fromIndex ?? 1], provider)
              const value = BigInt(args.value)
              const nowBlk = (await provider.getBlock('latest')).timestamp
              const validAfter = args.validAfter ?? 0
              const validBefore = args.validBefore ?? nowBlk + 3600
              const nonce = ethers.hexlify(ethers.randomBytes(32))
              const domain = { name: 'USD Coin', version: '1', chainId: E2E_CHAIN_ID, verifyingContract: args.token }
              const message = { from: fromWallet.address, to: args.pool, value, validAfter, validBefore, nonce }
              const sig = await fromWallet.signTypedData(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, message)
              const { v, r, s } = ethers.Signature.from(sig)
              return {
                ok: true, from: fromWallet.address, value: value.toString(), validAfter, validBefore, nonce, v, r, s,
              }
            }
            case 'submitPoolJoinAuthorization': {
              // Submitted by a DIFFERENT account (the relayer) — proves the joining member never sent a
              // transaction, only signed one. Resubmitting the same signature must revert — either the
              // pool's own AlreadyJoined guard or the token's authorization-reuse check, whichever runs
              // first — never a second join or a second pull of funds.
              const relayer = new ethers.Wallet(ACCOUNT_KEYS[args.relayerIndex ?? 0], provider)
              const rPool = new ethers.Contract(args.pool, POOL_ABI, relayer)
              tx = await rPool.joinWithAuthorization(
                args.from, BigInt(args.value), args.validAfter, args.validBefore, args.nonce, args.v, args.r, args.s
              )
              break
            }
            case 'isFrozen': {
              const reg3 = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, provider)
              return { ok: true, frozen: await reg3.isFrozen(args.address) }
            }
            case 'autoResolve':
              tx = await registry.autoResolveFromPolymarket(args.wagerId); break
            case 'prepareCondition': {
              // Prepare a FRESH Polymarket condition owned by #0; return its id.
              // The questionId is salted so reusing the node across runs can't
              // collide with an already-prepared/resolved condition (createWager
              // reverts ConditionAlreadyResolved on a resolved id).
              const oracle = wallet.address
              const salt = `${args.question || 'q'}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
              const qid = ethers.id(salt)
              const cid = await ctf.getConditionId(oracle, qid, 2)
              await (await ctf.prepareCondition(oracle, qid, 2)).wait(1)
              return { ok: true, conditionId: cid }
            }
            case 'wagerInfo': {
              const reg2 = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, provider)
              const w = await reg2.getWager(args.wagerId)
              return {
                ok: true, status: Number(w.status), winner: w.winner, paid: w.paid, metadataUri: w.metadataUri,
                resolutionType: Number(w.resolutionType), creator: w.creator, opponent: w.opponent,
              }
            }
            case 'pause':
              if (await registry.paused()) return { ok: true, noop: true }
              tx = await registry.pause(); break
            case 'unpause':
              if (!(await registry.paused())) return { ok: true, noop: true }
              tx = await registry.unpause(); break
            case 'freeze':
              tx = await registry.freezeAccount(args.address, args.reason || 'e2e'); break
            case 'unfreeze':
              if (!(await registry.isFrozen(args.address))) return { ok: true, noop: true }
              tx = await registry.unfreezeAccount(args.address); break
            case 'grantMembership':
              tx = await membership.grantMembership(
                args.address, WAGER_PARTICIPANT_ROLE, args.tier ?? 1, args.durationDays ?? 30
              ); break
            case 'resolveCondition':
              tx = await ctf.resolveCondition(args.conditionId, args.payouts); break

            // ---------------------------------------------------------------- spec 060 fees
            /*
             * The coordinates the fee spec needs, read from the deployment record and the chain
             * rather than restated in the spec. Two of them are assertions in disguise:
             *
             *   · a `feeRouter` the FRONTEND cannot resolve makes every quote fail and every
             *     deposit block, which would look like a product bug rather than a missing
             *     fixture — so the spec compares this address against the one the app is built
             *     with and says which it is;
             *   · a ZERO treasury means the router SKIPS the fee (FeeRouter.depositToVaultWithFee),
             *     so a "charged the disclosed rate" assertion would pass at a rate of nothing.
             *     Reported here so the spec can refuse to run rather than prove the wrong thing.
             */
            case 'feeFixtures': {
              const routerAddress = d.contracts?.feeRouter
              const vaultAddress = d.mocks?.mockEarnVault
              if (!routerAddress || !vaultAddress) {
                return {
                  ok: false,
                  error:
                    `the local deployment record has no ${!routerAddress ? 'contracts.feeRouter' : 'mocks.mockEarnVault'} — ` +
                    'run `npm run setup:e2e` (which deploys both) before the fee specs',
                }
              }
              const feeRouter = new ethers.Contract(routerAddress, FEE_ROUTER_ABI, provider)
              const vault = new ethers.Contract(vaultAddress, VAULT_ABI, provider)
              return {
                ok: true,
                feeRouter: routerAddress,
                treasury: await feeRouter.treasury(),
                vault: vaultAddress,
                asset: await vault.asset(),
              }
            }
            case 'feeService': {
              const feeRouter = new ethers.Contract(d.contracts.feeRouter, FEE_ROUTER_ABI, provider)
              const svc = await feeRouter.getService(ethers.id(args.label))
              return {
                ok: true,
                kind: Number(svc.kind),
                feeBps: Number(svc.feeBps),
                capBps: Number(svc.capBps),
              }
            }
            case 'setFeeBps': {
              // Sent as #0, which the local deploy seeds with FEE_ADMIN_ROLE on the router it
              // initialised. Used to ARRANGE a rate; the flow that proves an operator can change
              // one drives the AdminPanel Fees tab instead.
              const feeRouter = new ethers.Contract(d.contracts.feeRouter, FEE_ROUTER_ABI, wallet)
              tx = await feeRouter.setFeeBps(ethers.id(args.label), args.bps)
              break
            }
            case 'feeHistory': {
              const feeRouter = new ethers.Contract(d.contracts.feeRouter, FEE_ROUTER_ABI, provider)
              const filter = feeRouter.filters.FeeBpsChanged(ethers.id(args.label))
              const logs = await feeRouter.queryFilter(filter, args.fromBlock ?? 0, 'latest')
              return {
                ok: true,
                changes: logs.map((l) => ({
                  oldBps: Number(l.args.oldBps),
                  newBps: Number(l.args.newBps),
                  actor: l.args.actor,
                  blockNumber: l.blockNumber,
                })),
              }
            }
            case 'vaultPosition': {
              const vault = new ethers.Contract(d.mocks.mockEarnVault, VAULT_ABI, provider)
              const shares = await vault.balanceOf(args.address)
              return {
                ok: true,
                shares: shares.toString(),
                assets: (await vault.convertToAssets(shares)).toString(),
                totalAssets: (await vault.totalAssets()).toString(),
              }
            }
            case 'blockNumber':
              return { ok: true, blockNumber: await provider.getBlockNumber() }

            default:
              throw new Error(`chainTx: unknown action '${action}'`)
          }
          const receipt = await tx.wait(1)
          return { ok: receipt.status === 1, hash: receipt.hash }
          } catch (e) {
            // Return a soft failure so specs can assert "blocked" cases (e.g. a
            // premature claimRefund) instead of the task rejecting the test.
            return { ok: false, error: describeRevert(e) }
          }
        },

        /**
         * Fixtures for the legacy account recovery sweep (spec 062).
         *
         * The sweep signs with a key the MEMBER pastes in, not with the connected wallet, so a
         * test needs a real funded EOA whose private key it can hand to the UI. Every run mints
         * a FRESH one: a fixed key would accumulate balances across runs and make "what moved"
         * a function of how many times the suite had been run.
         *
         * `makeTokenRefuse` is how ONE asset is failed without disturbing the others — see its
         * own comment for why a drained balance cannot do that job.
         *
         * action ∈ newAccount | makeTokenRefuse | fundNative | mintToken | balances |
         *          deploymentAddresses
         */
        /**
         * Fixtures for Protect (specs 043 / 049 / 068).
         *
         * A Safe is a real contract, and every test here needs one that already exists — so the
         * vault is created on chain by this task and brought into the app through its own "Load
         * existing" path. Only `custody.create-vault` drives the wizard, because only that test is
         * about creating one.
         *
         * The canonical Safe v1.4.1 addresses are the same ones the app resolves
         * (frontend/src/config/safeContracts.js); `scripts/e2e/setup-custody-fixtures.js` is what
         * puts code behind them on this chain, and this task fails loudly if that has not run.
         *
         * action ∈ createVault | fundVault | vaultInfo | nativeBalance
         */
        async custodyFixture({ action, args = {} }) {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const provider = new ethers.JsonRpcProvider(rpcUrl, E2E_CHAIN_ID, { staticNetwork: true })
          const funder = new ethers.NonceManager(new ethers.Wallet(config.env.PRIVATE_KEY, provider))

          const SAFE = {
            singletonL2: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',
            proxyFactory: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
            fallbackHandler: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99',
          }
          const SAFE_ABI = [
            'function setup(address[] owners, uint256 threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
            'function getOwners() view returns (address[])',
            'function getThreshold() view returns (uint256)',
            'function nonce() view returns (uint256)',
            'function VERSION() view returns (string)',
            'function getStorageAt(uint256 offset, uint256 length) view returns (bytes)',
          ]
          const FACTORY_ABI = [
            'function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
            'event ProxyCreation(address indexed proxy, address singleton)',
          ]
          // Safe keeps its guard in a fixed storage slot (keccak256("guard_manager.guard.address")).
          const GUARD_SLOT = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8'

          try {
            switch (action) {
              case 'createVault': {
                if ((await provider.getCode(SAFE.proxyFactory)) === '0x') {
                  throw new Error(
                    'no Safe proxy factory on this chain — run `npm run setup:e2e:custody` ' +
                    '(scripts/e2e/setup-custody-fixtures.js) before the custody specs',
                  )
                }
                const safeIface = new ethers.Interface(SAFE_ABI)
                const initializer = safeIface.encodeFunctionData('setup', [
                  args.owners, args.threshold, ethers.ZeroAddress, '0x',
                  SAFE.fallbackHandler, ethers.ZeroAddress, 0, ethers.ZeroAddress,
                ])
                const factory = new ethers.Contract(SAFE.proxyFactory, FACTORY_ABI, funder)
                // A distinct salt per call so repeated runs never collide on an existing proxy.
                const saltNonce = BigInt(args.saltNonce ?? Date.now())
                const rc = await (await factory.createProxyWithNonce(
                  SAFE.singletonL2, initializer, saltNonce,
                )).wait(1)
                const created = rc.logs
                  .map((l) => { try { return factory.interface.parseLog(l) } catch { return null } })
                  .find((parsed) => parsed && parsed.name === 'ProxyCreation')
                if (!created) throw new Error('no ProxyCreation event — the vault was not deployed')
                return { ok: true, address: created.args[0] }
              }
              case 'fundVault': {
                const rc = await (await funder.sendTransaction({
                  to: args.address,
                  value: BigInt(args.amount ?? String(10n ** 18n)),
                })).wait(1)
                return { ok: rc.status === 1 }
              }
              case 'vaultInfo': {
                const safe = new ethers.Contract(args.address, SAFE_ABI, provider)
                const [owners, threshold, nonce, version, guardWord] = await Promise.all([
                  safe.getOwners(), safe.getThreshold(), safe.nonce(), safe.VERSION(),
                  provider.getStorage(args.address, GUARD_SLOT),
                ])
                return {
                  ok: true,
                  owners: owners.map((o) => String(o)),
                  threshold: Number(threshold),
                  nonce: Number(nonce),
                  version,
                  // The guard is the low 20 bytes of that slot; ZeroAddress means "no guard".
                  guard: ethers.getAddress('0x' + guardWord.slice(-40)),
                }
              }
              case 'nativeBalance':
                return { ok: true, balance: (await provider.getBalance(args.address)).toString() }
              default:
                throw new Error(`custodyFixture: unknown action '${action}'`)
            }
          } catch (e) {
            return { ok: false, error: e.shortMessage || e.reason || e.message }
          }
        },

        async legacyFixture({ action, args = {} }) {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const provider = new ethers.JsonRpcProvider(rpcUrl, E2E_CHAIN_ID, { staticNetwork: true })
          /*
           * NonceManager, not a bare Wallet: several fixture actions send two transactions in a
           * row (deploy then arm), and ethers caches the nonce lookup for a moment — on a local
           * chain the second send reuses the first's nonce and is rejected. The fixture's sends
           * must all land, so tracking the nonce locally is exactly right here.
           */
          const funder = new ethers.NonceManager(new ethers.Wallet(config.env.PRIVATE_KEY, provider))
          const d = loadLocalDeployment()
          /*
           * WHICH token the sweep sees is decided by the APP, not by this record — the portfolio
           * registry scans what `config/wrappedNative.js` and the network's stablecoin config
           * resolve. So the caller passes the address the app will actually read, and the spec
           * asserts that address against this record: the two agreeing is a fact worth checking,
           * not one to assume (the frontend's constants are only refreshed by
           * `npm run sync:frontend-contracts`, which the E2E job does not run).
           */
          const tokenAddress = args.token || d.wmatic
          const token = new ethers.Contract(tokenAddress, TOKEN_ABI, funder)

          try {
            switch (action) {
              case 'newAccount': {
                const wallet = ethers.Wallet.createRandom()
                return { ok: true, address: wallet.address, privateKey: wallet.privateKey, tokenAddress }
              }
              case 'makeTokenRefuse': {
                /*
                 * Make ONE transfer of an existing token fail, without touching its balances.
                 *
                 * Deploy ReentrantToken, copy its RUNTIME code over the token's, and arm it to
                 * re-enter the token itself with an unknown selector — the token has no fallback,
                 * so that call reverts and the transfer reverts with it. Only the code changes:
                 * ERC-20 storage lives in the same slots, so who holds what is unchanged, and the
                 * per-spec chain checkpoint puts the original code back.
                 *
                 * This is the only way to fail one asset and not the others: `sweepAllAssets`
                 * re-reads balances itself, so emptying a token just drops it from the run.
                 */
                const artifactPath = resolve(
                  __dirname, '..', 'artifacts', 'contracts', 'mocks', 'ReentrantToken.sol', 'ReentrantToken.json',
                )
                const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
                const deployed = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, funder).deploy()
                await deployed.waitForDeployment()
                await provider.send('hardhat_setCode', [
                  tokenAddress,
                  await provider.getCode(await deployed.getAddress()),
                ])
                const rc = await (await new ethers.Contract(tokenAddress, ARMED_TOKEN_ABI, funder)
                  .arm(tokenAddress, '0xdeadbeef')).wait(1)
                return { ok: rc.status === 1, address: tokenAddress }
              }
              case 'fundNative': {
                const tx = await funder.sendTransaction({
                  to: args.address,
                  value: BigInt(args.amount ?? String(10n ** 18n)),
                })
                const rc = await tx.wait(1)
                return { ok: rc.status === 1 }
              }
              case 'mintToken': {
                const rc = await (await token.mint(args.address, BigInt(args.amount ?? String(10n ** 18n)))).wait(1)
                return { ok: rc.status === 1 }
              }
              case 'deploymentAddresses':
                return { ok: true, paymentToken: d.paymentToken, wmatic: d.wmatic }
              case 'balances': {
                // `tokens` is an ORDERED list so the caller can index it the same way it named it.
                const tokens = args.tokens || [tokenAddress]
                const native = await provider.getBalance(args.address)
                const reads = await Promise.all(
                  tokens.map((t) =>
                    new ethers.Contract(t, TOKEN_ABI, provider).balanceOf(args.address),
                  ),
                )
                return { ok: true, native: native.toString(), tokens: reads.map((b) => b.toString()) }
              }
              default:
                throw new Error(`legacyFixture: unknown action '${action}'`)
            }
          } catch (e) {
            return { ok: false, error: e.shortMessage || e.reason || e.message }
          }
        },

        /**
         * The chain's current timestamp, in ms. The app decides every expiry in BROWSER time
         * while the registry enforces in CHAIN time, so a deadline test is only meaningful
         * when the two agree — see cy.syncBrowserClockToChain.
         */
        async chainNow() {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const provider = new ethers.JsonRpcProvider(rpcUrl, E2E_CHAIN_ID, { staticNetwork: true })
          const block = await provider.getBlock('latest')
          return { ok: true, nowMs: Number(block.timestamp) * 1000 }
        },

        /** Read the latest wager id (nextWagerId - 1) for status/winner assertions. */
        async lastWagerId() {
          const provider = new ethers.JsonRpcProvider(config.env.RPC_URL, E2E_CHAIN_ID, { staticNetwork: true })
          const d = loadLocalDeployment()
          const registry = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, provider)
          const next = await registry.nextWagerId()
          return Number(next) - 1
        },

        /**
         * Revert the chain to the last checkpoint (post-seed state) and take a fresh one.
         * Called from the support file's `before` at the start of every FULL-tier spec.
         * Restores the clock AND the state: keys registered or wagers created by a previous
         * spec are rolled back too, which is why each spec's own `before` hook re-establishes
         * its preconditions (ensureEncryptionKeys already checks hasKey and re-registers).
         */
        async chainCheckpoint() {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const chainId = Number(config.env.NETWORK_ID) || 1337
          const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })
          let reverted = false
          if (chainSnapshotId !== null) {
            reverted = await provider.send('evm_revert', [chainSnapshotId])
            if (!reverted) {
              // FAIL FAST. A false return means the snapshot id was invalid or already
              // consumed — the next spec would run on a dirty clock/state and this task
              // would then re-snapshot the contamination as if it were the baseline.
              // A loud death here is a broken harness; a quiet one is a wrong measurement.
              throw new Error(
                `chainCheckpoint: evm_revert(${chainSnapshotId}) returned false — ` +
                'refusing to re-snapshot a dirty chain. Restart the node and re-seed.'
              )
            }
          }
          chainSnapshotId = await provider.send('evm_snapshot', [])
          return { reverted, snapshotId: chainSnapshotId }
        },

        /*
         * Move the restore point FORWARD without reverting: drop the held snapshot id and take
         * a new one at the current state. A spec whose before-hook writes durable fixtures
         * (encryption keys, membership) calls this after that hook, so per-test reverts land
         * AFTER the fixtures rather than wiping them — reverting to the spec-start snapshot
         * would undo the very setup the tests depend on.
         */
        async chainRebase() {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const chainId = Number(config.env.NETWORK_ID) || 1337
          const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })
          chainSnapshotId = await provider.send('evm_snapshot', [])
          return { snapshotId: chainSnapshotId }
        },
      })

      /*
       * Keep video only for specs that actually failed. A video of a passing spec is
       * never watched, and the artifact upload only runs `if: failure()` anyway — so on
       * a mixed run this drops every passing spec's recording before it is ever bundled.
       * Deleting here rather than in the workflow means the bytes never leave the runner.
       */
      on('after:spec', (spec, results) => {
        if (!results?.video) return
        const failed = (results.tests ?? []).some((test) =>
          (test.attempts ?? []).some((attempt) => attempt.state === 'failed')
        )
        if (failed) return
        try {
          unlinkSync(results.video)
        } catch {
          // Already gone (or never written) — nothing to reclaim, and this must not
          // fail the run: video cleanup is housekeeping, not a gate.
        }
      })

      return config
    },
  },

  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
})
