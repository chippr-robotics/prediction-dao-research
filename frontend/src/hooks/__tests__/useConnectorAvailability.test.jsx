/**
 * Spec 045 T008 — shared connector availability probe (FR-003): injected
 * detection, walletConnect always-on, passkey gated on device capability AND
 * network config. Every connect surface consumes THIS hook so availability
 * states can never diverge between entry points again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

import { useConnect, useChainId } from 'wagmi'

const { detectCapability, getNetwork } = vi.hoisted(() => ({
  detectCapability: vi.fn(),
  getNetwork: vi.fn(),
}))
vi.mock('../../lib/passkey/credentials', () => ({ detectCapability }))
vi.mock('../../config/networks', () => ({ getNetwork }))

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
  getNetwork.mockReturnValue({ capabilities: { passkeyAccounts: true } })
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
    getNetwork.mockReturnValue({ capabilities: { passkeyAccounts: false } })
    const { result } = renderHook(() => useConnectorAvailability())
    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isAvailable(CONNECTORS[2])).toBe(false)
    expect(result.current.unavailableReason(CONNECTORS[2])).toMatch(/network/i)
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
