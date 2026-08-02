import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReadRouteToggle from '../ReadRouteToggle'

// Spec 042 (FR-019) — read-route control: public RPC (default) vs wallet-managed; reads only.

describe('ReadRouteToggle (spec 042)', () => {
  it('marks Public RPC selected by default and switches to Wallet on click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<ReadRouteToggle value="public" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: /public rpc/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /wallet/i })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('radio', { name: /wallet/i }))
    expect(onChange).toHaveBeenCalledWith('wallet')
    rerender(<ReadRouteToggle value="wallet" onChange={onChange} />)
    expect(screen.getByRole('radio', { name: /wallet/i })).toHaveAttribute('aria-checked', 'true')
  })
})
