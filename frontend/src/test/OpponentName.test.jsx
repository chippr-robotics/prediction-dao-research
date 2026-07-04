import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../hooks/useWalletManagement', () => ({
  useWallet: () => ({ chainId: 1, account: '0x9999999999999999999999999999999999999999' }),
}))
vi.mock('../hooks/useOpponentName', () => ({
  useOpponentName: () => ({ displayName: 'Cobalt Otter', source: 'generated', address: ADDR, isLoading: false }),
}))

import OpponentName from '../components/fairwins/OpponentName'

const ADDR = '0x1234567890123456789012345678901234567890'

describe('OpponentName', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders "You" for the self case and skips resolution', () => {
    render(<OpponentName address={ADDR} isSelf />)
    expect(screen.getByText('You')).toBeInTheDocument()
  })

  it('renders the resolved name as an accessible toggle button', () => {
    render(<OpponentName address={ADDR} />)
    const btn = screen.getByRole('button', { name: /show full address for cobalt otter/i })
    expect(btn).toHaveTextContent('Cobalt Otter')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('reveals the full address on click', async () => {
    const user = userEvent.setup()
    render(<OpponentName address={ADDR} />)
    await user.click(screen.getByRole('button', { name: /show full address/i }))
    expect(screen.getByText('0x1234…7890')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy address/i })).toBeInTheDocument()
  })

  it('renders a non-interactive span when interactive is false', () => {
    render(<OpponentName address={ADDR} interactive={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Cobalt Otter')).toBeInTheDocument()
  })
})
