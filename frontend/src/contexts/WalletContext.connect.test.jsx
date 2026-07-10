/**
 * Spec 045 — WalletContext unified connect behavior (US2/FR-001/FR-004):
 *  - no-arg connectWallet opens the shared modal instead of silently
 *    defaulting to the injected wallet (which made passkey unreachable);
 *  - connect attempts are serialized: a second attempt while one is pending
 *    is refused with visible feedback;
 *  - connector-specific options (credentialId/mode from the passkey account
 *    picker) are forwarded into the wagmi connect call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

import { useConnect, useAccount } from 'wagmi'
import { WalletProvider } from './WalletContext.jsx'
import { useWallet } from '../hooks/useWalletManagement'

function Probe() {
  const { connectWallet, isConnectModalOpen } = useWallet()
  return (
    <div>
      <span data-testid="modal-open">{String(isConnectModalOpen)}</span>
      <button onClick={() => connectWallet()}>connect-noarg</button>
      <button
        onClick={() =>
          connectWallet('fairwinsPasskey', { credentialId: 'c2', mode: 'sign-in' }).catch((e) => {
            document.getElementById('err').textContent = e.message
          })
        }
      >
        connect-passkey
      </button>
      <button
        onClick={() =>
          connectWallet('walletConnect').catch((e) => {
            document.getElementById('err').textContent = e.message
          })
        }
      >
        connect-wc
      </button>
      <span id="err" data-testid="err"></span>
    </div>
  )
}

const renderProbe = () =>
  render(
    <WalletProvider>
      <Probe />
    </WalletProvider>
  )

let connectAsync

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  connectAsync = vi.fn().mockResolvedValue({})
  // Disconnected visitor — otherwise the modal's close-on-connected effect
  // (correctly) closes it the moment it opens.
  useAccount.mockReturnValue({ address: undefined, isConnected: false, connector: undefined, status: 'disconnected' })
  useConnect.mockReturnValue({
    connect: vi.fn(),
    connectAsync,
    connectors: [
      { id: 'injected', name: 'MetaMask', type: 'injected' },
      { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' },
      { id: 'fairwinsPasskey', name: 'Passkey', type: 'passkey' },
    ],
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  console.error.mockRestore()
})

describe('WalletContext — unified connect surface (spec 045)', () => {
  it('no-arg connectWallet opens the shared modal (never a silent injected default)', async () => {
    renderProbe()
    expect(screen.getByTestId('modal-open')).toHaveTextContent('false')
    await act(async () => {
      screen.getByText('connect-noarg').click()
    })
    expect(screen.getByTestId('modal-open')).toHaveTextContent('true')
    expect(connectAsync).not.toHaveBeenCalled()
  })

  it('forwards passkey picker options into the wagmi connect call (US3 pinning)', async () => {
    renderProbe()
    await act(async () => {
      screen.getByText('connect-passkey').click()
    })
    await waitFor(() => expect(connectAsync).toHaveBeenCalledTimes(1))
    const arg = connectAsync.mock.calls[0][0]
    expect(arg.connector.id).toBe('fairwinsPasskey')
    expect(arg.credentialId).toBe('c2')
    expect(arg.mode).toBe('sign-in')
  })

  it('refuses a second attempt while one is in flight (FR-004 serialization)', async () => {
    let release
    connectAsync.mockImplementation(() => new Promise((resolve) => (release = resolve)))
    renderProbe()
    await act(async () => {
      screen.getByText('connect-wc').click()
    })
    await act(async () => {
      screen.getByText('connect-passkey').click()
    })
    await waitFor(() =>
      expect(screen.getByTestId('err')).toHaveTextContent(/already in progress/i)
    )
    expect(connectAsync).toHaveBeenCalledTimes(1)
    await act(async () => {
      release({})
    })
    // After the first settles, a new attempt is accepted again.
    await act(async () => {
      screen.getByText('connect-passkey').click()
    })
    await waitFor(() => expect(connectAsync).toHaveBeenCalledTimes(2))
  })
})
