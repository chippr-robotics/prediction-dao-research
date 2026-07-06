/**
 * Intent parsing, signer recovery, and binding validation (data-model.md "Validation pipeline").
 *
 * The gateway NEVER trusts client-asserted identity: the signer is RECOVERED from the signature
 * (EIP-712 typed data for the signer-attributed class; the EIP-3009 authorization for the payment
 * class) and is the sole identity used for screening, quotas, and attribution (FR-002/FR-003).
 *
 * Network isolation (FR-024 / SC-014): the chainId is part of the EIP-712 domain, so a signature
 * produced for chain A cannot recover to the claimed actor under chain B's domain. When the
 * recovered address mismatches, we re-try recovery under every OTHER enabled chain's domain —
 * if one of them matches, the intent was signed for a different network and we return the
 * specific `chain_mismatch` instead of a generic `invalid_signature`.
 */
import { ethers } from 'ethers'
import { GatewayError } from '../errors.js'
import {
  ACTIONS,
  CONTRACT_DOMAINS,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  typesFor,
} from './intentTypes.js'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/
const HEX_RE = /^0x[0-9a-fA-F]*$/

const bad = (reason) => new GatewayError(400, 'bad_request', reason)

function asAddress(label, v) {
  if (typeof v !== 'string' || !ADDRESS_RE.test(v)) throw bad(`${label} must be a 20-byte hex address`)
  return ethers.getAddress(v)
}

function asBytes32(label, v) {
  if (typeof v !== 'string' || !BYTES32_RE.test(v)) throw bad(`${label} must be a 32-byte hex value`)
  return v.toLowerCase()
}

function asUint(label, v) {
  let n
  try {
    n = BigInt(typeof v === 'number' && Number.isInteger(v) ? v : String(v))
  } catch {
    throw bad(`${label} must be a non-negative integer`)
  }
  if (n < 0n) throw bad(`${label} must be a non-negative integer`)
  return n
}

function asHexBytes(label, v) {
  if (typeof v !== 'string' || !HEX_RE.test(v) || v.length % 2 !== 0) throw bad(`${label} must be 0x-prefixed hex bytes`)
  return v
}

/** Parse + shape-validate the POST /v1/intents body. Throws GatewayError(400) on malformed input. */
export function parseIntent(body) {
  if (!body || typeof body !== 'object') throw bad('body must be a JSON object')

  const intentClass = body.intentClass
  if (intentClass !== 'payment' && intentClass !== 'signer-attributed') {
    throw bad('intentClass must be "payment" or "signer-attributed"')
  }

  const chainId = Number(asUint('chainId', body.chainId))
  const targetContract = asAddress('targetContract', body.targetContract)

  if (typeof body.action !== 'string' || body.action.length === 0) throw bad('action must be a non-empty string')
  const action = body.action

  const params = body.params
  if (!params || typeof params !== 'object') throw bad('params must be an object')

  const validAfter = asUint('validAfter', body.validAfter ?? 0)
  const validBefore = asUint('validBefore', body.validBefore ?? 0)
  const uniquenessMarker = asBytes32('uniquenessMarker', body.uniquenessMarker)

  const fundingMode = body.fundingMode ?? 'sponsored'
  if (fundingMode !== 'sponsored' && fundingMode !== 'fee-netted') {
    throw bad('fundingMode must be "sponsored" or "fee-netted"')
  }
  const maxFee = body.maxFee != null ? asUint('maxFee', body.maxFee) : null

  const signature = asHexBytes('signature', body.signature)

  let authorization = null
  if (intentClass === 'payment') {
    const a = body.authorization
    if (!a || typeof a !== 'object') throw bad('payment intents require an authorization object (EIP-3009)')
    authorization = {
      from: asAddress('authorization.from', a.from),
      to: asAddress('authorization.to', a.to),
      value: asUint('authorization.value', a.value),
      validAfter: asUint('authorization.validAfter', a.validAfter),
      validBefore: asUint('authorization.validBefore', a.validBefore),
      nonce: asBytes32('authorization.nonce', a.nonce),
      v: Number(asUint('authorization.v', a.v)),
      r: asBytes32('authorization.r', a.r),
      s: asBytes32('authorization.s', a.s),
    }
    if (authorization.v > 255) throw bad('authorization.v out of range')
  }

  return {
    intentClass,
    chainId,
    targetContract,
    action,
    params,
    signature,
    authorization,
    validAfter,
    validBefore,
    uniquenessMarker,
    fundingMode,
    maxFee,
  }
}

function asBool(label, v) {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  throw bad(`${label} must be a boolean`)
}

function asString(label, v) {
  if (typeof v !== 'string') throw bad(`${label} must be a string`)
  return v
}

