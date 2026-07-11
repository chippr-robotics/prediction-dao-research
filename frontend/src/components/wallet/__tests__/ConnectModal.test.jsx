/**
 * Spec 045 — the single connect surface (US2/US3/US4):
 *  - ordering + featured badges (Passkey, WalletConnect over Browser Wallet);
 *  - honest availability states;
 *  - first-time passkey explainer, shown at most once (FR-010);
 *  - in-app account picker when several passkeys are known (FR-007), with the
 *    chosen credential pinned into the connect call;
 *  - errors surface in the dialog; ceremony cancellation resets silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockWallet = {
  isConnectModalOpen: true,
  closeConnectModal: vi.fn(),
  connectWallet: vi.fn().mockResolvedValue(true),
  isConnected: false,
  connectors: [],
}
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => mockWallet,
}))

const mockAvailability = {
  isChecking: false,
  isAvailable: vi.fn(() => true),
  unavailableReason: vi.fn(() => undefined),
  status: {},
}
vi.mock('../../../hooks/useConnectorAvailability', () => ({
  useConnectorAvailability: () => mockAvailability,
}))

import ConnectModal from '../ConnectModal'
import { rememberCredential } from '../../../lib/passkey/credentials'
import { markExplainerSeen, hasSeenExplainer } from '../../../lib/passkey/explainer'

const CONNECTORS = [
  { id: 'injected', name: 'MetaMask', type: 'injected' },
  { id: 'walletConnect', name: 'WalletConnect', type: 'walletConnect' },
  { id: 'fairwinsPasskey', name: 'Passkey', type: 'passkey' },
]

const PK = (n) => ({ x: `0x${String(n).repeat(64)}`, y: `0x${String(n).repeat(64)}` })

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockWallet.isConnectModalOpen = true
  mockWallet.isConnected = false
  mockWallet.connectors = CONNECTORS
  mockWallet.connectWallet = vi.fn().mockResolvedValue(true)
  mockAvailability.isChecking = false
  mockAvailability.isAvailable = vi.fn(() => true)
  mockAvailability.unavailableReason = vi.fn(() => undefined)
})

describe('ConnectModal — single surface ordering (US2)', () => {
  it('features Passkey (Recommended) and WalletConnect ahead of Browser Wallet', () => {
    render(<ConnectModal />)
    const options = screen.getByTestId('connect-options').querySelectorAll('.connect-modal__option')
    const names = [...options].map((b) => b.querySelector('.connect-modal__option-name').textContent)
    // The injected row resolves through getWalletLabel (vendor detection —
    // 'MetaMask' here from the test connector name); what matters is that it
    // sorts LAST, under "More options".
    expect(names).toEqual(['Passkey', 'WalletConnect', 'MetaMask'])
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    expect(screen.getByText('More options')).toBeInTheDocument()
  })

  it('shows honest unavailability instead of failing on tap (FR-003)', () => {
    mockAvailability.isAvailable = vi.fn((c) => c.type !== 'injected')
    mockAvailability.unavailableReason = vi.fn((c) =>
      c.type === 'injected' ? 'No browser wallet detected' : undefined
    )
    render(<ConnectModal />)
    expect(screen.getByText('No browser wallet detected')).toBeInTheDocument()
    const row = screen.getByText('MetaMask').closest('button')
    expect(row).toBeDisabled()
  })

  it('traps Tab focus inside the dialog (aria-modal keyboard navigation)', async () => {
    const user = userEvent.setup()
    render(<ConnectModal />)
    const dialog = screen.getByRole('dialog')
    const focusables = dialog.querySelectorAll('button:not([disabled]), [href]')
    const last = focusables[focusables.length - 1]
    last.focus()
    await user.tab() // Tab from the last element wraps to the first
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(focusables[0])
    await user.tab({ shift: true }) // Shift+Tab from the first wraps to the last
    expect(document.activeElement).toBe(last)
  })

  it('renders nothing when closed and closes itself once connected', async () => {
    mockWallet.isConnectModalOpen = false
    const { rerender, container } = render(<ConnectModal />)
    expect(container.firstChild).toBeNull()

    mockWallet.isConnectModalOpen = true
    mockWallet.isConnected = true
    rerender(<ConnectModal />)
    await waitFor(() => expect(mockWallet.closeConnectModal).toHaveBeenCalled())
  })

  it('connects classic wallets directly through the serialized context path', async () => {
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('WalletConnect').closest('button'))
    expect(mockWallet.connectWallet).toHaveBeenCalledWith('walletConnect', undefined)
  })

  it('surfaces connect errors in the dialog (alert), not the console alone', async () => {
    mockWallet.connectWallet = vi.fn().mockRejectedValue(new Error('Please approve the connection request'))
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('WalletConnect').closest('button'))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Please approve the connection request')
    )
  })
})

describe('ConnectModal — first-time passkey explainer (US4)', () => {
  it('shows the explainer once, then proceeds to the ceremony on continue', async () => {
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))
    expect(screen.getByText(/What's a passkey\?/)).toBeInTheDocument()
    expect(mockWallet.connectWallet).not.toHaveBeenCalled()

    await user.click(screen.getByText('Continue with passkey'))
    expect(hasSeenExplainer()).toBe(true)
    expect(mockWallet.connectWallet).toHaveBeenCalledWith('fairwinsPasskey', undefined)
  })

  it('never re-shows after it was seen (FR-010)', async () => {
    markExplainerSeen()
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))
    expect(screen.queryByText(/What's a passkey\?/)).not.toBeInTheDocument()
    expect(mockWallet.connectWallet).toHaveBeenCalled()
  })

  it('dismissing counts as seen and returns to the methods list', async () => {
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))
    await user.click(screen.getByText('Back'))
    expect(hasSeenExplainer()).toBe(true)
    expect(screen.getByTestId('connect-options')).toBeInTheDocument()
    expect(mockWallet.connectWallet).not.toHaveBeenCalled()
  })
})

describe('ConnectModal — multi-passkey account picker (US3)', () => {
  beforeEach(() => {
    markExplainerSeen()
  })

  it('offers the chooser for a single known passkey — never silently pins index 0 (issue #849)', async () => {
    rememberCredential({ credentialId: 'c-only', publicKey: PK(1), address: '0x' + 'a'.repeat(40), label: 'Phone' })
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))

    // A member with one recorded passkey is still presented with a choice
    // (acceptance #1) rather than being locked to the first credential.
    expect(screen.getByTestId('passkey-picker')).toBeInTheDocument()
    expect(mockWallet.connectWallet).not.toHaveBeenCalled()
    expect(screen.getByText('Use a different passkey…')).toBeInTheDocument()
    expect(screen.getByText('Create a new account')).toBeInTheDocument()

    await user.click(screen.getByText('Phone').closest('button'))
    expect(mockWallet.connectWallet).toHaveBeenCalledWith('fairwinsPasskey', {
      credentialId: 'c-only',
      mode: 'sign-in',
    })
  })

  it('offers an explicit account choice when several passkeys are known — the app never guesses', async () => {
    rememberCredential({ credentialId: 'c1', publicKey: PK(1), address: '0x' + 'a'.repeat(40), label: 'Phone' })
    rememberCredential({ credentialId: 'c2', publicKey: PK(2), address: '0x' + 'b'.repeat(40), label: 'Laptop' })
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))

    expect(screen.getByTestId('passkey-picker')).toBeInTheDocument()
    expect(mockWallet.connectWallet).not.toHaveBeenCalled()

    await user.click(screen.getByText('Laptop').closest('button'))
    expect(mockWallet.connectWallet).toHaveBeenCalledWith('fairwinsPasskey', {
      credentialId: 'c2',
      mode: 'sign-in',
    })
  })

  it('excludes records that cannot transact from the picker (they cannot sign anyway)', async () => {
    rememberCredential({ credentialId: 'c1', publicKey: PK(1), address: '0x' + 'a'.repeat(40), label: 'Phone' })
    rememberCredential({ credentialId: 'c-broken', address: '0x' + 'b'.repeat(40), label: 'Broken' }) // no key
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))
    // The picker lists only the usable record; the broken one never appears.
    expect(screen.getByTestId('passkey-picker')).toBeInTheDocument()
    expect(screen.getByText('Phone')).toBeInTheDocument()
    expect(screen.queryByText('Broken')).not.toBeInTheDocument()

    await user.click(screen.getByText('Phone').closest('button'))
    expect(mockWallet.connectWallet).toHaveBeenCalledWith('fairwinsPasskey', {
      credentialId: 'c1',
      mode: 'sign-in',
    })
  })

  it('supports "use a different passkey" (unpinned) and "create new account" escapes', async () => {
    rememberCredential({ credentialId: 'c1', publicKey: PK(1), address: '0x' + 'a'.repeat(40), label: 'Phone' })
    rememberCredential({ credentialId: 'c2', publicKey: PK(2), address: '0x' + 'b'.repeat(40), label: 'Laptop' })
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))

    await user.click(screen.getByText('Use a different passkey…'))
    // Discoverable request (no allowCredentials) so passkeys this browser has
    // never recorded — but that live on the device — are reachable (issue #849).
    expect(mockWallet.connectWallet).toHaveBeenLastCalledWith('fairwinsPasskey', {
      mode: 'sign-in',
      discoverable: true,
    })

    await user.click(screen.getByText('Create a new account'))
    expect(mockWallet.connectWallet).toHaveBeenLastCalledWith('fairwinsPasskey', { mode: 'sign-up' })
  })

  it('lets the user remove a stale entry from this browser', async () => {
    rememberCredential({ credentialId: 'c1', publicKey: PK(1), address: '0x' + 'a'.repeat(40), label: 'Phone' })
    rememberCredential({ credentialId: 'c2', publicKey: PK(2), address: '0x' + 'b'.repeat(40), label: 'Stale' })
    const user = userEvent.setup()
    render(<ConnectModal />)
    await user.click(screen.getByText('Passkey').closest('button'))
    await user.click(screen.getByLabelText(/Remove Stale/))
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    const stored = JSON.parse(localStorage.getItem('fairwins.passkey.credentials.v1'))
    expect(stored.map((c) => c.credentialId)).toEqual(['c1'])
  })
})
