/**
 * Spec 041 T034 — onboarding flow: intro → ceremony → funded view with the
 * counterfactual address + QR reuse; cancel mid-ceremony returns to intro
 * (clean abort); device-loss warning shown at creation (FR-021 moment #1);
 * no seed-phrase language anywhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const ACCOUNT = '0x00000000000000000000000000000000000A11CE'

const mockConnect = vi.fn()
let mockConnected = { isConnected: false, address: null }

vi.mock('wagmi', () => ({
  useConnect: () => ({
    connect: mockConnect,
    connectors: [{ id: 'fairwinsPasskey', name: 'Passkey', type: 'passkey' }],
  }),
  useChainId: () => 80002,
  createConnector: (fn) => fn,
}))
vi.mock('../../../hooks/useWalletManagement', () => ({
  useWallet: () => mockConnected,
}))
vi.mock('../../ui/AddressQRModal', () => ({
  default: ({ isOpen, address }) => (isOpen ? <div data-testid="qr-modal">{address}</div> : null),
}))

import PasskeyOnboarding from '../PasskeyOnboarding'
import { CeremonyCancelled } from '../../../lib/passkey/credentials'

beforeEach(() => {
  vi.clearAllMocks()
  mockConnected = { isConnected: false, address: null }
})

describe('PasskeyOnboarding', () => {
  it('intro shows the passkey pitch + device-loss warning, and NEVER a seed phrase', () => {
    render(<PasskeyOnboarding />)
    expect(screen.getByText(/continue with passkey/i)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/second passkey or link a wallet/i)
    // The flow never ASKS for a seed phrase: no inputs, no backup/recovery-phrase steps.
    // (The intro copy mentions "no seed phrase" as a negation — that's the point.)
    expect(document.querySelectorAll('input, textarea')).toHaveLength(0)
    expect(screen.queryByText(/backup phrase|recovery phrase/i)).toBeNull()
  })

  it('success: ceremony → funded view with the account address and QR access (FR-005/FR-007)', async () => {
    mockConnect.mockImplementation((_args, { onSuccess }) => {
      mockConnected = { isConnected: true, address: ACCOUNT }
      onSuccess()
    })
    render(<PasskeyOnboarding />)
    fireEvent.click(screen.getByText(/continue with passkey/i))
    await waitFor(() => expect(screen.getByTestId('passkey-account-address')).toHaveTextContent(ACCOUNT))
    expect(screen.getByText(/activates on-chain automatically/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/show qr code/i))
    expect(screen.getByTestId('qr-modal')).toHaveTextContent(ACCOUNT)
  })

  it('cancelled ceremony returns to the intro — clean abort, fully re-attemptable', async () => {
    mockConnect.mockImplementation((_args, { onError }) => onError(new CeremonyCancelled()))
    render(<PasskeyOnboarding />)
    fireEvent.click(screen.getByText(/continue with passkey/i))
    await waitFor(() => expect(screen.getByText(/continue with passkey/i)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull() // a cancel is not an error
  })

  it('a real failure shows an honest error state with a way back', async () => {
    mockConnect.mockImplementation((_args, { onError }) => onError(new Error('boom')))
    render(<PasskeyOnboarding />)
    fireEvent.click(screen.getByText(/continue with passkey/i))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nothing was created/i))
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByText(/continue with passkey/i)).toBeInTheDocument()
  })
})
