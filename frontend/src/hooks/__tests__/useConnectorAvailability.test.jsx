/**
 * Spec 045 T008 — shared connector availability probe (FR-003): injected
 * detection, walletConnect always-on, passkey gated on device capability AND
 * network config. Every connect surface consumes THIS hook so availability
 * states can never diverge between entry points again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

import { useConnect, useChainId } from 'wagmi'

const { detectCapability, getPasskeySupport } = vi.hoisted(() => ({
  detectCapability: vi.fn(),
  getPasskeySupport: vi.fn(),
}))
vi.mock('../../lib/passkey/credentials', () => ({ detectCapability }))
// The hook gates on the JOINED support check (bundler configured AND account stack deployed),
// not on `capabilities.passkeyAccounts` alone — a bundler URL with no factory would render a
// login button that fails at account creation (spec 041 FR-004).
vi.mock('../../config/passkeySupport', () => ({ getPasskeySupport }))

import { useConnectorAvailability } from '../useConnectorAvailability'

const CONNECTORS = [
  { id: 'injected', name: 'Injected', type: 'injected' },
  { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' },
  { id: 'fairwinsPasskey', name: 'Passkey', type: 'passkey' },
]

beforeEach(() => {
  vi.clearAllMocks()
  useConnect.mockReturnValue({ connect: vi.fn(), connectors: CONNECTORS })
  useChainId.mockReturnValue(137)
  detectCapability.mockResolvedValue({ available: true, platformAuthenticator: true })
  getPasskeySupport.mockReturnValue({ supported: true, reason: null })
})

describe('useConnectorAvailability', () => {
  it('marks walletConnect always available and passkey available when device + network allow', async () => {
    const { result } = renderHook(() => useConnectorAvailability())
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isAvailable(CONNECTORS[1])).toBe(true)
    expect(result.current.isAvailable(CONNECTORS[2])).toBe(true)
  })

  it('reports an honest reason when the device cannot do passkeys (FR-003)', async () => {
    detectCapability.mockResolvedValue({ available: false, reason: 'This browser does not support passkeys.' })
    const { result } = renderHook(() => useConnectorAvailability())
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isAvailable(CONNECTORS[2])).toBe(false)
    expect(result.current.unavailableReason(CONNECTORS[2])).toMatch(/does not support/i)
  })

  it('gates passkey on the active network even when the device is capable', async () => {
    getPasskeySupport.mockReturnValue({ supported: false, reason: 'Not available on this network' })
    const { result } = renderHook(() => useConnectorAvailability())
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isAvailable(CONNECTORS[2])).toBe(false)
    expect(result.current.unavailableReason(CONNECTORS[2])).toMatch(/network/i)
  })

  it('surfaces WHICH half of passkey support is missing, not a blanket refusal', async () => {
    // A network mid-rollout — bundler wired, factory not deployed yet. The member should read
    // the actual state of the rollout rather than "not available on this network", which would
    // be indistinguishable from a network we never intend to support.
    getPasskeySupport.mockReturnValue({
      supported: false,
      reason: 'Passkey accounts are not deployed on this network yet',
      bundlerConfigured: true,
      stackDeployed: false,
    })
    const { result } = renderHook(() => useConnectorAvailability())
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isAvailable(CONNECTORS[2])).toBe(false)
    expect(result.current.unavailableReason(CONNECTORS[2])).toMatch(/not deployed on this network/i)
  })

  it('does not re-probe when the connectors array identity changes but content does not', async () => {
    const { result, rerender } = renderHook(() => useConnectorAvailability())
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    const calls = detectCapability.mock.calls.length
    useConnect.mockReturnValue({ connect: vi.fn(), connectors: [...CONNECTORS] }) // fresh array
    rerender()
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(detectCapability.mock.calls.length).toBe(calls)
  })
})
