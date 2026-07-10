/**
 * FairWins passkey connector (spec 041, T024) — a first-class wagmi connector
 * beside `injected` and `walletConnect`, per contracts/passkey-connector.md.
 *
 * The connector owns: capability detection (FR-004), the sign-up / sign-in
 * ceremonies (via lib/passkey/credentials), session persistence with NO
 * self-expiry (FR-003, clarification Q4), silent reconnect, and an EIP-1193
 * facade whose write path routes through the submission router. Identity
 * semantics (roles, screening) never depend on this connector type (FR-002).
 */

import { createConnector } from 'wagmi'
import { getAddress } from 'viem'
import {
  detectCapability,
  createCredential,
  getAssertion,
  rememberCredential,
  upsertCredential,
  knownCredentials,
  isTransactComplete,
  hasExistingCredential,
} from '../lib/passkey/credentials'
import {
  requirePasskeySupport,
  deriveAddress,
  publicKeyToOwnerBytes,
  readControllers,
} from '../lib/passkey/smartAccount'

export const PASSKEY_CONNECTOR_ID = 'fairwinsPasskey'
const SESSION_KEY = 'fairwins.passkey.session.v1'

export function readSession(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function writeSession(session, storage = globalThis.localStorage) {
  if (session === null) storage.removeItem(SESSION_KEY)
  else storage.setItem(SESSION_KEY, JSON.stringify(session))
}

/**
 * wagmi connector factory. `options`:
 *   mode          'sign-up' | 'sign-in' (the surface sets it per user choice)
 *   deps          injectable ceremonies/clients for tests
 */
export function passkeyConnector(options = {}) {
  const deps = options.deps ?? {}

  return createConnector((config) => ({
    id: PASSKEY_CONNECTOR_ID,
    name: 'Passkey',
    type: 'passkey',

    /** Capability detection — the login surface hides/disables accordingly (FR-004). */
    async setup() {
      this.capability = await (deps.detectCapability ?? detectCapability)()
    },

    async connect({ chainId, isReconnecting, credentialId, mode: requestedMode } = {}) {
      const targetChain = chainId ?? config.chains[0]?.id
      requirePasskeySupport(targetChain) // throws ChainNotSupportedError (FR-022)

      // Silent restore: no ceremony on reload (FR-003). Transactions still
      // require a fresh ceremony each (FR-008) — the session is read-state only.
      // Spec 045 FR-005: only restore sessions the browser can actually sign
      // for — a session whose credential record is missing or incomplete is
      // cleared (honest sign-out) instead of crashing on the first action.
      if (isReconnecting) {
        const session = readSession(deps.storage)
        if (!session) throw new Error('No passkey session to restore')
        const record = knownCredentials(deps.storage).find((c) => c.credentialId === session.credentialId)
        if (!isTransactComplete(record)) {
          writeSession(null, deps.storage)
          throw new Error('Passkey session is unusable on this browser — sign in again.')
        }
        return { accounts: [getAddress(session.address)], chainId: session.chainId ?? targetChain }
      }

      let credential
      let address
      const mode =
        requestedMode ?? options.mode ?? (hasExistingCredential(deps.storage) ? 'sign-in' : 'sign-up')

      if (mode === 'sign-up') {
        credential = await (deps.createCredential ?? createCredential)({ label: options.label, deps })
        const ownersBytes = [publicKeyToOwnerBytes(credential.publicKey)]
        address = await (deps.deriveAddress ?? deriveAddress)({ chainId: targetChain, ownersBytes, deps })
        rememberCredential({ ...credential, address }, deps.storage)
      } else {
        // Sign-in: pinned to the account the user picked in the in-app chooser
        // when `credentialId` is set; otherwise getAssertion offers the whole
        // local book via allowCredentials so the platform must show a chooser
        // (spec 045 US3 — the app never guesses, and neither may the browser).
        const assertion = await (deps.getAssertion ?? getAssertion)({
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          credentialId,
          deps,
        })
        credential = { credentialId: assertion.credentialId }
        address = await (deps.resolveAddress ?? resolveAddressForCredential)({
          credentialId: assertion.credentialId,
          chainId: targetChain,
          deps,
        })
        // Keep the book transact-complete (spec 045 FR-005): refresh the
        // record for the asserted credential, repairing a missing public key
        // from the chain when it can be identified unambiguously.
        const record = upsertCredential(
          {
            credentialId: assertion.credentialId,
            address,
            publicKey: await repairPublicKey({ credentialId: assertion.credentialId, address, chainId: targetChain, deps }),
          },
          deps.storage
        )
        // FR-005: sign-in must leave the session able to transact. If the
        // record still lacks its key (and the chain couldn't disambiguate),
        // refuse honestly now instead of minting a session that fails on its
        // first action.
        if (!isTransactComplete(record)) {
          throw new Error(
            'This browser cannot sign for that account yet — its passkey record is incomplete. ' +
              'Use a linked wallet to recover access, or sign in on the browser where this passkey was created.'
          )
        }
      }

      const session = {
        address,
        chainId: targetChain,
        credentialId: credential.credentialId,
        loginMethod: 'passkey',
        // No expiry field BY DESIGN — persists until explicit sign-out (clarification Q4).
      }
      writeSession(session, deps.storage)
      return { accounts: [getAddress(address)], chainId: targetChain }
    },

    /** Full FR-003 sign-out: the session row is removed atomically. */
    async disconnect() {
      writeSession(null, deps.storage)
    },

    async getAccounts() {
      const session = readSession(deps.storage)
      return session ? [getAddress(session.address)] : []
    },

    async getChainId() {
      const session = readSession(deps.storage)
      return session?.chainId ?? config.chains[0]?.id
    },

    async isAuthorized() {
      return readSession(deps.storage) !== null
    },

    async switchChain({ chainId }) {
      requirePasskeySupport(chainId) // ChainNotSupportedError on ETC/Mordor (FR-022)
      const session = readSession(deps.storage)
      if (session) writeSession({ ...session, chainId }, deps.storage)
      const chain = config.chains.find((c) => c.id === chainId)
      config.emitter.emit('change', { chainId })
      return chain
    },

    async getProvider() {
      // EIP-1193 facade: reads proxy the chain RPC; writes are fulfilled by the
      // submission router (lib/passkey/submission) via WalletContext's sendCalls
      // abstraction — never a naive eth_sendTransaction from a key this
      // connector doesn't have.
      return deps.provider ?? null
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      writeSession(null, deps.storage)
    },
  }))
}

/**
 * Best-effort public-key repair for a sign-in whose local record lost its
 * P-256 key (legacy/partial writes). The chain stores every passkey owner's
 * key as its owner bytes — when the account has exactly ONE passkey
 * controller the mapping is unambiguous and the record can be healed, making
 * "sign out and sign back in" an actual fix for CredentialRecordIncomplete.
 * Ambiguous (multi-passkey) or unreachable accounts return undefined: the
 * upsert then simply keeps whatever the record already had.
 */
async function repairPublicKey({ credentialId, address, chainId, deps }) {
  try {
    const existing = knownCredentials(deps.storage).find((c) => c.credentialId === credentialId)
    if (existing?.publicKey?.x && existing?.publicKey?.y) return undefined // nothing to repair
    const { controllers } = await (deps.readControllers ?? readControllers)({
      chainId,
      accountAddress: address,
      deps,
    })
    const passkeyOwners = controllers.filter((c) => c.kind === 'passkey')
    if (passkeyOwners.length !== 1) return undefined
    const bytes = passkeyOwners[0].ownerBytes
    // Only the exact 64-byte x||y encoding is a P-256 key — persisting a
    // malformed slice would pass isTransactComplete yet break signing later.
    if (typeof bytes !== 'string' || !/^0x[0-9a-fA-F]{128}$/.test(bytes)) return undefined
    return { x: `0x${bytes.slice(2, 66)}`, y: `0x${bytes.slice(66, 130)}` }
  } catch {
    return undefined
  }
}

/**
 * Resolve a credential to its account address. Order: local mapping (fast),
 * then the on-chain owner lookup rebuild (survives cleared browser data —
 * the address book of last resort is the chain itself).
 */
export async function resolveAddressForCredential({ credentialId, chainId, deps = {} }) {
  const { knownCredentials } = await import('../lib/passkey/credentials')
  const local = knownCredentials(deps.storage).find((c) => c.credentialId === credentialId)
  if (local?.address) return local.address
  if (local?.publicKey) {
    return deriveAddress({ chainId, ownersBytes: [publicKeyToOwnerBytes(local.publicKey)], deps })
  }
  // Cleared storage AND an assertion that carries no public key: the address
  // can be re-derived once the user provides/looks up their account address
  // (US3 flow) — surfaced as an explicit, honest error here.
  throw new Error(
    'This passkey is not yet linked to an account on this browser. Enter your account address to relink.'
  )
}