/** A pool payout matrix: non-empty array of { winner: address, amount: uint256 } (spec 034). */
function asPayoutEntries(label, v) {
  if (!Array.isArray(v) || v.length === 0) throw bad(`${label} must be a non-empty array`)
  return v.map((e, i) => {
    if (!e || typeof e !== 'object') throw bad(`${label}[${i}] must be an object`)
    return {
      winner: asAddress(`${label}[${i}].winner`, e.winner),
      amount: asUint(`${label}[${i}].amount`, e.amount),
    }
  })
}

// Param name -> canonical type. Coercion is DRIVEN BY TYPE, not name: an address stays a checksummed
// address, a bool stays a bool, a string stays a string. (The prior name-list coerced everything not
// explicitly special-cased through asUint, which silently corrupted address/bool/string/array params —
// e.g. createWager's metadataUri/creatorIsYes and declareWinner's winner.)
const PARAM_TYPES = {
  // WagerRegistry
  wagerId: 'uint256', winner: 'address', opponent: 'address', arbitrator: 'address',
  token: 'address', creatorStake: 'uint128', opponentStake: 'uint128',
  acceptDeadline: 'uint64', resolveDeadline: 'uint64', resolutionType: 'uint8',
  conditionId: 'bytes32', creatorIsYes: 'bool', metadataHash: 'bytes32',
  metadataUri: 'string', termsVersionHash: 'bytes32', claimCodeSig: 'bytes',
  // MembershipManager
  role: 'bytes32', tier: 'uint8', acceptedTermsHash: 'bytes32', voucherId: 'uint256',
  // Tier-2 pools
  pool: 'address', proposalId: 'bytes32', entries: 'entries', index: 'uint256',
  recipient: 'address', buyIn: 'uint256', maxMembers: 'uint32', thresholdBips: 'uint16',
}

function coerceParam(type, label, v) {
  switch (type) {
    case 'address': return asAddress(label, v)
    case 'bool': return asBool(label, v)
    case 'bytes32': return asBytes32(label, v)
    case 'bytes': return asHexBytes(label, v)
    case 'string': return asString(label, v)
    case 'entries': return asPayoutEntries(label, v)
    case 'uint8':
    case 'uint16':
    case 'uint32':
    case 'uint64':
    case 'uint128':
    case 'uint256':
      return asUint(label, v)
    default:
      throw bad(`${label} has unsupported type ${type}`)
  }
}

/** Normalize action params against the registry definition (rejects missing fields early). */
function normalizeParams(actionDef, params) {
  const out = {}
  for (const name of actionDef.paramNames) {
    if (params[name] == null) throw bad(`params.${name} is required for action`)
    const type = PARAM_TYPES[name]
    if (!type) throw bad(`params.${name} has no registered type`)
    out[name] = coerceParam(type, `params.${name}`, params[name])
  }
  return out
}

function domainFor(chainCfg, contractKey, verifyingContract) {
  const d = CONTRACT_DOMAINS[contractKey]
  return {
    name: d.name,
    version: d.version,
    chainId: chainCfg.chainId,
    // Tier-2 pool signer actions verify under the CLONE's domain: verifyingContract is the pool
    // address (from params), not the pinned target-by-key. Everything else uses the pinned target.
    verifyingContract: verifyingContract ?? chainCfg.targetsByKey[contractKey],
  }
}

const FACTORY_IFACE = new ethers.Interface(['function poolAddressToId(address) view returns (uint256)'])

/**
 * On-chain provenance for a dynamic pool clone (Tier 2). Clones are ERC-1167 addresses the gateway
 * cannot pre-pin, so instead of an allow-list we ask the pinned factory: `poolAddressToId(pool) != 0`
 * (ids start at 1). This mirrors the factory forwarders' own `_requirePool` guard, so the gateway
 * never accepts a target the contract would reject. Fail modes: a genuine non-pool → 400 (hard reject,
 * do not retry); an RPC/provider failure → 503 (retryable → the client self-submits, never-stranded).
 */
async function checkPoolProvenance(provider, factoryAddress, pool) {
  if (!provider || !factoryAddress) {
    throw new GatewayError(503, 'chain_unavailable', 'cannot verify pool provenance without a read provider; self-submit')
  }
  let ret
  try {
    const data = FACTORY_IFACE.encodeFunctionData('poolAddressToId', [pool])
    ret = await provider.call({ to: factoryAddress, data })
  } catch {
    throw new GatewayError(503, 'chain_unavailable', 'pool provenance check failed (RPC error); retry or self-submit')
  }
  let id
  try {
    ;[id] = FACTORY_IFACE.decodeFunctionResult('poolAddressToId', ret)
  } catch {
    id = 0n
  }
  if (id === 0n) {
    throw new GatewayError(400, 'target_not_allowlisted', 'pool was not created by the pinned WagerPoolFactory')
  }
}

