/**
 * Spec 041 T025 — passkey connector: fresh connect (sign-up + sign-in),
 * silent reconnect, disconnect clears session, unsupported-chain refusal,
 * session persistence semantics (no self-expiry).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../config/networks', () => ({
  getNetwork: vi.fn((chainId) =>
    chainId === 80002
      ? {
          chainId: 80002,
          rpcUrl: 'https://rpc.example',
          capabilities: { passkeyAccounts: true },
          passkey: { bundlerUrls: ['https://bundler.example'], sponsorPaymasterUrl: null },
        }
      : { chainId, capabilities: { passkeyAccounts: false }, passkey: null }
  ),
}))
vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: vi.fn((key, chainId) =>
    chainId === 80002
      ? {
          accountFactory: '0xFAC7000000000000000000000000000000000001',
          entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
        }[key]
      : null
  ),
}))

import { passkeyConnector, readSession, writeSession, PASSKEY_CONNECTOR_ID } from '../passkey'
import { ChainNotSupportedError } from '../../lib/passkey/smartAccount'
import { rememberCredential, knownCredentials, isTransactComplete } from '../../lib/passkey/credentials'
import { computeAccountAddress, publicKeyToOwnerBytes } from '../../lib/passkey/smartAccount'
import { p256 } from '@noble/curves/p256.js'
import { sha256 } from '@noble/hashes/sha2.js'

const ACCOUNT = '0x00000000000000000000000000000000000a11CE'
const PUBLIC_KEY = { x: '0x' + '1'.repeat(64), y: '0x' + '2'.repeat(64) }

function makeConnector(overrides = {}) {
  const deps = {
    detectCapability: vi.fn().mockResolvedValue({ available: true, platformAuthenticator: true }),
    createCredential: vi
      .fn()
      .mockResolvedValue({ credentialId: 'cred-1', publicKey: PUBLIC_KEY, prfCapable: true }),
    getAssertion: vi.fn().mockResolvedValue({ credentialId: 'cred-1' }),
    deriveAddress: vi.fn().mockResolvedValue(ACCOUNT),
    resolveAddress: vi.fn().mockResolvedValue(ACCOUNT),
    readControllers: vi.fn().mockResolvedValue({ deployed: false, controllers: [] }),
    ...overrides,
  }
  const config = {
    chains: [{ id: 80002 }, { id: 137 }],
    emitter: { emit: vi.fn() },
  }
  const connector = passkeyConnector({ deps, ...overrides.options })(config)
  return { connector, deps, config }
}

/** A transact-complete book record, as sign-up would have written it. */
function rememberCompleteRecord(credentialId = 'cred-1') {
  rememberCredential({ credentialId, publicKey: PUBLIC_KEY, prfCapable: true, address: ACCOUNT })
}

beforeEach(() => localStorage.clear())

