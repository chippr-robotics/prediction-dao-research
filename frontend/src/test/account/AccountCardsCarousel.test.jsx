/**
 * AccountCardsCarousel (spec 074 US1) — contract C1–C6:
 * cards from the shared switcher seam, selection via choose(), legacy unlock
 * gating, active marker, and the >1-account-only arrows/dots.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const chooseMock = vi.fn()
const setUnlockEntryMock = vi.fn()
const onUnlockedMock = vi.fn()

const PERSONAL = {
  id: 'personal', kind: 'personal',
  address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', label: 'Personal wallet',
}
const VAULT = {
  id: 'vault:0x8cc5000000000000000000000000000000000000', kind: 'vault',
  address: '0x8cc5000000000000000000000000000000000000', chainId: 137, label: 'Team vault',
}
const LEGACY_ENTRY = { address: '0x0e35000000000000000000000000000000000c0B', kind: 'privateKey' }
const LEGACY = {
  id: 'legacy:0x0e35000000000000000000000000000000000c0b', kind: 'legacy',
  address: '0x0e35000000000000000000000000000000000c0B', label: '0x0e35…0c0B', entry: LEGACY_ENTRY,
}

let switcherState

vi.mock('../../hooks/useAccountSwitcher', () => {
  const useAccountSwitcher = () => switcherState
  return {
    useAccountSwitcher,
    default: useAccountSwitcher,
    ACCOUNT_KIND_TAG: { vault: 'Multisig', legacy: 'Recovered' },
    shortAccountAddr: (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''),
  }
})
vi.mock('../../components/ui/BlockiesAvatar', () => ({ default: () => <div data-testid="avatar" /> }))
vi.mock('../../components/account/LegacyUnlockDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="unlock-dialog" /> : null),
}))

const { default: AccountCardsCarousel } = await import('../../components/account/AccountCardsCarousel')

beforeEach(() => {
  vi.clearAllMocks()
  switcherState = {
    accounts: [PERSONAL, VAULT, LEGACY],
    currentId: 'personal',
    choose: chooseMock,
    unlockEntry: null,
    setUnlockEntry: setUnlockEntryMock,
    onUnlocked: onUnlockedMock,
    hasChoices: true,
  }
})

describe('AccountCardsCarousel (spec 074 US1)', () => {
  it('renders one card per account with label, kind tag, and short address (C1, C2)', () => {
    render(<AccountCardsCarousel />)
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(3)
    expect(screen.getByText('Personal wallet')).toBeInTheDocument()
    expect(screen.getByText('Team vault')).toBeInTheDocument()
    expect(screen.getByText('Multisig')).toBeInTheDocument()
    expect(screen.getByText('Recovered')).toBeInTheDocument()
    // Personal card's shortened address
    expect(screen.getAllByText('0x5aAe…eAed').length).toBeGreaterThan(0)
  })

  it('names the vault card network from the strict NETWORKS lookup (C2)', () => {
    render(<AccountCardsCarousel />)
    expect(screen.getByText('Polygon')).toBeInTheDocument()
  })

  it('falls back to "Chain <id>" for a vault on an unknown chain (C2)', () => {
    switcherState.accounts = [PERSONAL, { ...VAULT, chainId: 424242 }]
    render(<AccountCardsCarousel />)
    expect(screen.getByText('Chain 424242')).toBeInTheDocument()
  })

  it('marks the active account card via aria-selected (C1, C6)', () => {
    switcherState.currentId = VAULT.id
    render(<AccountCardsCarousel />)
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('selecting a non-active card calls choose exactly once (C3)', () => {
    render(<AccountCardsCarousel />)
    fireEvent.click(screen.getByText('Team vault'))
    expect(chooseMock).toHaveBeenCalledTimes(1)
    expect(chooseMock).toHaveBeenCalledWith(VAULT)
  })

  it('selecting the already-active card does not call choose (C3)', () => {
    render(<AccountCardsCarousel />)
    fireEvent.click(screen.getByText('Personal wallet'))
    expect(chooseMock).not.toHaveBeenCalled()
  })

  it('selecting a recovered card routes through choose (unlock gate lives in the seam) (C4)', () => {
    render(<AccountCardsCarousel />)
    // The short address renders as both the card label and address line —
    // either click lands on the same card button.
    fireEvent.click(screen.getAllByText('0x0e35…0c0B')[0])
    expect(chooseMock).toHaveBeenCalledWith(LEGACY)
  })

  it('mounts the unlock dialog when the seam has an unlockEntry (C4)', () => {
    switcherState.unlockEntry = LEGACY_ENTRY
    render(<AccountCardsCarousel />)
    expect(screen.getByTestId('unlock-dialog')).toBeInTheDocument()
  })

  it('shows arrows and one dot per account when there is more than one (C5)', () => {
    render(<AccountCardsCarousel />)
    expect(screen.getByRole('button', { name: 'Previous account' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next account' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Go to / }).length).toBe(3)
  })

  it('hides arrows and dots with a single account (C5)', () => {
    switcherState.accounts = [PERSONAL]
    render(<AccountCardsCarousel />)
    expect(screen.queryByRole('button', { name: 'Previous account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Go to / })).not.toBeInTheDocument()
  })

  it('shows the quick-access total on the ACTIVE card only (post-launch feedback)', () => {
    render(<AccountCardsCarousel activeTotalUsd={1234.5} />)
    expect(screen.getAllByText(/total balance/i)).toHaveLength(1)
    expect(screen.getByText('$1,234.50')).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Total balance')
    expect(options[1]).not.toHaveTextContent('Total balance')
  })

  it('renders no balance line without a total (loading / unavailable)', () => {
    render(<AccountCardsCarousel />)
    expect(screen.queryByText(/total balance/i)).not.toBeInTheDocument()
  })

  // Spec 086 — a hardware account is just another card, tagged Hardware like any other kind.
  it('tags a hardware account Hardware (spec 086 US3)', () => {
    switcherState.accounts = [
      PERSONAL,
      { id: 'hardware:0xaaa', kind: 'hardware', address: '0xAaAa000000000000000000000000000000000001', label: 'Cold storage' },
    ]
    render(<AccountCardsCarousel />)
    expect(screen.getByText('Hardware')).toBeInTheDocument()
  })

  // Spec 086 — the "⋯" on the centered card opens the Customize sheet for THAT card.
  it('opens the Customize sheet from the card ellipsis for the centered account (spec 086 US2)', () => {
    render(<AccountCardsCarousel />)
    const menu = screen.getByTestId('account-customize-open')
    // The control names the card it edits — the centered (first) one here.
    expect(menu).toHaveAccessibleName(/customize personal wallet card/i)
    fireEvent.click(menu)
    expect(screen.getByTestId('account-customize')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /customize card/i })).toBeInTheDocument()
    expect(screen.getByText('Personal wallet', { selector: '.acs-preview__label' })).toBeInTheDocument()
  })

  // The ellipsis lives OUTSIDE the listbox: an option may contain no interactive children.
  it('keeps the customize control out of the listbox options', () => {
    render(<AccountCardsCarousel />)
    const listbox = screen.getByRole('listbox')
    expect(listbox.contains(screen.getByTestId('account-customize-open'))).toBe(false)
    for (const option of screen.getAllByRole('option')) {
      expect(option.querySelector('button')).toBeNull()
    }
  })
})