function tryRecoverTyped(domain, types, message, signature) {
  try {
    return ethers.verifyTypedData(domain, types, message, signature)
  } catch {
    return null
  }
}

const ERC1271_IFACE = new ethers.Interface([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
])
const ERC1271_MAGIC = '0x1626ba7e'

/**
 * ERC-1271 fallback for contract-account signers (spec 041: passkey smart accounts).
 * When ECDSA recovery does not produce the claimed actor, ask the actor itself: if the address
 * has code on the bound chain, `eth_call isValidSignature(digest, sig)` and accept only the
 * ERC-1271 magic value. Read-only; mirrors the on-chain SignerIntentBase check exactly, so the
 * gateway never accepts an intent the contract would reject (and vice versa for this leg).
 * Fail-closed: no provider, no code, revert, or wrong magic all mean "not valid".
 */
async function isValidErc1271Signature(provider, signer, digest, signature) {
  if (!provider) return false
  try {
    const data = ERC1271_IFACE.encodeFunctionData('isValidSignature', [digest, signature])
    const ret = await provider.call({ to: signer, data })
    if (!ret || ret === '0x' || ret.length < 10) return false
    return ret.slice(0, 10).toLowerCase() === ERC1271_MAGIC
  } catch {
    return false
  }
}

/**
 * Full verification for one intent against the addressed chain's config.
 * Order: allow-list -> signer recovery + binding -> validity window.
 * (chainId-active, payment-supported, dedup, screening, quotas, fee checks live in the route
 * pipeline — see server.js.)
 *
 * @param {object} intent        parsed intent (parseIntent output)
 * @param {object} chainCfg      config.chains[intent.chainId]
 * @param {object} config        full gateway config (for cross-chain mismatch detection)
 * @param {number} nowSec        current unix time
 * @param {object|null} provider read provider for this chain — enables the ERC-1271
 *                               contract-signer fallback (spec 041); omit/null keeps
 *                               strict ECDSA-only verification.
 * @returns {Promise<{ signer: string, actionDef: object, params: object, calldata: string }>}
 */
export async function verifyIntent(intent, chainCfg, config, nowSec, provider = null) {
  // --- target + action allow-list (version-pinned, FR-025) ---
  const target = chainCfg.targets[intent.targetContract.toLowerCase()]
  if (!target) {
    throw new GatewayError(400, 'target_not_allowlisted', 'targetContract is not in the version-pinned target set for this chain')
  }
  const actionDef = ACTIONS[intent.action]
  if (!actionDef || actionDef.contract !== target.key || !target.allowedActions.includes(intent.action)) {
    throw new GatewayError(400, 'target_not_allowlisted', `action "${intent.action}" is not allow-listed for this target contract`)
  }
  if (actionDef.intentClass !== intent.intentClass) {
    throw new GatewayError(400, 'param_binding_mismatch', `action "${intent.action}" belongs to the ${actionDef.intentClass} intent class`)
  }

  const params = normalizeParams(actionDef, intent.params)

  // Action-specific cross-param invariants (e.g. proposalId == keccak256(entries)) — a cheap
  // pre-check that mirrors an on-chain assertion, so a doomed intent is rejected before the engine.
  actionDef.verifyParams?.(params)

  // Dynamic-clone provenance (Tier 2): the pinned target is the FACTORY; the acted-on pool is a
  // clone proven on-chain via factory.poolAddressToId, not an allow-list.
  if (actionDef.provenanceParam) {
    await checkPoolProvenance(provider, chainCfg.targetsByKey[actionDef.contract], params[actionDef.provenanceParam])
  }

  // EIP-712 domain: name/version from `domainContract` (defaults to the target), verifyingContract
  // from `verifyingContractParam` when set (the clone address) else the pinned target (the split).
  const domainKey = actionDef.domainContract ?? actionDef.contract
  const verifyingContract = actionDef.verifyingContractParam ? params[actionDef.verifyingContractParam] : undefined

  // --- signer recovery ---
  let signer
  if (intent.intentClass === 'payment') {
    signer = recoverPaymentSigner(intent, chainCfg, actionDef, params)
    // Money-only forwarders (pool join) carry NO intent struct — the EIP-3009 authorization IS the
    // attribution + binding. Otherwise the EIP-712 action struct must ALSO be signed by the same
    // wallet, binding params (role/tier/wagerId/...) to the money leg (FR-007/FR-013).
    if (!actionDef.authOnly) {
      const domain = domainFor(chainCfg, domainKey, verifyingContract)
      const message = actionDef.buildMessage(params, signer, intent)
      const recovered = tryRecoverTyped(domain, typesFor(intent.action), message, intent.signature)
      if (!recovered || recovered.toLowerCase() !== signer.toLowerCase()) {
        throwSignatureError(intent, actionDef, params, signer, config, chainCfg, domainKey, verifyingContract)
      }
    }
  } else {
    // Signer-attributed: the actor field of the signed struct IS the signer; the client supplies
    // it in params so the full message is reconstructible, and recovery must match it exactly.
    // Contract accounts (spec 041 passkey smart wallets) cannot ECDSA-recover to their own
    // address — on mismatch, fall back to asking the actor contract via ERC-1271.
    const actor = asAddress(`params.${actionDef.actorField}`, intent.params[actionDef.actorField])
    const domain = domainFor(chainCfg, domainKey, verifyingContract)
    const message = actionDef.buildMessage(params, actor, intent)
    const recovered = tryRecoverTyped(domain, typesFor(intent.action), message, intent.signature)
    if (!recovered || recovered.toLowerCase() !== actor.toLowerCase()) {
      const digest = ethers.TypedDataEncoder.hash(domain, typesFor(intent.action), message)
      const okVia1271 = await isValidErc1271Signature(provider, actor, digest, intent.signature)
      if (!okVia1271) throwSignatureError(intent, actionDef, params, actor, config, chainCfg, domainKey, verifyingContract)
    }
    signer = actor
  }

  // --- validity window (top-level fields are bound into the signed struct above) ---
  if (intent.validBefore !== 0n && intent.validBefore <= BigInt(nowSec)) {
    throw new GatewayError(400, 'expired', 'intent validBefore is in the past; sign a fresh intent')
  }
  if (intent.validAfter > BigInt(nowSec)) {
    throw new GatewayError(400, 'not_yet_valid', 'intent validAfter is in the future')
  }

  // --- build the signer-attributed entrypoint calldata (engine sees only to/value/data) ---
  const calldata = actionDef.encode(params, signer, intent)

  return { signer, actionDef, params, calldata }
}

