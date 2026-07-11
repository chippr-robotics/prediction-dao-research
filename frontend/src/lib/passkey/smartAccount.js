/**
 * Smart-account layer for passkey wallets (spec 041, T018).
 *
 * Thin orchestration over viem's account-abstraction module (verified T002:
 * toWebAuthnAccount / toCoinbaseSmartAccount / createBundlerClient) bound to
 * the FairWins-deployed deterministic factory. All addresses come from the
 * synced contract config (constitution V) — never hardcoded.
 *
 * The account address is a pure function of (initial owners, nonce) and the
 * factory address, which is identical on every platform network (FR-023) —
 * so `deriveAddress` is chain-independent by construction.
 */

import { http, createPublicClient, encodeFunctionData, parseAbi } from 'viem'
import {
  toWebAuthnAccount,
  toCoinbaseSmartAccount,
  createBundlerClient,
  createPaymasterClient,
} from 'viem/account-abstraction'
import { getNetwork } from '../../config/networks'
import { getContractAddressForChain } from '../../config/contracts'
import { CeremonyCancelled, isTransactComplete } from './credentials'

export class ChainNotSupportedError extends Error {
  constructor(chainId) {
    super(`Passkey accounts are not yet available on this network (chain ${chainId}).`)
    this.name = 'ChainNotSupportedError'
    this.chainId = chainId
  }
}

export class LastControllerError extends Error {
  constructor() {
    super('An account must always keep at least one controller.')
    this.name = 'LastControllerError'
  }
}

/**
 * Typed error: the local record for this passkey is missing the fields the
 * signer needs (spec 045, FR-006). Historically this surfaced as an internal
 * "Cannot read properties of undefined (reading 'id')" from inside the
 * WebAuthn signer — now it's an actionable message before any ceremony.
 */
export class CredentialRecordIncomplete extends Error {
  constructor() {
    super(
      'This browser’s record of your passkey is incomplete, so it can’t sign transactions. ' +
        'Sign out and sign back in with your passkey; if that doesn’t help, use a linked wallet to recover access.'
    )
    this.name = 'CredentialRecordIncomplete'
  }
}

/** Typed error: the passkey no longer controls the account (removed on-chain). */
export class CredentialNotControllerError extends Error {
  constructor() {
    super(
      'This passkey is no longer a controller of the account. Sign in with another controller ' +
        '(a different passkey or a linked wallet) to manage it.'
    )
    this.name = 'CredentialNotControllerError'
  }
}

const FACTORY_ABI = parseAbi([
  'function getAddress(bytes[] owners, uint256 nonce) view returns (address)',
  'function createAccount(bytes[] owners, uint256 nonce) payable returns (address)',
])

export const ACCOUNT_ABI = parseAbi([
  'function addOwnerAddress(address owner)',
  'function addOwnerPublicKey(bytes32 x, bytes32 y)',
  'function removeOwnerAtIndex(uint256 index, bytes owner)',
  'function ownerAtIndex(uint256 index) view returns (bytes)',
  'function ownerCount() view returns (uint256)',
  'function nextOwnerIndex() view returns (uint256)',
  'function isOwnerAddress(address owner) view returns (bool)',
  'function isOwnerPublicKey(bytes32 x, bytes32 y) view returns (bool)',
  'function replaySafeHash(bytes32 hash) view returns (bytes32)',
  'function executeBatch((address target, uint256 value, bytes data)[] calls) payable',
])

/** Resolve the passkey stack config for a chain, or throw ChainNotSupportedError (FR-022). */
export function requirePasskeySupport(chainId) {
  const net = getNetwork(chainId)
  const factory = safeAddress('accountFactory', chainId)
  const entryPoint = safeAddress('entryPoint', chainId)
  if (!net?.capabilities?.passkeyAccounts || !factory || !entryPoint) {
    throw new ChainNotSupportedError(chainId)
  }
  return {
    network: net,
    factory,
    entryPoint,
    bundlerUrls: net.passkey.bundlerUrls,
    sponsorPaymasterUrl: net.passkey.sponsorPaymasterUrl ?? null,
  }
}

