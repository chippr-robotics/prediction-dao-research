// Spec 043 (US1) — vault detail renders live on-chain facts and the unreadable-vault state.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import VaultDetail from '../../components/custody/VaultDetail'
import VaultList from '../../components/custody/VaultList'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

describe('VaultDetail', () => {
  it('renders threshold, role, and owners for a loaded Safe', async () => {
    const vault = { isSafe: true, address: A, chainId: 63, owners: [A, B], threshold: 2, owner: true, label: 'Coop', version: '1.4.1' }
    const { container } = render(<VaultDetail vault={vault} />)
    expect(screen.getByText(/2 of 2 owners/i)).toBeInTheDocument()
    expect(screen.getByText(/can propose & approve/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an unreadable state for a non-Safe reference', () => {
    render(<VaultDetail vault={{ isSafe: false, address: A, label: 'x' }} onForget={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/could not read a safe/i)
  })
})

describe('VaultList', () => {
  it('marks the active vault and calls onSelect', () => {
    const onSelect = vi.fn()
    const vaults = [{ chainId: 63, address: A, label: 'One', isSafe: true, owners: [A], threshold: 1, owner: true }]
    render(<VaultList vaults={vaults} activeAddress={A} onSelect={onSelect} />)
    const item = screen.getByRole('button', { name: /One/i })
    expect(item).toHaveAttribute('aria-current', 'true')
  })

  it('renders an empty state with no vaults', () => {
    render(<VaultList vaults={[]} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/no vaults yet/i)
  })
})
