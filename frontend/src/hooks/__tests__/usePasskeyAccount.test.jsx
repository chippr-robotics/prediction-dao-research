/**
 * Spec 041 T049 — controllers state (US4) + controller screening (US6):
 * on-chain owner projection with local labels, single-controller risk flag,
 * counterfactual state, and the clarification-Q2 account flag when a wallet
 * controller is not clear (fail-closed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../../config/networks', () => ({
  getNetwork: vi.fn(() => ({
    chainId: 80002,
    rpcUrl: 'https://rpc.example',
    capabilities: { passkeyAccounts: true },
    passkey: { bundlerUrls: ['https://bundler.example'], erc20PaymasterUrl: null },
  })),
}))
vi.mock('../../config/contracts', () => ({
  getContractAddress: vi.fn(() => null),
  getContractAddressForChain: vi.fn((key) => ({
    accountFactory: '0xFAC7000000000000000000000000000000000001',
    entryPoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    sanctionsGuard: null,
  })[key]),
}))

// Mock the wallet context boundary directly: T049 targets the HOOK's
// projection/screening logic, not the provider plumbing (covered in
// WalletContext.passkey.test.jsx).
let walletState
vi.mock('../useWalletManagement', () => ({
  useWallet: () => walletState,
}))

import { usePasskeyAccount } from '../usePasskeyAccount'
import { rememberCredential } from '../../lib/passkey/credentials'

const ACCOUNT = '0x00000000000000000000000000000000000A11CE'
const X = '0x' + '1'.repeat(64)
const Y = '0x' + '2'.repeat(64)
const passkeyOwnerBytes = `0x${'1'.repeat(64)}${'2'.repeat(64)}`
const walletOwnerBytes = `0x${'0'.repeat(24)}${'c'.repeat(40)}`

function mockSession() {
  walletState = {
    address: ACCOUNT,
    chainId: 80002,
    isConnected: true,
    loginMethod: 'passkey',
    provider: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockSession()
})

describe('usePasskeyAccount', () => {
  it('projects on-chain controllers with local labels and this-device matching', async () => {
    rememberCredential({ credentialId: 'cred-1', address: ACCOUNT, publicKey: { x: X, y: Y }, label: 'Pixel' })
    const deps = {
      readControllers: vi.fn(async () => ({
        deployed: true,
        controllers: [
          { index: 0n, ownerBytes: passkeyOwnerBytes, kind: 'passkey', address: null },
          { index: 1n, ownerBytes: walletOwnerBytes, kind: 'wallet', address: '0x' + 'c'.repeat(40) },
        ],
      })),
      screenController: vi.fn(async () => ({ clear: true, available: true })),
    }
    const { result } = renderHook(() => usePasskeyAccount(deps))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.deployed).toBe(true)
    expect(result.current.controllerCount).toBe(2)
    expect(result.current.singleControllerRisk).toBe(false)
    const [pk, wallet] = result.current.controllers
    expect(pk.label).toBe('Pixel')
    expect(pk.isThisDevice).toBe(true)
    expect(pk.credentialId).toBe('cred-1')
    expect(wallet.kind).toBe('wallet')
    expect(result.current.accountFlagged).toBe(false)
  })

  it('flags single-controller risk for one-passkey accounts (FR-021 driver)', async () => {
    const deps = {
      readControllers: vi.fn(async () => ({
        deployed: true,
        controllers: [{ index: 0n, ownerBytes: passkeyOwnerBytes, kind: 'passkey', address: null }],
      })),
    }
    const { result } = renderHook(() => usePasskeyAccount(deps))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.singleControllerRisk).toBe(true)
  })

  it('treats a counterfactual account honestly: fundable, zero on-chain controllers yet (FR-007)', async () => {
    const deps = { readControllers: vi.fn(async () => ({ deployed: false, controllers: [] })) }
    const { result } = renderHook(() => usePasskeyAccount(deps))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.deployed).toBe(false)
    expect(result.current.controllers).toEqual([])
  })

  it('a not-clear wallet controller flags the ACCOUNT (clarification Q2, fail-closed)', async () => {
    const deps = {
      readControllers: vi.fn(async () => ({
        deployed: true,
        controllers: [
          { index: 0n, ownerBytes: passkeyOwnerBytes, kind: 'passkey', address: null },
          { index: 1n, ownerBytes: walletOwnerBytes, kind: 'wallet', address: '0x' + 'c'.repeat(40) },
        ],
      })),
      screenController: vi.fn(async () => ({ clear: false, available: true })),
    }
    const { result } = renderHook(() => usePasskeyAccount(deps))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.accountFlagged).toBe(true)
    expect(deps.screenController).toHaveBeenCalledTimes(1) // wallets only — passkeys have no address
  })

  it('is inert for classic-wallet sessions (zero passkey overhead, SC-004)', async () => {
    walletState = {
      address: '0x1234567890123456789012345678901234567890',
      chainId: 80002,
      isConnected: true,
      loginMethod: 'injected',
      provider: {},
    }
    const readControllers = vi.fn()
    const { result } = renderHook(() => usePasskeyAccount({ readControllers }))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isPasskeySession).toBe(false)
    expect(readControllers).not.toHaveBeenCalled()
  })
})