function safeAddress(key, chainId) {
  try {
    const addr = getContractAddressForChain(key, chainId)
    return addr && addr !== '0x0000000000000000000000000000000000000000' ? addr : null
  } catch {
    return null
  }
}

/** ABI-encode a P-256 public key as a MultiOwnable owner entry (64 bytes: x || y). */
export function publicKeyToOwnerBytes({ x, y }) {
  return `0x${x.slice(2).padStart(64, '0')}${y.slice(2).padStart(64, '0')}`
}

/** ABI-encode an EOA address as an owner entry (32 bytes, left-padded). */
export function addressToOwnerBytes(address) {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`
}

/**
 * Derive the (counterfactual) account address for an initial owner set.
 * MUST equal the on-chain factory `getAddress` — asserted in tests against
 * vectors produced by the Hardhat suite (test/account/factory.test.js).
 */
export async function deriveAddress({ chainId, ownersBytes, nonce = 0n, deps = {} }) {
  const { factory } = requirePasskeySupport(chainId)
  const client = deps.publicClient ?? defaultPublicClient(chainId)
  return client.readContract({
    address: factory,
    abi: FACTORY_ABI,
    functionName: 'getAddress',
    args: [ownersBytes, nonce],
  })
}

/**
 * Minimal viem Chain descriptor from our own network config. Without a `chain`,
 * `createPublicClient` leaves `client.chain` undefined — and viem's smart-account
 * signing methods (toCoinbaseSmartAccount's `sign`/`signUserOperation`) read
 * `client.chain.id` unconditionally, so every passkey ceremony crashed with
 * "Cannot read properties of undefined (reading 'id')" (issue #854).
 */
function toViemChain(net) {
  return {
    id: net.chainId,
    name: net.name,
    nativeCurrency: net.nativeCurrency,
    rpcUrls: { default: { http: [net.rpcUrl] } },
  }
}

export function defaultPublicClient(chainId) {
  const net = getNetwork(chainId)
  return createPublicClient({ chain: toViemChain(net), transport: http(net.rpcUrl) })
}

/**
 * Resolve which owner slot a credential occupies on a deployed account, so
 * signatures carry the credential's REAL index — hardcoding 0 breaks every
 * account that gained controllers (spec 045, FR-009). Counterfactual (not yet
 * deployed) or unreadable accounts fall back to 0, the initial owner's slot.
 * A deployed account that no longer lists the credential throws — signing
 * would be guessing.
 */
export async function resolveOwnerIndex({ chainId, accountAddress, credential, deps = {} }) {
  let result
  try {
    result = await (deps.readControllers ?? readControllers)({ chainId, accountAddress, deps })
  } catch {
    return 0
  }
  if (!result.deployed) return 0
  const ownerBytes = publicKeyToOwnerBytes(credential.publicKey).toLowerCase()
  const match = result.controllers.find((c) => c.ownerBytes?.toLowerCase() === ownerBytes)
  if (!match) throw new CredentialNotControllerError()
  return Number(match.index)
}

/**
 * Build the viem smart-account + bundler client pair for a credential.
 * `credential` = { credentialId, publicKey: {x, y} } from credentials.js.
 * `signPayload` lets the connector own the ceremony UX (deps-injectable).
 */
export async function buildAccount({ chainId, credential, ownersBytes, ownerIndex, nonce = 0n, deps = {} }) {
  const { entryPoint, bundlerUrls, sponsorPaymasterUrl } = requirePasskeySupport(chainId)
  const client = deps.publicClient ?? defaultPublicClient(chainId)

  // Refuse incomplete records BEFORE any ceremony — an undefined id/key here
  // used to surface as "Cannot read properties of undefined (reading 'id')"
  // from inside the WebAuthn signer (spec 045, FR-006).
  if (!isTransactComplete(credential)) throw new CredentialRecordIncomplete()

  // Own the WebAuthn get() call: viem's default dereferences the result
  // without a null guard, and some browsers (Brave) resolve null on cancel
  // instead of rejecting. The request options viem passes already pin
  // allowCredentials to this credential.
  const getFn =
    deps.getFn ??
    (async (options) => {
      const credentials = deps.credentials ?? globalThis.navigator?.credentials
      const result = await credentials.get(options)
      if (!result) throw new CeremonyCancelled()
      return result
    })

  const owner = toWebAuthnAccount({
    credential: {
      id: credential.credentialId,
      publicKey: publicKeyToOwnerBytes(credential.publicKey),
    },
    getFn,
    rpId: deps.rpId,
  })

  const account = await toCoinbaseSmartAccount({
    client,
    owners: [owner],
    // ownerIndex of THIS owner inside the account's owner list. Resolved from
    // the chain by callers (resolveOwnerIndex); 0 is the initial credential's
    // slot. Controller additions never reindex (append-only).
    ownerIndex: ownerIndex ?? deps.ownerIndex ?? 0,
    nonce,
    ...(ownersBytes ? {} : {}),
  })

  // FairWins-sponsored paymaster (spec 050): when a sponsor endpoint is configured for this network,
  // the bundler client fetches a signed sponsorship automatically so the account never needs a
  // native-token balance to pay gas. Falls back to native-token fees when unconfigured — or when
  // `deps.noPaymaster` forces self-funding (the never-stranded retry in sendBatch.js when sponsorship
  // is unavailable). `deps.paymaster` still lets tests inject a client directly.
  const paymaster = deps.noPaymaster
    ? undefined
    : deps.paymaster ?? (sponsorPaymasterUrl ? createPaymasterClient({ transport: http(sponsorPaymasterUrl) }) : undefined)

  const bundlerClient = createBundlerClient({
    account,
    client,
    transport: http(bundlerUrls[0]),
    ...(paymaster ? { paymaster } : {}),
  })

  // `sponsored` = a paymaster is wired for this attempt; the caller uses it for honest fee
  // disclosure and to decide whether a self-funded fallback is still possible.
  return { account, bundlerClient, entryPoint, bundlerUrls, publicClient: client, sponsored: Boolean(paymaster) }
}

/**
 * Compose an action as ONE batch (FR-016): [approve?, act] → executeBatch calls.
 * Returns { calls } ready for sendUserOperation / the submission router.
 */
export function buildAction(calls) {
  return {
    calls: calls.map((c) => ({ to: c.target ?? c.to, value: c.value ?? 0n, data: c.data ?? '0x' })),
  }
}

/** Encode a controller addition (passkey) as an account self-call. */
export function encodeAddPasskeyOwner({ x, y }) {
  return encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'addOwnerPublicKey', args: [x, y] })
}

/** Encode a controller addition (external wallet). Screening happens BEFORE this is built (FR-019). */
export function encodeAddWalletOwner(address) {
  return encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'addOwnerAddress', args: [address] })
}

/**
 * Encode a controller removal. Guards the last-controller invariant CLIENT-side
 * (FR-020's UX half — the contract enforces it on-chain regardless).
 */
export function encodeRemoveOwner({ index, ownerBytes, ownerCount }) {
  if (ownerCount <= 1n) throw new LastControllerError()
  return encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'removeOwnerAtIndex', args: [index, ownerBytes] })
}

/** Read the full on-chain controller list (AccountController projection, data-model). */
export async function readControllers({ chainId, accountAddress, deps = {} }) {
  const client = deps.publicClient ?? defaultPublicClient(chainId)
  const code = await client.getCode({ address: accountAddress }).catch(() => null)
  if (!code || code === '0x') return { deployed: false, controllers: [] }

  const next = await client.readContract({
    address: accountAddress,
    abi: ACCOUNT_ABI,
    functionName: 'nextOwnerIndex',
  })
  const controllers = []
  for (let i = 0n; i < next; i++) {
    const ownerBytes = await client.readContract({
      address: accountAddress,
      abi: ACCOUNT_ABI,
      functionName: 'ownerAtIndex',
      args: [i],
    })
    if (!ownerBytes || ownerBytes === '0x') continue // removed slot
    controllers.push({
      index: i,
      ownerBytes,
      kind: ownerBytes.length === 2 + 64 ? 'wallet' : 'passkey',
      address: ownerBytes.length === 2 + 64 ? `0x${ownerBytes.slice(-40)}` : null,
    })
  }
  return { deployed: true, controllers }
}
