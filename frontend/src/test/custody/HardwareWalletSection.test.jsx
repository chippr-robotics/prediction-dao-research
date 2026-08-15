// Spec 085 — Protect ▸ Off chain: the saved-accounts list. Removal needs an explicit confirm that
// says only the REFERENCE is forgotten (FR-008), and both directions audit + toast (FR-007).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const OWNER = '0x1111111111111111111111111111111111111111'
const HW = '0xAAA0000000000000000000000000000000000001'

let walletCtx = { address: OWNER, chainId: 137 }
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => walletCtx }))
vi.mock('../../hooks/useAddressBook', () => ({
  useAddressBook: () => ({ findByAddress: () => null, addContact: vi.fn(), updateContact: vi.fn() }),
}))
vi.mock('../../data/ledger/sources/hardwareWalletSource', () => ({
  captureHardwareAccountAdded: vi.fn(),
  captureHardwareAccountRemoved: vi.fn(),
}))

import { UIContext } from '../../contexts/UIContext'
import { hardwareWalletVault } from '../../lib/hardware/hardwareAccounts'
import { captureHardwareAccountRemoved } from '../../data/ledger/sources/hardwareWalletSource'
import HardwareWalletSection from '../../components/custody/HardwareWalletSection'

const showNotification = vi.fn()

const renderSection = () =>
  render(
    <UIContext.Provider value={{ showNotification }}>
      <HardwareWalletSection />
    </UIContext.Provider>,
  )

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  walletCtx = { address: OWNER, chainId: 137 }
})

describe('HardwareWalletSection', () => {
  it('gates honestly when no wallet is connected', () => {
    walletCtx = { address: null, chainId: null }
    renderSection()
    expect(screen.getByText(/connect your wallet to add hardware accounts/i)).toBeInTheDocument()
    expect(screen.queryByTestId('hw-add')).not.toBeInTheDocument()
  })

  it('shows the empty state and the add action', () => {
    renderSection()
    expect(screen.getByTestId('hw-add')).toBeInTheDocument()
    expect(screen.getByText(/no hardware accounts yet/i)).toBeInTheDocument()
  })

  it('lists saved accounts with vendor badge, label, address and path', () => {
    hardwareWalletVault(OWNER).add({ address: HW, vendor: 'trezor', path: "m/44'/60'/0'/0/0", label: 'Vacation fund' })
    renderSection()
    expect(screen.getByText('Trezor')).toBeInTheDocument()
    expect(screen.getByText('Vacation fund')).toBeInTheDocument()
    expect(screen.getByText(/m\/44'\/60'\/0'\/0\/0/)).toBeInTheDocument()
  })

  it('forgets an account only after confirmation, audits and toasts (FR-007/FR-008)', () => {
    hardwareWalletVault(OWNER).add({ address: HW, vendor: 'ledger', path: "m/44'/60'/0'/0/0", label: 'Cold' })
    renderSection()

    fireEvent.click(screen.getByRole('button', { name: /forget cold/i }))
    // The confirm states the funds stay with the device.
    expect(screen.getByText(/device keeps controlling the funds/i)).toBeInTheDocument()

    // Backing out keeps the entry.
    fireEvent.click(screen.getByRole('button', { name: /^keep$/i }))
    expect(hardwareWalletVault(OWNER).list()).toHaveLength(1)

    // Confirming removes it, audits it, toasts it.
    fireEvent.click(screen.getByRole('button', { name: /forget cold/i }))
    fireEvent.click(screen.getByRole('button', { name: /^forget$/i }))
    expect(hardwareWalletVault(OWNER).list()).toHaveLength(0)
    expect(captureHardwareAccountRemoved).toHaveBeenCalledWith(OWNER, 137, {
      address: HW,
      vendor: 'ledger',
      path: "m/44'/60'/0'/0/0",
    })
    expect(showNotification).toHaveBeenCalledWith(expect.stringMatching(/forgotten/i), 'info')
    expect(screen.getByText(/no hardware accounts yet/i)).toBeInTheDocument()
  })

  it('opens the add wizard from the section', () => {
    renderSection()
    fireEvent.click(screen.getByTestId('hw-add'))
    expect(screen.getByRole('dialog', { name: /add a hardware wallet/i })).toBeInTheDocument()
  })
})
