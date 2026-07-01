/**
 * Core relay logic for POST /relay/pool-join. Pure-ish and unit-testable: takes a chain handle + a
 * parsed request body and (a) validates inputs, (b) confirms the target is a pool registered by the
 * configured factory, (c) re-screens `from` for sanctions (FR-021d), (d) confirms the EIP-3009
 * authorization binds (from -> pool, value == buyIn), then (e) submits joinWithAuthorization with the
 * gas-only signer.
 *
 * SECURITY MODEL (untrusted relayer): the relayer never holds member funds. The member's signed
 * authorization is bound to (from, pool, value, nonce) and is replay-protected by the ERC-3009 token's
 * own nonce map — the relayer can only move exactly the signed buy-in into exactly the signed pool, or
 * censor. The sanctions re-screen is a defense-in-depth duplicate of the pool's own on-chain
 * `screen(from)`; the on-chain check is authoritative, but re-screening here lets us refuse to even pay
 * gas for a screened-out wallet and to fail closed if screening can't be performed.
 */
import { ethers } from 'ethers'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/

export class RelayError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function asAddress(label, v) {
  if (typeof v !== 'string' || !ADDRESS_RE.test(v)) throw new RelayError(400, 'bad_request', `${label} must be a 20-byte address`)
  return ethers.getAddress(v) // checksum-normalize
}

function asBytes32(label, v) {
  if (typeof v !== 'string' || !BYTES32_RE.test(v)) throw new RelayError(400, 'bad_request', `${label} must be a 32-byte hex value`)
  return v.toLowerCase()
}

function asUint(label, v) {
  // Accept decimal string or number; reject anything else (avoid float/precision surprises).
  let n
  try {
    n = BigInt(typeof v === 'number' && Number.isInteger(v) ? v : String(v))
  } catch {
    throw new RelayError(400, 'bad_request', `${label} must be a non-negative integer`)
  }
  if (n < 0n) throw new RelayError(400, 'bad_request', `${label} must be a non-negative integer`)
  return n
}

function asU8(label, v) {
  const n = asUint(label, v)
  if (n > 255n) throw new RelayError(400, 'bad_request', `${label} out of range`)
  return Number(n)
}

/**
 * Validate + normalize the request body. Throws RelayError(400) on any malformed field.
 * @param {*} body
 * @returns {{chainId:number, pool:string, identityCommitment:bigint, authorization:object}}
 */
export function parseRequest(body) {
  if (!body || typeof body !== 'object') throw new RelayError(400, 'bad_request', 'body must be a JSON object')

  const chainId = Number(asUint('chainId', body.chainId))
  if (chainId <= 0) throw new RelayError(400, 'bad_request', 'chainId must be a positive integer')

  const pool = asAddress('pool', body.pool)
  const identityCommitment = asUint('identityCommitment', body.identityCommitment)

  const a = body.authorization
  if (!a || typeof a !== 'object') throw new RelayError(400, 'bad_request', 'authorization object required')
  const authorization = {
    from: asAddress('authorization.from', a.from),
    to: asAddress('authorization.to', a.to),
    value: asUint('authorization.value', a.value),
    validAfter: asUint('authorization.validAfter', a.validAfter),
    validBefore: asUint('authorization.validBefore', a.validBefore),
    nonce: asBytes32('authorization.nonce', a.nonce),
    v: asU8('authorization.v', a.v),
    r: asBytes32('authorization.r', a.r),
    s: asBytes32('authorization.s', a.s),
  }
  return { chainId, pool, identityCommitment, authorization }
}

/**
 * Run all validations and submit the join. Returns { txHash }.
 * @param {object} handle  chain handle from buildChains()[chainId]
 * @param {{pool:string, identityCommitment:bigint, authorization:object}} reqData
 * @param {{requireSanctionsScreen:boolean, txConfirmations:number, now?:()=>number}} opts
 */
export async function relayPoolJoin(handle, reqData, opts) {
  const { pool, identityCommitment, authorization } = reqData
  const now = (opts.now ? opts.now() : Math.floor(Date.now() / 1000))

  // 1) The authorization recipient MUST be the pool (EIP-3009 binds funds to `to`). If they differ the
  //    on-chain pull would fail anyway, but reject early to avoid wasting gas / leaking intent.
  if (authorization.to.toLowerCase() !== pool.toLowerCase()) {
    throw new RelayError(400, 'auth_recipient_mismatch', 'authorization.to must equal the pool address')
  }

  // 2) Don't relay an already-expired authorization (avoid burning gas on a guaranteed revert).
  if (authorization.validBefore !== 0n && authorization.validBefore <= BigInt(now)) {
    throw new RelayError(400, 'auth_expired', 'authorization.validBefore is in the past')
  }
  if (authorization.validAfter > BigInt(now)) {
    throw new RelayError(400, 'auth_not_yet_valid', 'authorization.validAfter is in the future')
  }

  // 3) Confirm the target is a pool registered by THIS factory (allow-list: never submit to an
  //    arbitrary contract). poolAddressToId == 0 means unknown.
  let poolId
  try {
    poolId = await handle.factory.poolAddressToId(pool)
  } catch (e) {
    throw new RelayError(502, 'factory_unreachable', `factory unreachable: ${e.shortMessage || e.message}`)
  }
  if (poolId === 0n) {
    throw new RelayError(400, 'unknown_pool', 'pool is not registered by the configured factory')
  }

  // 4) Confirm value == the pool's buyIn (joinWithAuthorization reverts on mismatch; reject early).
  const poolContract = handle.pool(pool)
  let buyIn
  try {
    buyIn = await poolContract.buyIn()
  } catch (e) {
    throw new RelayError(502, 'pool_unreachable', `pool unreachable: ${e.shortMessage || e.message}`)
  }
  if (authorization.value !== buyIn) {
    throw new RelayError(400, 'value_mismatch', `authorization.value must equal the pool buyIn (${buyIn})`)
  }

  // 5) Re-screen `from` for sanctions BEFORE spending gas (FR-021d). Fail closed: if screening is
  //    required but cannot be performed (no guard / guard call fails), refuse to relay.
  if (opts.requireSanctionsScreen) {
    if (!handle.sanctionsGuard) {
      throw new RelayError(503, 'screening_unavailable', 'sanctions screening required but no guard configured')
    }
    let allowed
    try {
      allowed = await handle.sanctionsGuard.isAllowed(authorization.from)
    } catch (e) {
      throw new RelayError(503, 'screening_unavailable', `sanctions screening could not be performed: ${e.shortMessage || e.message}`)
    }
    if (!allowed) {
      throw new RelayError(403, 'screened', 'sender failed sanctions screening')
    }
  }

  // 6) Submit. The signer pays gas; funds move only per the signed authorization.
  let tx
  try {
    tx = await poolContract.joinWithAuthorization(
      identityCommitment,
      authorization.from,
      authorization.value,
      authorization.validAfter,
      authorization.validBefore,
      authorization.nonce,
      authorization.v,
      authorization.r,
      authorization.s
    )
  } catch (e) {
    // Includes simulation reverts (e.g. AlreadyJoined, PoolFull, on-chain screen()) and gas issues.
    throw new RelayError(502, 'submit_failed', `submit failed: ${e.shortMessage || e.reason || e.message}`)
  }

  if (opts.txConfirmations > 0) {
    await tx.wait(opts.txConfirmations)
  }
  return { txHash: tx.hash }
}
