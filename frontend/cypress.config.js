import { defineConfig } from 'cypress'
import { ethers } from 'ethers'
import { readFileSync, unlinkSync } from 'fs'
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
]
const KEYREG_ABI = [
  'function hasKey(address user) view returns (bool)',
  'function getPublicKey(address user) view returns (bytes)',
]

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

/*
 * Name the custom error behind a revert.
 *
 * The task drives the registry through a minimal human-readable ABI, which carries no error
 * fragments — so every custom error arrived as the useless "execution reverted (unknown custom
 * error)". ORC-01/02 reported exactly that. Decode against the compiled artifacts instead;
 * BOTH facets are needed because the proxy delegates unknown selectors to WagerRegistryIntents,
 * which is where autoResolveFrom* lives (spec 035/036).
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
              const stake = BigInt(args.stake ?? (10n ** 18n))
              const sent = await creg.createWager(
                args.opponent, args.arbitrator || ethers.ZeroAddress, d.paymentToken,
                stake, stake,
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
            case 'hasKey': {
              const kr = new ethers.Contract(d.contracts.keyRegistry, KEYREG_ABI, provider)
              return { ok: true, registered: await kr.hasKey(args.address) }
            }
            case 'tokenBalance': {
              const t = new ethers.Contract(d.paymentToken, TOKEN_ABI, provider)
              return { ok: true, balance: (await t.balanceOf(args.address)).toString() }
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
              return { ok: true, status: Number(w.status), winner: w.winner, paid: w.paid, metadataUri: w.metadataUri }
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
