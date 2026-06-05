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
]
const MEMBERSHIP_ABI = [
  'function grantMembership(address user, bytes32 role, uint8 tier, uint32 durationDays)',
]
const CTF_ABI = [
  'function resolveCondition(bytes32 conditionId, uint256[] payouts)',
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

          let tx
          switch (action) {
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
