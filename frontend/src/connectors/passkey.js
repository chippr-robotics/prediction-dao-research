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
  hasExistingCredential,
} from '../lib/passkey/credentials'
import { requirePasskeySupport, deriveAddress, publicKeyToOwnerBytes } from '../lib/passkey/smartAccount'

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

    async connect({ chainId, isReconnecting } = {}) {
      const targetChain = chainId ?? config.chains[0]?.id
      requirePasskeySupport(targetChain) // throws ChainNotSupportedError (FR-022)

      // Silent restore: no ceremony on reload (FR-003). Transactions still
      // require a fresh ceremony each (FR-008) — the session is read-state only.
      if (isReconnecting) {
        const session = readSession(deps.storage)
        if (!session) throw new Error('No passkey session to restore')
        return { accounts: [getAddress(session.address)], chainId: session.chainId ?? targetChain }
      }

      let credential
      let address
      const mode = options.mode ?? (hasExistingCredential(deps.storage) ? 'sign-in' : 'sign-up')

      if (mode === 'sign-up') {
        credential = await (deps.createCredential ?? createCredential)({ label: options.label, deps })
        const ownersBytes = [publicKeyToOwnerBytes(credential.publicKey)]
        address = await (deps.deriveAddress ?? deriveAddress)({ chainId: targetChain, ownersBytes, deps })
        rememberCredential({ ...credential, address }, deps.storage)
      } else {
        // Sign-in: platform picker chooses among discoverable credentials —
        // the app never guesses (edge case "multiple accounts").
        const assertion = await (deps.getAssertion ?? getAssertion)({
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          deps,
        })
        credential = { credentialId: assertion.credentialId }
        address = await (deps.resolveAddress ?? resolveAddressForCredential)({
          credentialId: assertion.credentialId,
          chainId: targetChain,
          deps,
        })
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