describe('connect', () => {
  it('sign-up: creates a credential, derives the counterfactual address, persists the session', async () => {
    const { connector } = makeConnector()
    const out = await connector.connect({ chainId: 80002 })
    expect(out.accounts[0].toLowerCase()).toBe(ACCOUNT.toLowerCase())
    expect(out.chainId).toBe(80002)
    const session = readSession()
    expect(session.loginMethod).toBe('passkey')
    expect(session.credentialId).toBe('cred-1')
    expect(session.expiry ?? session.expiresAt).toBeUndefined() // no self-expiry (clarification Q4)
  })

  it('sign-in: unpinned assertion (platform picker) resolves the existing account', async () => {
    rememberCompleteRecord()
    const { connector, deps } = makeConnector({ options: { mode: 'sign-in' } })
    const out = await connector.connect({ chainId: 80002 })
    expect(deps.getAssertion).toHaveBeenCalled()
    expect(deps.createCredential).not.toHaveBeenCalled()
    expect(out.accounts[0].toLowerCase()).toBe(ACCOUNT.toLowerCase())
  })

  it('sign-in refreshes the credential book so the session can transact (spec 045 FR-005)', async () => {
    // The old sign-in branch never wrote the book — the transaction path then
    // resolved an undefined credential and crashed with "reading 'id'".
    rememberCompleteRecord()
    const { connector } = makeConnector({ options: { mode: 'sign-in' } })
    await connector.connect({ chainId: 80002 })
    const [rec] = knownCredentials()
    expect(rec.credentialId).toBe('cred-1')
    expect(rec.address).toBe(ACCOUNT)
    expect(rec.publicKey).toEqual(PUBLIC_KEY) // merge never drops the key
  })

  it('sign-in repairs a missing public key from the chain when unambiguous', async () => {
    rememberCredential({ credentialId: 'cred-1', address: ACCOUNT }) // legacy partial record
    const ownerBytes = `0x${'1'.repeat(64)}${'2'.repeat(64)}`
    const { connector } = makeConnector({
      options: { mode: 'sign-in' },
      readControllers: vi.fn().mockResolvedValue({
        deployed: true,
        controllers: [{ index: 0n, kind: 'passkey', ownerBytes }],
      }),
    })
    await connector.connect({ chainId: 80002 })
    const [rec] = knownCredentials()
    expect(rec.publicKey).toEqual(PUBLIC_KEY)
  })

  it('sign-in pinned to a chosen credential passes it to the assertion (spec 045 US3)', async () => {
    rememberCredential({ credentialId: 'cred-2', publicKey: PUBLIC_KEY, address: ACCOUNT })
    const { connector, deps } = makeConnector({
      options: { mode: 'sign-in' },
      getAssertion: vi.fn().mockResolvedValue({ credentialId: 'cred-2' }),
      resolveAddress: vi.fn().mockResolvedValue(ACCOUNT),
    })
    await connector.connect({ chainId: 80002, credentialId: 'cred-2' })
    expect(deps.getAssertion).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'cred-2' }))
    expect(readSession().credentialId).toBe('cred-2') // session pins what was ASSERTED
  })

  it('sign-in forwards discoverable to the assertion so any device passkey is reachable (issue #849)', async () => {
    rememberCompleteRecord()
    const { connector, deps } = makeConnector({ options: { mode: 'sign-in' } })
    await connector.connect({ chainId: 80002, discoverable: true })
    expect(deps.getAssertion).toHaveBeenCalledWith(expect.objectContaining({ discoverable: true }))
  })

  it('sign-in REFUSES (no session) when the record still cannot transact after repair (FR-005)', async () => {
    // Partial record + ambiguous chain state (two passkey owners): the key
    // cannot be reconstructed, so minting a session would just crash later.
    rememberCredential({ credentialId: 'cred-1', address: ACCOUNT }) // no publicKey
    const ownerBytes = `0x${'1'.repeat(64)}${'2'.repeat(64)}`
    const { connector } = makeConnector({
      options: { mode: 'sign-in' },
      readControllers: vi.fn().mockResolvedValue({
        deployed: true,
        controllers: [
          { index: 0n, kind: 'passkey', ownerBytes },
          { index: 1n, kind: 'passkey', ownerBytes: `0x${'3'.repeat(64)}${'4'.repeat(64)}` },
        ],
      }),
    })
    await expect(connector.connect({ chainId: 80002 })).rejects.toThrow(/recover access/i)
    expect(readSession()).toBeNull()
  })

  it('does not repair from malformed on-chain owner bytes (refuses instead of persisting junk)', async () => {
    rememberCredential({ credentialId: 'cred-1', address: ACCOUNT }) // no publicKey
    const { connector } = makeConnector({
      options: { mode: 'sign-in' },
      readControllers: vi.fn().mockResolvedValue({
        deployed: true,
        controllers: [{ index: 0n, kind: 'passkey', ownerBytes: '0x1234' }], // not 64 bytes
      }),
    })
    await expect(connector.connect({ chainId: 80002 })).rejects.toThrow(/recover access/i)
    const [rec] = knownCredentials()
    expect(rec.publicKey).toBeUndefined() // junk was never persisted
  })

  it('signs in on a network with NO passkey submission support (the lockout fix)', async () => {
    // Chain 63 has no bundler in this mock. Sign-in must still work: it is a WebAuthn ceremony
    // plus a LOCAL address derivation, needing no bundler, EntryPoint or RPC.
    //
    // This used to throw ChainNotSupportedError, which locked members out of their own accounts —
    // the selected network persists, so a member who switched to an unsupported chain returned to
    // find the passkey option refused on the chain they were already on, and switching away
    // required signing in first. Submission support is enforced in buildAccount instead.
    const { connector } = makeConnector()
    const out = await connector.connect({ chainId: 63 })
    expect(out.accounts).toHaveLength(1)
    expect(out.chainId).toBe(63)
  })

  it('derives the same account address whichever chain is connected to (FR-023)', async () => {
    const a = await makeConnector().connector.connect({ chainId: 80002 })
    const b = await makeConnector().connector.connect({ chainId: 63 })
    expect(a.accounts[0]).toBe(b.accounts[0])
  })

  it('silent reconnect restores the session without any ceremony (FR-003)', async () => {
    rememberCompleteRecord()
    writeSession({ address: ACCOUNT, chainId: 80002, credentialId: 'cred-1', loginMethod: 'passkey' })
    const { connector, deps } = makeConnector()
    const out = await connector.connect({ chainId: 80002, isReconnecting: true })
    expect(out.accounts[0].toLowerCase()).toBe(ACCOUNT.toLowerCase())
    expect(deps.createCredential).not.toHaveBeenCalled()
    expect(deps.getAssertion).not.toHaveBeenCalled()
  })

  /*
   * THE REGRESSION THAT COST EVERY PASSKEY MEMBER THEIR SESSION ON RELOAD.
   *
   * wagmi's `reconnect` filters connectors before it asks whether they are authorized:
   *
   *     const provider = await connector.getProvider().catch(() => undefined)
   *     if (!provider) continue
   *
   * `getProvider()` returned null, so the passkey connector was skipped every time and the
   * reconnect below — which has always passed — was never reached in a real browser. The unit
   * test proving the restore works is exactly what made the breakage invisible, so this asserts
   * the precondition wagmi actually applies.
   */
  it('exposes a provider at all, because wagmi skips connectors without one', async () => {
    const { connector } = makeConnector()
    const provider = await connector.getProvider()
    expect(provider, 'a null provider makes reconnect unreachable').toBeTruthy()
  })

  it('keeps provider identity stable — wagmi dedupes providers by reference', async () => {
    const { connector } = makeConnector()
    expect(await connector.getProvider()).toBe(await connector.getProvider())
  })

  it('refuses to sign from the facade: this connector holds no key', async () => {
    const { connector } = makeConnector()
    const provider = await connector.getProvider()
    await expect(provider.request({ method: 'eth_sendTransaction', params: [{}] })).rejects.toThrow(
      /submission router/,
    )
    await expect(provider.request({ method: 'personal_sign', params: [] })).rejects.toThrow(
      /submission router/,
    )
  })

  it('answers eth_accounts from the session, so the facade agrees with the connector', async () => {
    rememberCompleteRecord()
    writeSession({ address: ACCOUNT, chainId: 80002, credentialId: 'cred-1', loginMethod: 'passkey' })
    const { connector } = makeConnector()
    const provider = await connector.getProvider()
    expect(await provider.request({ method: 'eth_accounts' })).toEqual(await connector.getAccounts())
  })

  it('reconnect with no stored session fails (no silent account invention)', async () => {
    const { connector } = makeConnector()
    await expect(connector.connect({ chainId: 80002, isReconnecting: true })).rejects.toThrow(/No passkey session/)
  })

  it('reconnect refuses + clears a session whose credential record cannot transact (spec 045 FR-005)', async () => {
    // Session exists but the book record is incomplete (legacy partial write):
    // restoring it would strand the user with a session that crashes on first
    // action — refuse it honestly instead.
    rememberCredential({ credentialId: 'cred-1', address: ACCOUNT }) // no publicKey
    writeSession({ address: ACCOUNT, chainId: 80002, credentialId: 'cred-1', loginMethod: 'passkey' })
    const { connector } = makeConnector()
    await expect(connector.connect({ chainId: 80002, isReconnecting: true })).rejects.toThrow(/sign in again/)
    expect(readSession()).toBeNull()
  })
})

