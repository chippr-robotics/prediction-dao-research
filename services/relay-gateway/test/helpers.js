/**
 * Test helpers: config against the REAL deployments/ records (the version-pinned target set),
 * mock providers/engine (dependency injection), and typed-data signing utilities that mirror
 * the spec-035 schemas exactly (via src/intent/intentTypes.js — one source of truth).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'
import { loadConfig } from '../src/config/index.js'
import { CONTRACT_DOMAINS, RECEIVE_WITH_AUTHORIZATION_TYPES, typesFor, ACTIONS } from '../src/intent/intentTypes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEPLOYMENTS_DIR = path.resolve(__dirname, '../../../deployments')

export const ORIGIN_SECRET = 'test-origin-secret'
export const WEBHOOK_SECRET = 'test-webhook-secret'

export const TEST_NOW = 1_800_000_000 // fixed unix seconds for deterministic windows

export function testConfig(envOverrides = {}) {
  return loadConfig(
    {
      ENABLED_CHAIN_IDS: '137,80002,63',
      ORIGIN_AUTH_SECRET: ORIGIN_SECRET,
      WEBHOOK_SHARED_SECRET: WEBHOOK_SECRET,
      ENGINE_URL: 'http://engine.test.invalid',
      ...envOverrides,
    },
    { deploymentsDir: DEPLOYMENTS_DIR }
  )
}

const abi = ethers.AbiCoder.defaultAbiCoder()

/**
 * Mock read-provider. `allowed` controls the sanctions answer; `screenError` throws on call
 * (fail-closed path); estimateGas/getFeeData resolve to stable numbers.
 */
export function mockProvider({
  allowed = true,
  screenError = false,
  blockNumber = 1,
  balanceWei = 10n ** 18n,
  // ERC-1271 fallback behavior (spec 041): map of lowercase address ->
  // 'magic' | 'wrong' | 'revert' | 'empty'. Calls to isValidSignature
  // (selector 0x1626ba7e) on those addresses answer accordingly; addresses
  // not in the map behave like codeless accounts (eth_call returns '0x').
  erc1271 = {},
} = {}) {
  return {
    async call(tx) {
      if (screenError) throw new Error('rpc unreachable')
      if (tx?.data?.startsWith('0x1626ba7e')) {
        const mode = erc1271[tx.to?.toLowerCase()]
        if (mode === 'magic') return '0x1626ba7e' + '0'.repeat(56)
        if (mode === 'wrong') return '0xdeadbeef' + '0'.repeat(56)
        if (mode === 'revert') throw new Error('execution reverted')
        return '0x' // codeless / empty return
      }
      return abi.encode(['bool'], [allowed])
    },
    async estimateGas() {
      return 100_000n
    },
    async getFeeData() {
      return { gasPrice: 30_000_000_000n, maxFeePerGas: 30_000_000_000n }
    },
    async getBlockNumber() {
      if (screenError) throw new Error('rpc unreachable')
      return blockNumber
    },
    async getBalance() {
      return balanceWei
    },
  }
}

export function mockProviders(config, opts = {}) {
  const providers = {}
  for (const id of config.enabledChainIds) providers[id] = mockProvider(opts[id] ?? opts)
  return providers
}

/** Mock engine client recording submissions; each returns a fresh id + hash. */
export function mockEngine({ fail = false } = {}) {
  const submissions = []
  let n = 0
  return {
    submissions,
    async submitTransaction(args) {
      if (fail) {
        const { EngineUnavailableError } = await import('../src/errors.js')
        throw new EngineUnavailableError('engine down')
      }
      n += 1
      const tx = { id: `engine-tx-${n}`, hash: `0x${String(n).padStart(64, '0')}`, status: 'pending' }
      submissions.push({ args, tx })
      return tx
    },
  }
}

export const wallet = new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d') // hardhat #1

export function randomMarker() {
  return ethers.hexlify(ethers.randomBytes(32))
}

/**
 * Build + sign a signer-attributed intent body (default: claimPayout on the given chain,
 * against that chain's pinned WagerRegistry).
 */
export async function signedIntent(config, {
  chainId = 137,
  action = 'claimPayout',
  signer = wallet,
  params,
  validAfter = 0,
  validBefore = TEST_NOW + 3600,
  marker = randomMarker(),
  domainChainId, // sign under ANOTHER chain's domain to provoke chain_mismatch
  targetContract,
  actorAddress, // spec 041: set to a CONTRACT address to exercise the ERC-1271 fallback
                // (the ECDSA signature then recovers to `signer`, never to the actor)
} = {}) {
  const def = ACTIONS[action]
  const chain = config.chains[chainId]
  const domainChain = config.chains[domainChainId ?? chainId]
  const verifyingContract = domainChain.targetsByKey[def.contract]
  const domain = {
    ...CONTRACT_DOMAINS[def.contract],
    chainId: domainChainId ?? chainId,
    verifyingContract,
  }
  const actorField = def.actorField
  const baseParams = params ?? { wagerId: 1 }
  const actor = actorAddress ?? signer.address
  const message = {
    ...baseParams,
    [actorField]: actor,
    nonce: marker,
    validAfter,
    validBefore,
  }
  const signature = await signer.signTypedData(domain, typesFor(action), message)
  return {
    intentClass: 'signer-attributed',
    chainId,
    targetContract: targetContract ?? chain.targetsByKey[def.contract],
    action,
    params: { ...baseParams, [actorField]: actor },
    signature,
    validAfter,
    validBefore,
    uniquenessMarker: marker,
    fundingMode: 'sponsored',
  }
}

/** Build + sign a payment-class intent (default: purchaseTier on 137, both legs signed). */
export async function signedPaymentIntent(config, {
  chainId = 137,
  action = 'purchaseTier',
  signer = wallet,
  value = 1_000_000n,
  validAfter = 0,
  validBefore = TEST_NOW + 3600,
  marker = randomMarker(),
} = {}) {
  const def = ACTIONS[action]
  const chain = config.chains[chainId]
  const target = chain.targetsByKey[def.contract]

  // Money leg: EIP-3009 ReceiveWithAuthorization under the token's own domain.
  const tokenDomain = {
    name: chain.tokenDomain.name,
    version: chain.tokenDomain.version,
    chainId,
    verifyingContract: chain.paymentToken,
  }
  const auth = {
    from: signer.address,
    to: target,
    value,
    validAfter,
    validBefore,
    nonce: marker, // payment class: uniquenessMarker IS the EIP-3009 nonce (data-model.md)
  }
  const authSig = ethers.Signature.from(
    await signer.signTypedData(tokenDomain, RECEIVE_WITH_AUTHORIZATION_TYPES, auth)
  )

  // Intent leg: the action struct under the contract's domain.
  const role = ethers.id('POOL_PARTICIPANT_ROLE')
  const termsHash = ethers.id('terms-v1')
  const params = { role, tier: 1, acceptedTermsHash: termsHash }
  const message = {
    ...params,
    member: signer.address,
    paymentNonce: marker,
    nonce: marker,
    validAfter,
    validBefore,
  }
  const domain = { ...CONTRACT_DOMAINS[def.contract], chainId, verifyingContract: target }
  const signature = await signer.signTypedData(domain, typesFor(action), message)

  return {
    intentClass: 'payment',
    chainId,
    targetContract: target,
    action,
    params,
    signature,
    authorization: { ...auth, value: value.toString(), v: authSig.v, r: authSig.r, s: authSig.s },
    validAfter,
    validBefore,
    uniquenessMarker: marker,
    fundingMode: 'sponsored',
  }
}
