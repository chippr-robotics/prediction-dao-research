/**
 * Global acting-account switcher (spec 062 follow-up): lists personal + vaults +
 * recovered legacy accounts, writes the shared active identity, and unlocks a
 * legacy account (via the dialog) before acting as it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const active = vi.hoisted(() => ({
  identity: { mode: 'personal' },
  operateAsPersonal: vi.fn(),
  operateAsVault: vi.fn(),
  operateAsLegacy: vi.fn(),
}))
const vaultsMock = vi.hoisted(() => ({ vaults: [] }))
const legacyMock = vi.hoisted(() => ({ list: [] }))
const FAKE_SIGNER = { id: 'legacy-signer' }

vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => ({ address: '0x' + 'a'.repeat(40), chainId: 137, provider: {} }) }))
vi.mock('../../hooks/useActiveAccount', () => ({ useActiveAccount: () => active }))
vi.mock('../../hooks/useCustodyVaults', () => ({ useCustodyVaults: () => vaultsMock }))
vi.mock('../../hooks/useLegacyAccounts', () => ({ useLegacyAccounts: () => legacyMock.list }))
vi.mock('../../components/ui/BlockiesAvatar', () => ({ default: () => <span data-testid="avatar" /> }))
// Stub the unlock dialog: when open, one click "unlocks" and returns a signer.
vi.mock('../../components/account/LegacyUnlockDialog', () => ({
  default: ({ open, onUnlocked }) => (open ? <button onClick={() => onUnlocked(FAKE_SIGNER)}>do-unlock</button> : null),
}))

import AccountSwitcher from '../../components/account/AccountSwitcher'

const VAULT = { address: '0x' + 'b'.repeat(40), chainId: 137, label: 'Coop' }
const LEGACY = { id: `legacy:0x${'c'.repeat(40)}`, kind: 'legacy', address: '0x' + 'C'.repeat(40), label: 'old', protection: 'passphrase', entry: { address: '0x' + 'C'.repeat(40), kind: 'privateKey', protection: 'passphrase' } }

beforeEach(() => {
  vi.clearAllMocks()
  active.identity = { mode: 'personal' }
  vaultsMock.vaults = []
  legacyMock.list = []
})

describe('AccountSwitcher', () => {
  it('hides when only the personal wallet is available', () => {
    const { container } = render(<AccountSwitcher />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists personal + vault + legacy and switches to personal/vault directly', () => {
    vaultsMock.vaults = [VAULT]
    legacyMock.list = [LEGACY]
    render(<AccountSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /change acting account/i }))
    const menu = screen.getByRole('listbox')
    expect(within(menu).getByText('Coop')).toBeInTheDocument()
    expect(within(menu).getByText('Recovered')).toBeInTheDocument() // legacy tag

    fireEvent.click(within(menu).getByText('Coop'))
    expect(active.operateAsVault).toHaveBeenCalledWith(expect.objectContaining({ address: VAULT.address }))
  })

  it('unlocks a legacy account then acts as it with the returned signer', () => {
    legacyMock.list = [LEGACY]
    render(<AccountSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /change acting account/i }))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('old'))
    // Dialog opened → simulate a successful unlock.
    fireEvent.click(screen.getByText('do-unlock'))
    expect(active.operateAsLegacy).toHaveBeenCalledWith(
      expect.objectContaining({ address: LEGACY.address, chainId: 137, signer: FAKE_SIGNER })
    )
    expect(active.operateAsPersonal).not.toHaveBeenCalled()
  })
})