describe('session lifecycle', () => {
  it('disconnect clears the persisted session atomically (FR-003 sign-out)', async () => {
    const { connector } = makeConnector()
    await connector.connect({ chainId: 80002 })
    expect(readSession()).not.toBeNull()
    await connector.disconnect()
    expect(readSession()).toBeNull()
    expect(await connector.getAccounts()).toEqual([])
    expect(await connector.isAuthorized()).toBe(false)
  })

  it('getAccounts / getChainId / isAuthorized reflect the persisted session', async () => {
    const { connector } = makeConnector()
    await connector.connect({ chainId: 80002 })
    expect((await connector.getAccounts())[0].toLowerCase()).toBe(ACCOUNT.toLowerCase())
    expect(await connector.getChainId()).toBe(80002)
    expect(await connector.isAuthorized()).toBe(true)
  })

  it('switchChain allows an unsupported chain and keeps the session (never a one-way door)', async () => {
    // Refusing here was the other half of the lockout: it made an unsupported chain unreachable
    // AND unleavable. The member keeps their session and every read surface; only the write path
    // is limited, and it says so at the point of action.
    const { connector, config } = makeConnector()
    await connector.connect({ chainId: 80002 })
    await connector.switchChain({ chainId: 63 })
    expect(readSession().chainId).toBe(63)
    expect(config.emitter.emit).toHaveBeenCalledWith('change', { chainId: 63 })
    // …and the member can always switch back.
    await connector.switchChain({ chainId: 80002 })
    expect(readSession().chainId).toBe(80002)
  })

  it('exposes the stable connector id used by walletLabel (vendor-neutral)', () => {
    const { connector } = makeConnector()
    expect(connector.id).toBe(PASSKEY_CONNECTOR_ID)
    expect(connector.type).toBe('passkey')
  })
})

