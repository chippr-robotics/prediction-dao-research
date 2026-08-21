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
import { deriveAddress, publicKeyToOwnerBytes, readControllers } from '../lib/passkey/smartAccount'

export const PASSKEY_CONNECTOR_ID = 'fairwinsPasskey'
const SESSION_KEY = 'fairwins.passkey.session.v1'

/** Methods the facade refuses: this connector holds no key (see getProvider). */
const PASSKEY_WRITE_METHODS = new Set([
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
])

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

  return createConnector((config) => {
  /*
   * THE EIP-1193 FACADE, AND WHY IT MAY NEVER BE NULL AGAIN.
   *
   * wagmi's `reconnect` skips any connector whose provider is falsy, before it ever asks whether
   * the connector is authorized:
   *
   *     const provider = await connector.getProvider().catch(() => undefined)
   *     if (!provider) continue
   *
   * This returned `null`, so wagmi silently skipped the passkey connector on every reconnect and
   * every passkey member was signed out by a page reload — with a complete session and credential
   * record sitting in storage, and FR-003's "silent restore, no ceremony on reload" never once
   * happening in a browser. Nothing reported it: wagmi swallows reconnect failures, the connector's
   * own unit tests exercise `connect({ isReconnecting: true })` directly (which works), and the
   * one account-native test that always ran checks session persistence at the localStorage
   * boundary rather than the restore.
   *
   * Built ONCE per connector instance, because wagmi also dedupes by reference
   * (`providers.some((x) => x === provider)`) — a fresh object per call would make two connectors
   * look distinct even when they are not, and defeats the identity check.
   *
   * Reads proxy the configured transport. Writes are refused here BY DESIGN: this connector holds
   * no key, and a passkey transaction is a UserOp assembled by the submission router.
   */
  const provider = deps.provider ?? {
    async request({ method, params } = {}) {
      if (PASSKEY_WRITE_METHODS.has(method)) {
        throw new Error(
          `${method} is not signed by the passkey connector — passkey writes are assembled by the ` +
            'submission router (lib/passkey/submission), not sent as a raw transaction.',
        )
      }
      const session = readSession(deps.storage)
      const chainId = session?.chainId ?? config.chains[0]?.id
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return session ? [getAddress(session.address)] : []
      }
      if (method === 'eth_chainId') return `0x${Number(chainId).toString(16)}`
      return config.getClient({ chainId }).request({ method, params })
    },
    on() {},
    removeListener() {},
  }

  return {
    id: PASSKEY_CONNECTOR_ID,
    name: 'Passkey',
    type: 'passkey',

    /** Capability detection — the login surface hides/disables accordingly (FR-004). */
    async setup() {
      this.capability = await (deps.detectCapability ?? detectCapability)()
    },

    async connect({ chainId, isReconnecting, credentialId, discoverable, mode: requestedMode } = {}) {
      const targetChain = chainId ?? config.chains[0]?.id
      // NO network gate here, deliberately. Signing in is a WebAuthn ceremony plus a local address
      // derivation — it needs no bundler, no EntryPoint and no RPC. Gating it on submission support
      // locked members out: selecting a network without a bundler persisted in the session, and on
      // the next visit the passkey option was refused on the very chain they were already on, with
      // no way to switch back because switching required being signed in. Submission support is
      // enforced where it actually applies, in buildAccount (lib/passkey/smartAccount.js).

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
        // `discoverable` (issue #849) widens that to a bare discoverable request
        // so passkeys this browser never recorded — but that live on the device
        // — become reachable from "Use a different passkey…".
        const assertion = await (deps.getAssertion ?? getAssertion)({
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          credentialId,
          discoverable,
          deps,
        })
        credential = { credentialId: assertion.credentialId }
        // Passing the assertion through enables cross-device sign-in: with no local record, the
        // public key is recovered from this very signature rather than the member being told the
        // passkey "does not have an account on this device".
        const resolved = await (deps.resolveAccount ?? resolveAccountForCredential)({
          credentialId: assertion.credentialId,
          chainId: targetChain,
          assertion,
          deps,
        })
        address = resolved.address
        // Keep the book transact-complete (spec 045 FR-005): refresh the
        // record for the asserted credential. The key comes from cross-device
        // recovery when that ran, else from the chain when it is unambiguous.
        const record = upsertCredential(
          {
            credentialId: assertion.credentialId,
            address,
            publicKey:
              resolved.publicKey ??
              (await repairPublicKey({ credentialId: assertion.credentialId, address, chainId: targetChain, deps })),
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
      // Switching to a chain without passkey submission is ALLOWED: the member keeps their session
      // and every read surface (portfolio, receive, history) keeps working. Refusing here was half
      // of the lockout — it made an unsupported chain a one-way door. The write path discloses the
      // limitation honestly at the point of action instead.
      const session = readSession(deps.storage)
      if (session) writeSession({ ...session, chainId }, deps.storage)
      const chain = config.chains.find((c) => c.id === chainId)
      config.emitter.emit('change', { chainId })
      return chain
    },

    async getProvider() {
      // NEVER null — see the facade above. wagmi's reconnect drops any connector without one.
      return provider
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      writeSession(null, deps.storage)
    },
  }
  })
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
export async function resolveAccountForCredential({ credentialId, chainId, assertion, deps = {} }) {
  const { knownCredentials } = await import('../lib/passkey/credentials')
  const local = knownCredentials(deps.storage).find((c) => c.credentialId === credentialId)
  if (local?.address) return { address: local.address, publicKey: local.publicKey }
  if (local?.publicKey) {
    const address = await deriveAddress({
      chainId,
      ownersBytes: [publicKeyToOwnerBytes(local.publicKey)],
      deps,
    })
    return { address, publicKey: local.publicKey }
  }

  // Nothing local — the CROSS-DEVICE case: the passkey is synced from another device (iCloud
  // Keychain / Google Password Manager) so the ceremony succeeds, but this browser has never seen
  // the account. Recover the public key from the signature the member just produced; that is
  // enough to derive the address, and it also leaves the session able to transact without a
  // further ceremony. Needs one extra confirmation because a single signature cannot identify a
  // key unambiguously — see lib/passkey/crossDevice.js — and only on first use on this device.
  if (assertion) {
    const { recoverPublicKey } = await import('../lib/passkey/crossDevice')
    const { publicKey, ownerBytes } = await (deps.recoverPublicKey ?? recoverPublicKey)({
      first: assertion,
      credentialId,
      deps,
    })
    const address = await deriveAddress({ chainId, ownersBytes: [ownerBytes], deps })

    // The derivation assumes this passkey is the account's INITIAL owner, which is true for a
    // passkey created at sign-up but NOT for one added later as an extra controller to a
    // pre-existing account — that account's address came from a different initial key and is not
    // recoverable from this one. Confirm against the chain when we can reach it: an undeployed
    // address is the canonical account this key owns (nothing to contradict), and a deployed one
    // must actually list the key. A deployed account that does NOT list it means this passkey
    // belongs to some other account we cannot find offline — refuse rather than hand back an
    // address that is not theirs.
    //
    // Soft-fails on an unreachable RPC by design: sign-in must not require a working chain (that
    // is the lockout fix), and the derived address is still the correct self-owned account.
    try {
      const { deployed, controllers } = await (deps.readControllers ?? readControllers)({
        chainId,
        accountAddress: address,
        deps,
      })
      const listed = controllers.some((c) => c.ownerBytes?.toLowerCase() === ownerBytes.toLowerCase())
      if (deployed && !listed) {
        throw new Error(
          'This passkey controls an account that this browser cannot identify. Sign in on the device ' +
            'where it was set up, or use a linked wallet to recover access.'
        )
      }
    } catch (err) {
      if (err?.message?.includes('cannot identify')) throw err
      // Unreachable chain — proceed on the derivation (see above).
    }
    return { address, publicKey }
  }

  throw new Error(
    'This passkey is not yet linked to an account on this browser. Enter your account address to relink.'
  )
}

/** Address-only form of {@link resolveAccountForCredential}. */
export async function resolveAddressForCredential({ credentialId, chainId, assertion, deps = {} }) {
  const { address } = await resolveAccountForCredential({ credentialId, chainId, assertion, deps })
  return address
}
