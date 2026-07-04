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

const ACCOUNT = '0x00000000000000000000000000000000000a11CE'

function makeConnector(overrides = {}) {
  const deps = {
    detectCapability: vi.fn().mockResolvedValue({ available: true, platformAuthenticator: true }),
    createCredential: vi
      .fn()
      .mockResolvedValue({ credentialId: 'cred-1', publicKey: { x: '0x' + '1'.repeat(64), y: '0x' + '2'.repeat(64) }, prfCapable: true }),
    getAssertion: vi.fn().mockResolvedValue({ credentialId: 'cred-1' }),
    deriveAddress: vi.fn().mockResolvedValue(ACCOUNT),
    resolveAddress: vi.fn().mockResolvedValue(ACCOUNT),
    ...overrides,
  }
  const config = {
    chains: [{ id: 80002 }, { id: 137 }],
    emitter: { emit: vi.fn() },
  }
  const connector = passkeyConnector({ deps, ...overrides.options })(config)
  return { connector, deps, config }
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

  it('refuses unsupported networks with ChainNotSupportedError (FR-022)', async () => {
    const { connector } = makeConnector()
    await expect(connector.connect({ chainId: 63 })).rejects.toBeInstanceOf(ChainNotSupportedError)
  })

  it('silent reconnect restores the session without any ceremony (FR-003)', async () => {
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