/**
 * Cross-device sign-in: the passkey was created on another device (phone) and is synced here, so
 * the ceremony succeeds but this browser has never recorded the account. Previously this failed
 * with "This passkey is not yet linked to an account on this browser."
 *
 * Uses REAL P-256 signatures — the feature is a claim about what the maths permits, so mocking the
 * crypto would test nothing.
 */
describe('cross-device sign-in (fresh browser, synced passkey)', () => {
  const enc = (s) => new TextEncoder().encode(s)
  const concat = (...a) => {
    const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0))
    let o = 0
    for (const x of a) { out.set(x, o); o += x.length }
    return out
  }

  const makeAssertion = (priv, challenge) => {
    const authenticatorData = concat(sha256(enc('fairwins.app')), new Uint8Array([0x05]), new Uint8Array([0, 0, 0, 1]))
    const clientDataJSON = enc(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://fairwins.app' }))
    const sig = p256.sign(sha256(concat(authenticatorData, sha256(clientDataJSON))), priv, { lowS: false })
    const der = sig.toDERRawBytes ? sig.toDERRawBytes() : sig.toBytes('der')
    return { credentialId: 'cred-phone', authenticatorData, clientDataJSON, signature: new Uint8Array(der) }
  }

  it('resolves the account from the signature and leaves the session able to transact', async () => {
    const priv = p256.utils.randomSecretKey()
    const xy = `0x${Array.from(p256.getPublicKey(priv, false).subarray(1), (b) => b.toString(16).padStart(2, '0')).join('')}`

    let n = 0
    const getAssertion = vi.fn(async () => makeAssertion(priv, `challenge-${n++}`))
    // localStorage is empty (beforeEach clears it) — the fresh-device condition.
    expect(knownCredentials()).toHaveLength(0)

    const { connector } = makeConnector({
      getAssertion,
      deriveAddress: undefined, // use the real local derivation
      resolveAddress: undefined,
    })
    const out = await connector.connect({ chainId: 80002, mode: 'sign-in' })

    expect(out.accounts).toHaveLength(1)
    // Two ceremonies: one signature can never identify the key (see lib/passkey/crossDevice.js).
    expect(getAssertion).toHaveBeenCalledTimes(2)

    // The recovered key is persisted, so the very next action can sign without another recovery.
    const record = knownCredentials().find((c) => c.credentialId === 'cred-phone')
    expect(publicKeyToOwnerBytes(record.publicKey)).toBe(xy)
    expect(isTransactComplete(record)).toBe(true)

    // …and the address is exactly what that key derives.
    expect(out.accounts[0].toLowerCase()).toBe(
      computeAccountAddress({ ownersBytes: [xy], nonce: 0n }).toLowerCase()
    )
  })

  it('refuses (no session) rather than guessing when the two confirmations disagree', async () => {
    const a = p256.utils.randomSecretKey()
    const b = p256.utils.randomSecretKey()
    let n = 0
    const getAssertion = vi.fn(async () => makeAssertion(n++ === 0 ? a : b, `challenge-${n}`))

    const { connector } = makeConnector({ getAssertion, deriveAddress: undefined, resolveAddress: undefined })
    await expect(connector.connect({ chainId: 80002, mode: 'sign-in' })).rejects.toThrow()
    expect(readSession()).toBeNull()
  })
})

