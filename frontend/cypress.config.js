import { defineConfig } from 'cypress'
import { ethers } from 'ethers'
import { readFileSync } from 'fs'
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
]
const TOKEN_ABI = [
  'function mint(address to, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]

/**
 * Read the local deployment record written by `npm run deploy:local`
 * (`--network localhost` → `deployments/localhost-chain1337-v2.json`). This is
 * the same source `sync:frontend-contracts` mirrors into the UI's
 * HARDHAT_CONTRACTS, so the addresses match what the app uses.
 */
function loadLocalDeployment() {
  const path = resolve(__dirname, '..', 'deployments', 'localhost-chain1337-v2.json')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 30000,

    env: {
      // Hardhat local testnet configuration
      NETWORK_ID: 1337,
      RPC_URL: 'http://localhost:8545',
      // Test wallet private key (Hardhat account #0 — holds all admin roles locally)
      PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },

    setupNodeEvents(on, config) {
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
          const provider = new ethers.JsonRpcProvider(rpcUrl, 1337, { staticNetwork: true })
          const wallet = new ethers.Wallet(config.env.PRIVATE_KEY, provider)
          const d = loadLocalDeployment()
          const registry = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, wallet)
          const membership = new ethers.Contract(d.contracts.membershipManager, MEMBERSHIP_ABI, wallet)
          const ctfAddr = (d.mocks && d.mocks.mockPolymarketCTF) || d.polymarketCTF
          const ctf = new ethers.Contract(ctfAddr, CTF_ABI, wallet)
          const token = new ethers.Contract(d.paymentToken, TOKEN_ABI, wallet)

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
        },

        /** Read the latest wager id (nextWagerId - 1) for status/winner assertions. */
        async lastWagerId() {
          const provider = new ethers.JsonRpcProvider(config.env.RPC_URL, 1337, { staticNetwork: true })
          const d = loadLocalDeployment()
          const registry = new ethers.Contract(d.contracts.wagerRegistry, REGISTRY_ABI, provider)
          const next = await registry.nextWagerId()
          return Number(next) - 1
        },
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
