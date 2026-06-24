import { ethers } from 'ethers'

// Spec 030 (US5, FR-023/024/025) — pure encoding/validation for the ClearPath proposal builder. Turns
// human-entered actions (send native / send token / custom call) into the exact OZ IGovernor.propose() payload
// (parallel targets/values/calldatas + description), with field-level errors. No React, no chain calls — unit
// testable. Governor correctness invariants live here: value=0 for ERC-20, description reused byte-for-byte,
// description hash = keccak256(utf8), arrays equal length.

export const ACTION_TYPE = { NATIVE: 'native', TOKEN: 'token', CUSTOM: 'custom' }

const ERC20_TRANSFER_IFACE = new ethers.Interface(['function transfer(address to, uint256 amount)'])

let _seq = 0
/** A fresh blank action. `id` is a React key only — never submitted. */
export function newAction(type = ACTION_TYPE.TOKEN) {
  _seq += 1
  return {
    id: `a${_seq}`,
    type,
    nativeTo: '',
    nativeAmount: '',
    tokenMode: 'usdc', // 'usdc' (treasury default) | 'other' (arbitrary ERC-20 at tokenAddress)
    tokenAddress: '',
    tokenTo: '',
    tokenAmount: '',
    customTarget: '',
    customValue: '',
    customCalldata: '0x',
  }
}

/** Merge a title + markdown body into the single Governor description string. */
export function buildDescription(title, body) {
  const t = (title || '').trim()
  const b = (body || '').trim()
  if (!t) return b
  return b ? `# ${t}\n\n${b}` : `# ${t}`
}

/** keccak256(utf8(description)) — exactly what queue/execute recompute. */
export function descriptionHash(description) {
  return ethers.id(description)
}

function parseHuman(v, decimals, label) {
  const s = (v ?? '').toString().trim() || '0'
  let out
  try {
    out = ethers.parseUnits(s, decimals)
  } catch {
    const e = new Error(`${label} is not a valid number.`)
    throw e
  }
  if (out < 0n) throw new Error(`${label} must not be negative.`)
  return out
}
function requireAddress(v, label) {
  if (!ethers.isAddress((v || '').trim())) throw new Error(`${label} is not a valid address.`)
}

/**
 * Encode ONE action → { target, value (bigint), calldata }. Throws an Error with a human message on invalid
 * input; sets `err.pending = true` when a token's decimals haven't loaded yet (caller treats as not-ready).
 * @param meta (tokenAddr) => { decimals, symbol } | null
 */
export function encodeAction(a, { usdcAddress, meta }) {
  if (a.type === ACTION_TYPE.NATIVE) {
    requireAddress(a.nativeTo, 'Recipient')
    return { target: a.nativeTo.trim(), value: parseHuman(a.nativeAmount, 18, 'Amount'), calldata: '0x' }
  }
  if (a.type === ACTION_TYPE.TOKEN) {
    const token = a.tokenMode === 'other' ? (a.tokenAddress || '').trim() : (usdcAddress || '')
    requireAddress(token, 'Token')
    requireAddress(a.tokenTo, 'Recipient')
    const m = meta ? meta(token) : null
    if (!m) {
      const e = new Error('Reading token decimals…')
      e.pending = true
      throw e
    }
    const amount = parseHuman(a.tokenAmount, m.decimals, 'Amount')
    return {
      target: token,
      value: 0n, // ERC-20 transfer carries NO native value (invariant FR-025)
      calldata: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [a.tokenTo.trim(), amount]),
    }
  }
  // custom call (advanced)
  requireAddress(a.customTarget, 'Target')
  const cd = (a.customCalldata || '0x').trim()
  if (!/^0x([0-9a-fA-F]{2})*$/.test(cd)) throw new Error('Calldata must be valid hex (0x, even length).')
  return { target: a.customTarget.trim(), value: parseHuman(a.customValue, 18, 'Value'), calldata: cd }
}

/**
 * Assemble the whole proposal. Returns the submit payload + per-action diagnostics so the UI can render inline
 * state without re-encoding. `ok` is true only when the description is non-empty, there is ≥1 action, and every
 * action encodes cleanly (no errors, none pending).
 */
export function assemble({ title, body, actions, usdcAddress, meta }) {
  const description = buildDescription(title, body)
  const targets = []
  const values = []
  const calldatas = []
  const perAction = []
  let ok = description.trim().length > 0 && Array.isArray(actions) && actions.length > 0
  for (const a of actions || []) {
    try {
      const enc = encodeAction(a, { usdcAddress, meta })
      perAction.push({ encoded: enc })
      targets.push(enc.target)
      values.push(enc.value)
      calldatas.push(enc.calldata)
    } catch (e) {
      perAction.push(e.pending ? { pending: true, message: e.message } : { error: e.message })
      ok = false
    }
  }
  return { ok, targets, values, calldatas, description, descriptionHash: descriptionHash(description), perAction }
}

/**
 * Predict the OZ Governor proposalId for a payload (same hashing the contract uses) — for the duplicate
 * pre-check. hashProposal = keccak256(abi.encode(targets, values, keccak256(calldatas...), descriptionHash))...
 * OZ uses keccak256(abi.encode(targets, values, calldatas, descriptionHash)).
 */
export function predictProposalId(targets, values, calldatas, descHash) {
  const coder = ethers.AbiCoder.defaultAbiCoder()
  const encoded = coder.encode(
    ['address[]', 'uint256[]', 'bytes[]', 'bytes32'],
    [targets, values, calldatas, descHash]
  )
  return BigInt(ethers.keccak256(encoded)).toString()
}
