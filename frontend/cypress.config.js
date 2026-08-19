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
  'function burn(address from, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
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
            return { ok: false, error: e.shortMessage || e.reason || e.message }
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
         * The wrapped-native token on the local chain is a MockERC20 with permissionless
         * mint/burn, which is what makes `burn` available as a way to force ONE asset to fail
         * while the others still move — the realistic race the sweep must survive is the
         * balance changing between the quote and the transfer.
         *
         * action ∈ newAccount | fundNative | mintToken | burnToken | balances
         */
        async legacyFixture({ action, args = {} }) {
          const rpcUrl = config.env.RPC_URL || 'http://localhost:8545'
          const provider = new ethers.JsonRpcProvider(rpcUrl, 1337, { staticNetwork: true })
          /*
           * NonceManager, not a bare Wallet: several fixture actions send two transactions in a
           * row (deploy then arm), and ethers caches the nonce lookup for a moment — on a local
           * chain the second send reuses the first's nonce and is rejected. The fixture's sends
           * must all land, so tracking the nonce locally is exactly right here.
           */
          const funder = new ethers.NonceManager(new ethers.Wallet(config.env.PRIVATE_KEY, provider))
          const d = loadLocalDeployment()
          /*
           * WHICH token the sweep sees is decided by the APP, not by this record: the portfolio
           * registry scans the wrapped native that `config/wrappedNative.js` resolves, which on
           * 1337 is `HARDHAT_CONTRACTS.wmatic` — a constant in the frontend source. A fresh
           * `deploy:local` does NOT land the mock there: the mocks are CREATE2-addressed from
           * their own initcode, so a compiler or OpenZeppelin bump moves them, and the frontend
           * constant is only refreshed by `npm run sync:frontend-contracts`, which the E2E job
           * does not run. So the caller passes the address the app will actually read, and
           * `installTokenAt` copies the freshly deployed mock's runtime code there.
           *
           * Placing the code (rather than pointing the test at the real deployment) is what keeps
           * this spec testing the app's own resolution path instead of a private arrangement
           * between the test and the chain.
           */
          const tokenAddress = args.token || d.wmatic
          const token = new ethers.Contract(tokenAddress, TOKEN_ABI, funder)

          try {
            switch (action) {
              case 'newAccount': {
                const wallet = ethers.Wallet.createRandom()
                return { ok: true, address: wallet.address, privateKey: wallet.privateKey, tokenAddress }
              }
              case 'installTokenAt': {
                /*
                 * Deploy ReentrantToken and copy its RUNTIME code to the address the app scans.
                 * Storage at that address starts empty, which is fine: the app takes symbol and
                 * decimals from its own config and only ever calls balanceOf / transfer here.
                 */
                const artifactPath = resolve(
                  __dirname, '..', 'artifacts', 'contracts', 'mocks', 'ReentrantToken.sol', 'ReentrantToken.json',
                )
                const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
                const deployed = await new ethers.ContractFactory(
                  artifact.abi, artifact.bytecode, funder,
                ).deploy()
                await deployed.waitForDeployment()
                const code = await provider.getCode(await deployed.getAddress())
                await provider.send('hardhat_setCode', [tokenAddress, code])
                // Leave it in a KNOWN state: armed at address(0) with no data, which is a call
                // that always succeeds, so an arming left over from a previous test cannot make
                // an unrelated transfer revert.
                await (await new ethers.Contract(tokenAddress, ARMED_TOKEN_ABI, funder)
                  .arm(ethers.ZeroAddress, '0x')).wait(1)
                return { ok: true, address: tokenAddress }
              }
              case 'armTokenToRefuse': {
                // Arm the next transfer to re-enter the token itself with an unknown selector.
                // The token has no fallback, so that call reverts and the transfer reverts with
                // it — one transfer refused, nothing else about the account changed.
                const rc = await (await new ethers.Contract(tokenAddress, ARMED_TOKEN_ABI, funder)
                  .arm(tokenAddress, '0xdeadbeef')).wait(1)
                return { ok: rc.status === 1 }
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
              case 'burnToken': {
                const rc = await (await token.burn(args.address, BigInt(args.amount))).wait(1)
                return { ok: rc.status === 1 }
              }
              case 'balances': {
                const [native, erc20] = await Promise.all([
                  provider.getBalance(args.address),
                  new ethers.Contract(tokenAddress, TOKEN_ABI, provider).balanceOf(args.address),
                ])
                return { ok: true, native: native.toString(), token: erc20.toString(), tokenAddress }
              }
              default:
                throw new Error(`legacyFixture: unknown action '${action}'`)
            }
          } catch (e) {
            return { ok: false, error: e.shortMessage || e.reason || e.message }
          }
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
