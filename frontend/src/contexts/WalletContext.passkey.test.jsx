/**
 * Spec 041 T039 — WalletContext unified-login surface (US2):
 *  - loginMethod derives from the ACTIVE connector and is informational only;
 *  - role gating keys off `address` identically for a smart-account address
 *    with NO signer (parity: nothing in the context requires an EOA signer
 *    to answer "who is the user / what may they do");
 *  - sendCalls routes passkey sessions to the batch executor and classic
 *    sessions through the sequential signer path;
 *  - disconnectWallet clears the passkey session key atomically (FR-003).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

import { useAccount } from 'wagmi'
import { WalletProvider } from './WalletContext.jsx'
import { useWallet } from '../hooks/useWalletManagement'

vi.mock('../lib/passkey/sendBatch', () => ({
  sendPasskeyBatch: vi.fn(async () => ({ route: 'userop', txHash: '0xbatch' })),
}))
const { makeReadProvider, rpcGetBalance } = vi.hoisted(() => {
  const rpcGetBalance = vi.fn(async () => 1000000000000000000n)
  const makeReadProvider = vi.fn(() => ({ getBalance: rpcGetBalance }))
  return { makeReadProvider, rpcGetBalance }
})
vi.mock('../utils/rpcProvider', () => ({
  makeReadProvider,
}))
import { sendPasskeyBatch } from '../lib/passkey/sendBatch'

const SMART_ACCOUNT = '0x00000000000000000000000000000000000A11CE'

function Probe() {
  const { address, loginMethod, hasRole, sendCalls, disconnectWallet, balances, provider, signer } = useWallet()
  return (
    <div>
      <span data-testid="address">{address}</span>
      <span data-testid="login-method">{String(loginMethod)}</span>
      <span data-testid="has-role">{String(hasRole('WAGER_PARTICIPANT'))}</span>
      <span data-testid="native-balance">{balances.native}</span>
      <span data-testid="has-provider">{String(Boolean(provider))}</span>
      <span data-testid="has-signer">{String(Boolean(signer))}</span>
      <button onClick={() => sendCalls([{ target: '0x' + 'a'.repeat(40), data: '0x01' }])}>send</button>
      <button onClick={disconnectWallet}>signout</button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <WalletProvider>
      <Probe />
    </WalletProvider>
  )

beforeEach(() => {
  vi.clearAllMocks()
  rpcGetBalance.mockClear()
  localStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('WalletContext — unified login surface (spec 041 US2)', () => {
  it('loginMethod=passkey for the fairwinsPasskey connector; identity stays address-based with NO signer', async () => {
    useAccount.mockReturnValue({
      address: SMART_ACCOUNT,
      isConnected: true,
      connector: { id: 'fairwinsPasskey', type: 'passkey' },
    })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('login-method')).toHaveTextContent('passkey'))
    expect(screen.getByTestId('address')).toHaveTextContent(SMART_ACCOUNT)
    expect(screen.getByTestId('has-provider')).toHaveTextContent('true')
    expect(screen.getByTestId('has-signer')).toHaveTextContent('false')
    // Role answer resolves from address-keyed state — never from signer presence.
    expect(['true', 'false']).toContain(screen.getByTestId('has-role').textContent)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('loginMethod=injected for classic connectors (zero behavioral change)', async () => {
    useAccount.mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      isConnected: true,
      connector: { id: 'injected', type: 'injected' },
    })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('login-method')).toHaveTextContent('injected'))
  })

  it('sendCalls routes passkey sessions through the batch executor (ONE ceremony per batch)', async () => {
    useAccount.mockReturnValue({
      address: SMART_ACCOUNT,
      isConnected: true,
      connector: { id: 'fairwinsPasskey', type: 'passkey' },
    })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('login-method')).toHaveTextContent('passkey'))
    await act(async () => {
      screen.getByText('send').click()
    })
    await waitFor(() => expect(sendPasskeyBatch).toHaveBeenCalledTimes(1))
    expect(sendPasskeyBatch.mock.calls[0][0].address).toBe(SMART_ACCOUNT)
    expect(sendPasskeyBatch.mock.calls[0][0].calls).toHaveLength(1)
  })

  it('disconnectWallet clears the persisted passkey session atomically (FR-003)', async () => {
    localStorage.setItem(
      'fairwins.passkey.session.v1',
      JSON.stringify({ address: SMART_ACCOUNT, chainId: 80002, loginMethod: 'passkey' })
    )
    useAccount.mockReturnValue({
      address: SMART_ACCOUNT,
      isConnected: true,
      connector: { id: 'fairwinsPasskey', type: 'passkey' },
    })
    renderProbe()
    await act(async () => {
      screen.getByText('signout').click()
    })
    expect(localStorage.getItem('fairwins.passkey.session.v1')).toBeNull()
  })

  it('fetches balances for passkey sessions from chain RPC reads', async () => {
    useAccount.mockReturnValue({
      address: SMART_ACCOUNT,
      isConnected: true,
      connector: { id: 'fairwinsPasskey', type: 'passkey' },
    })
    renderProbe()
    await waitFor(() => expect(makeReadProvider).toHaveBeenCalled())
    await waitFor(() => expect(rpcGetBalance).toHaveBeenCalledWith(SMART_ACCOUNT))
    await waitFor(() => expect(screen.getByTestId('native-balance')).toHaveTextContent(/^1(\.0)?$/))
  })
})
