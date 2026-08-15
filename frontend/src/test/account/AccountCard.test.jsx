// Spec 086 (FR-004) — the shared account card: one layout for every kind, cosmetics as data
// attributes, and the carousel's customize entry point for the active account.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../components/ui/BlockiesAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}))

import AccountCard from '../../components/account/AccountCard'
import { ACCOUNT_KIND_LABEL } from '../../lib/account/accountKinds'
import { setAccountProfile, clearAccountProfile } from '../../lib/account/accountProfilesStore'

const HW = { id: 'hardware:0xaaa', kind: 'hardware', address: '0xAaAa000000000000000000000000000000000001', label: 'Cold storage' }

beforeEach(() => {
  localStorage.clear()
  clearAccountProfile(HW.address)
})

describe('AccountCard', () => {
  it('labels every kind as a tag — including hardware (the spec-085 gap)', () => {
    render(<AccountCard account={HW} onSelect={() => {}} />)
    expect(screen.getByText('Hardware')).toBeInTheDocument()
    expect(ACCOUNT_KIND_LABEL.vault).toBe('Multisig')
    expect(ACCOUNT_KIND_LABEL.legacy).toBe('Recovered')
  })

  it('renders the member cosmetics as data attributes the CSS interprets (FR-007)', () => {
    setAccountProfile(HW.address, { tint: 'sky', pattern: 'rings' })
    render(<AccountCard account={HW} onSelect={() => {}} />)
    const card = screen.getByRole('option')
    expect(card).toHaveAttribute('data-tint', 'sky')
    expect(card).toHaveAttribute('data-pattern', 'rings')
  })

  it('defaults to none/none with no customization (FR-010)', () => {
    render(<AccountCard account={HW} onSelect={() => {}} />)
    const card = screen.getByRole('option')
    expect(card).toHaveAttribute('data-tint', 'none')
    expect(card).toHaveAttribute('data-pattern', 'none')
  })

  it('is a single option button that selects on click', () => {
    const onSelect = vi.fn()
    render(<AccountCard account={HW} active onSelect={onSelect} />)
    const card = screen.getByRole('option')
    expect(card).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledTimes(1)
    // No nested interactive elements inside the option (listbox validity).
    expect(card.querySelector('button')).toBeNull()
  })
})
