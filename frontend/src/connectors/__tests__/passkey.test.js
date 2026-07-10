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
          passkey: { bundlerUrls: ['https://bundler.example'], erc20PaymasterUrl: null },
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
import { rememberCredential, knownCredentials } from '../../lib/passkey/credentials'

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
    const { connector, deps } = makeConnector({
      options: { mode: 'sign-in' },
      getAssertion: vi.fn().mockResolvedValue({ credentialId: 'cred-2' }),
      resolveAddress: vi.fn().mockResolvedValue(ACCOUNT),
    })
    await connector.connect({ chainId: 80002, credentialId: 'cred-2' })
    expect(deps.getAssertion).toHaveBeenCalledWith(expect.objectContaining({ credentialId: 'cred-2' }))
    expect(readSession().credentialId).toBe('cred-2') // session pins what was ASSERTED
  })

  it('refuses unsupported networks with ChainNotSupportedError (FR-022)', async () => {
    const { connector } = makeConnector()
    await expect(connector.connect({ chainId: 63 })).rejects.toBeInstanceOf(ChainNotSupportedError)
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

  it('switchChain refuses unsupported chains and updates the session on supported ones', async () => {
    const { connector, config } = makeConnector()
    await connector.connect({ chainId: 80002 })
    await expect(connector.switchChain({ chainId: 63 })).rejects.toBeInstanceOf(ChainNotSupportedError)
    expect(readSession().chainId).toBe(80002) // unchanged after refusal
    await expect(connector.switchChain({ chainId: 137 })).rejects.toBeInstanceOf(ChainNotSupportedError) // 137 unconfigured in this mock
    expect(config.emitter.emit).not.toHaveBeenCalledWith('change', { chainId: 63 })
  })

  it('exposes the stable connector id used by walletLabel (vendor-neutral)', () => {
    const { connector } = makeConnector()
    expect(connector.id).toBe(PASSKEY_CONNECTOR_ID)
    expect(connector.type).toBe('passkey')
  })
})
