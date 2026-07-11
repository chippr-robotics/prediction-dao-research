/**
 * Test helpers: config against the REAL deployments/ records (the version-pinned target set),
 * mock providers/engine (dependency injection), and typed-data signing utilities that mirror
 * the spec-035 schemas exactly (via src/intent/intentTypes.js — one source of truth).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ethers } from 'ethers'
import { loadConfig } from '../src/config/index.js'
import { CONTRACT_DOMAINS, RECEIVE_WITH_AUTHORIZATION_TYPES, typesFor, ACTIONS, INTENT_TYPES } from '../src/intent/intentTypes.js'

// Selector for WagerPoolFactory.poolAddressToId(address) — the Tier-2 provenance eth_call.
const POOL_ID_SELECTOR = ethers.id('poolAddressToId(address)').slice(0, 10)

/** Recursively convert BigInts to decimal strings so a body survives JSON.stringify (mirrors the client). */
function jsonSafe(v) {
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return v.map(jsonSafe)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]))
  return v
}

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
  // Tier-2 pool provenance: WagerPoolFactory.poolAddressToId(address) answer. Default 1 (nonzero =>
  // recognized clone). Set 0 to simulate an unknown/forged pool address (400 target_not_allowlisted).
  poolId = 1n,
  // When set, the provenance call returns this RAW hex verbatim (e.g. '0x' to simulate a
  // malformed/empty node response). Overrides `poolId` — used to assert the decode-failure path
  // maps to a retryable 503 (never-stranded), not a hard 400.
  poolIdRaw = null,
  // Sponsored-paymaster (spec 050): EntryPoint.balanceOf(paymaster) answer for the /status deposit
  // runway. Selector 0x70a08231.
  depositWei = 0n,
} = {}) {
  return {
    async call(tx) {
      if (screenError) throw new Error('rpc unreachable')
      if (tx?.data?.startsWith('0x70a08231')) return abi.encode(['uint256'], [depositWei])
      if (tx?.data?.startsWith(POOL_ID_SELECTOR)) {
        if (poolIdRaw != null) return poolIdRaw
        return abi.encode(['uint256'], [poolId])
      }
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

// A stand-in pool clone address for provenance-mocked tests (mockProvider answers poolAddressToId).
export const POOL_ADDRESS = '0x1111111111111111111111111111111111111111'

/**
 * Build + sign a Tier-2 pool signer-attributed intent. Targets the factory, but signs under the CLONE's
 * domain (verifyingContract = `pool`) for the six actor twins, or the FACTORY's domain for poolCreate.
 * `params` supplies the action-specific struct/calldata fields (proposalId, entries, index, recipient,
 * or the createPool tuple); the actor field is filled with the signer.
 */
export async function signedPoolIntent(config, {
  chainId = 137,
  action = 'poolApprove',
  signer = wallet,
  pool = POOL_ADDRESS,
  params = {},
  validAfter = 0,
  validBefore = TEST_NOW + 3600,
  marker = randomMarker(),
  domainChainId,
} = {}) {
  const def = ACTIONS[action]
  const chain = config.chains[chainId]
  const domainCId = domainChainId ?? chainId
  const usesCloneDomain = def.verifyingContractParam === 'pool'
  const verifyingContract = usesCloneDomain ? pool : config.chains[domainCId].targetsByKey[def.contract]
  const domain = { ...CONTRACT_DOMAINS[def.domainContract ?? def.contract], chainId: domainCId, verifyingContract }
  const actor = signer.address
  const message = {}
  for (const f of INTENT_TYPES[def.typeName]) {
    if (f.name === def.actorField) message[f.name] = actor
    else if (f.name === 'nonce') message[f.name] = marker
    else if (f.name === 'validAfter') message[f.name] = validAfter
    else if (f.name === 'validBefore') message[f.name] = validBefore
    else message[f.name] = params[f.name]
  }
  const signature = await signer.signTypedData(domain, typesFor(action), message)
  const outParams = { ...params, [def.actorField]: actor }
  if (usesCloneDomain) outParams.pool = pool
  return {
    intentClass: 'signer-attributed',
    chainId,
    targetContract: chain.targetsByKey[def.contract],
    action,
    // The wire body is JSON, so BigInts (entries amounts, buyIn) travel as decimal strings — exactly
    // as the frontend serializes them; the gateway coerces them back via asUint before re-hashing.
    params: jsonSafe(outParams),
    signature,
    validAfter,
    validBefore,
    uniquenessMarker: marker,
    fundingMode: 'sponsored',
  }
}

/** Build + sign a Tier-2 gasless pool JOIN (EIP-3009 into the clone; no separate intent struct). */
export async function signedPoolJoinIntent(config, {
  chainId = 137,
  signer = wallet,
  pool = POOL_ADDRESS,
  value = 1_000_000n,
  validAfter = 0,
  validBefore = TEST_NOW + 3600,
  marker = randomMarker(),
} = {}) {
  const chain = config.chains[chainId]
  const tokenDomain = {
    name: chain.tokenDomain.name,
    version: chain.tokenDomain.version,
    chainId,
    verifyingContract: chain.paymentToken,
  }
  const auth = { from: signer.address, to: pool, value, validAfter, validBefore, nonce: marker }
  const authSig = ethers.Signature.from(await signer.signTypedData(tokenDomain, RECEIVE_WITH_AUTHORIZATION_TYPES, auth))
  return {
    intentClass: 'payment',
    chainId,
    targetContract: chain.targetsByKey.wagerPoolFactory,
    action: 'poolJoin',
    params: { pool },
    signature: '0x',
    authorization: { ...auth, value: value.toString(), v: authSig.v, r: authSig.r, s: authSig.s },
    validAfter,
    validBefore,
    uniquenessMarker: marker,
    fundingMode: 'sponsored',
  }
}

/** keccak256(abi.encode(PayoutEntry[])) — the pool proposalId / lockedOutcome. */
export function poolMatrixHash(entries) {
  return ethers.keccak256(
    abi.encode(['tuple(address winner,uint256 amount)[]'], [entries.map((e) => ({ winner: e.winner, amount: e.amount }))])
  )
}