describe('cross-device: the passkey belongs to a DIFFERENT account', () => {
  const enc = (s) => new TextEncoder().encode(s)
  const concat = (...a) => {
    const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0))
    let o = 0
    for (const x of a) { out.set(x, o); o += x.length }
    return out
  }
  const makeAssertion = (priv, challenge) => {
    const authenticatorData = concat(sha256(enc('fairwins.app')), new Uint8Array([0x05]), new Uint8Array([0, 0, 0, 1]))
    const clientDataJSON = enc(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://fairwins.app' }))
    const sig = p256.sign(sha256(concat(authenticatorData, sha256(clientDataJSON))), priv, { lowS: false })
    return {
      credentialId: 'cred-phone',
      authenticatorData,
      clientDataJSON,
      signature: new Uint8Array(sig.toDERRawBytes ? sig.toDERRawBytes() : sig.toBytes('der')),
    }
  }

  it('refuses when the derived account is deployed but does not list this passkey', async () => {
    // The passkey was added as a SECOND controller to a pre-existing account, so its own key does
    // not derive that account's address. Handing back the derived address would show the member an
    // account that is not theirs.
    const priv = p256.utils.randomSecretKey()
    let n = 0
    const { connector } = makeConnector({
      getAssertion: vi.fn(async () => makeAssertion(priv, `c-${n++}`)),
      deriveAddress: undefined,
      resolveAddress: undefined,
      readControllers: vi.fn().mockResolvedValue({
        deployed: true,
        controllers: [{ index: 0n, kind: 'passkey', ownerBytes: `0x${'9'.repeat(128)}` }],
      }),
    })
    await expect(connector.connect({ chainId: 80002, mode: 'sign-in' })).rejects.toThrow(/cannot identify/i)
    expect(readSession()).toBeNull()
  })

  it('still signs in when the chain is unreachable (sign-in never requires an RPC)', async () => {
    const priv = p256.utils.randomSecretKey()
    let n = 0
    const { connector } = makeConnector({
      getAssertion: vi.fn(async () => makeAssertion(priv, `c-${n++}`)),
      deriveAddress: undefined,
      resolveAddress: undefined,
      readControllers: vi.fn().mockRejectedValue(new Error('RPC down')),
    })
    const out = await connector.connect({ chainId: 80002, mode: 'sign-in' })
    expect(out.accounts).toHaveLength(1)
  })
})
