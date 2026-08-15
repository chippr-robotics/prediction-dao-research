// Spec 086 (FR-003) — the shared identity avatar: member-set picture first, Blockies fallback,
// reactive to the profile store so every surface updates in the same frame.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'

vi.mock('../../components/ui/BlockiesAvatar', () => ({
  default: ({ address, size }) => <div data-testid="blockies" data-address={address} data-size={size} />,
}))

import AccountAvatar from '../../components/account/AccountAvatar'
import { setAccountProfile, clearAccountProfile } from '../../lib/account/accountProfilesStore'

const ADDR = '0xAaAa000000000000000000000000000000000001'
const IMG = 'data:image/png;base64,iVBORw0KGgo='

beforeEach(() => {
  localStorage.clear()
  clearAccountProfile(ADDR)
})

describe('AccountAvatar', () => {
  it('falls back to Blockies when no picture is set', () => {
    render(<AccountAvatar address={ADDR} size={24} />)
    expect(screen.getByTestId('blockies')).toHaveAttribute('data-size', '24')
  })

  it('renders the member-set picture when one exists', () => {
    setAccountProfile(ADDR, { image: IMG })
    render(<AccountAvatar address={ADDR} size={32} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', IMG)
    expect(img.className).toContain('account-avatar--custom')
    expect(screen.queryByTestId('blockies')).not.toBeInTheDocument()
  })

  it('reacts to the store: setting and clearing a picture swaps the rendering live', () => {
    render(<AccountAvatar address={ADDR} />)
    expect(screen.getByTestId('blockies')).toBeInTheDocument()

    act(() => {
      setAccountProfile(ADDR, { image: IMG })
    })
    expect(screen.getByRole('img')).toHaveAttribute('src', IMG)

    act(() => {
      clearAccountProfile(ADDR)
    })
    expect(screen.getByTestId('blockies')).toBeInTheDocument()
  })
})
