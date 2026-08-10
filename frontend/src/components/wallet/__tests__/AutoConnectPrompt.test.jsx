/**
 * AutoConnectPrompt — entering the app with no account opens the unlock dialog
 * by itself, without racing the eager reconnect or the eligibility gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

const mockWallet = {
  isConnected: false,
  connectionStatus: 'disconnected',
  isConnectModalOpen: false,
  openConnectModal: vi.fn(),
}
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet,
}))

import AutoConnectPrompt from '../AutoConnectPrompt'
import { writeAck, ENTRY_GATE_ACK_KEY } from '../../../utils/entryGateAck'

const acknowledge = () => localStorage.setItem(ENTRY_GATE_ACK_KEY, JSON.stringify({ at: 'earlier' }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockWallet.isConnected = false
  mockWallet.connectionStatus = 'disconnected'
  mockWallet.isConnectModalOpen = false
  mockWallet.openConnectModal = vi.fn()
})

describe('AutoConnectPrompt', () => {
  it('prompts to unlock when the app is entered with no account', () => {
    acknowledge()
    render(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).toHaveBeenCalledTimes(1)
  })

  it('waits for the eager reconnect to settle — a restoring session is never interrupted', () => {
    acknowledge()
    mockWallet.connectionStatus = 'reconnecting'
    const { rerender } = render(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).not.toHaveBeenCalled()

    // The stored session restores: still no prompt, the member is already in.
    mockWallet.connectionStatus = 'connected'
    mockWallet.isConnected = true
    rerender(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).not.toHaveBeenCalled()
  })

  it('never re-prompts after a deliberate sign-out', () => {
    acknowledge()
    mockWallet.isConnected = true
    mockWallet.connectionStatus = 'connected'
    const { rerender } = render(<AutoConnectPrompt />)

    mockWallet.isConnected = false
    mockWallet.connectionStatus = 'disconnected'
    rerender(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).not.toHaveBeenCalled()
  })

  it('prompts only once, so dismissing the dialog is respected', () => {
    acknowledge()
    const { rerender } = render(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).toHaveBeenCalledTimes(1)

    mockWallet.isConnectModalOpen = true
    rerender(<AutoConnectPrompt />)
    mockWallet.isConnectModalOpen = false // dismissed
    rerender(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).toHaveBeenCalledTimes(1)
  })

  it('never stacks on the eligibility gate — it waits for the acknowledgement', async () => {
    render(<AutoConnectPrompt />)
    expect(mockWallet.openConnectModal).not.toHaveBeenCalled()

    // Entering the gate prompts in the same visit, without a reload.
    act(() => writeAck({ terms: 'x', risk: 'y', at: 'now' }))
    await waitFor(() => expect(mockWallet.openConnectModal).toHaveBeenCalledTimes(1))
  })
})