/** Recover the payment-class signer from the EIP-3009 authorization under the token's domain. */
function recoverPaymentSigner(intent, chainCfg, actionDef, params) {
  const a = intent.authorization
  // The authorization MUST pay the bound recipient (binds funds to the contract, not the relayer).
  // Normally that is the pinned targetContract; for a pool join the money goes into the CLONE
  // (`authToParam: 'pool'`), which the token enforces is the caller, so a relayer can't redirect it.
  const expectedTo = actionDef?.authToParam ? params[actionDef.authToParam] : intent.targetContract
  if (a.to.toLowerCase() !== String(expectedTo).toLowerCase()) {
    throw new GatewayError(400, 'param_binding_mismatch', 'authorization.to must equal the bound payment recipient')
  }
  // data-model.md: for the payment class the uniquenessMarker IS the EIP-3009 nonce.
  if (a.nonce.toLowerCase() !== intent.uniquenessMarker.toLowerCase()) {
    throw new GatewayError(400, 'param_binding_mismatch', 'uniquenessMarker must equal authorization.nonce for payment intents')
  }
  const domain = {
    name: chainCfg.tokenDomain.name,
    version: chainCfg.tokenDomain.version,
    chainId: chainCfg.chainId,
    verifyingContract: chainCfg.paymentToken,
  }
  const message = {
    from: a.from,
    to: a.to,
    value: a.value,
    validAfter: a.validAfter,
    validBefore: a.validBefore,
    nonce: a.nonce,
  }
  const sig = ethers.Signature.from({ v: a.v, r: a.r, s: a.s }).serialized
  const recovered = tryRecoverTyped(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, message, sig)
  if (!recovered || recovered.toLowerCase() !== a.from.toLowerCase()) {
    throw new GatewayError(400, 'invalid_signature', 'EIP-3009 authorization signature does not recover to authorization.from')
  }
  return recovered
}

/**
 * Distinguish a wrong-network signature (chain_mismatch, SC-014) from a plain bad signature:
 * re-try recovery under every other enabled chain's domain for the same contract key.
 */
function throwSignatureError(intent, actionDef, params, expectedActor, config, chainCfg, domainKey, verifyingContract) {
  for (const otherId of config.enabledChainIds) {
    if (otherId === chainCfg.chainId) continue
    const other = config.chains[otherId]
    const domain = domainFor(other, domainKey ?? actionDef.contract, verifyingContract)
    const message = actionDef.buildMessage(params, expectedActor, intent)
    const recovered = tryRecoverTyped(domain, typesFor(intent.action), message, intent.signature)
    if (recovered && recovered.toLowerCase() === expectedActor.toLowerCase()) {
      throw new GatewayError(
        400,
        'chain_mismatch',
        `intent was signed for chain ${otherId}, not chain ${chainCfg.chainId}; intents never cross networks`
      )
    }
  }
  throw new GatewayError(400, 'invalid_signature', 'signature does not recover to the intent actor')
}
