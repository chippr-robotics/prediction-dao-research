import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { useChainId, useSwitchChain } from 'wagmi'
import NetworkSettings from '../components/wallet/NetworkSettings'

// The relocated network selector (My Account → Network tab). wagmi hooks are
// mocked globally in test/setup.js; we override per-test for chain state.

describe('NetworkSettings — relocated network selector', () => {
  const switchChain = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useChainId.mockReturnValue(61) // unsupported chain → every network offers "Switch"
    useSwitchChain.mockReturnValue({
      switchChain,
      isPending: false,
      variables: undefined,
      error: null,
    })
  })

  it('lists the user-switchable networks', () => {
    render(<NetworkSettings />)
    expect(screen.getByText('Polygon')).toBeInTheDocument()
    expect(screen.getByText('Polygon Amoy')).toBeInTheDocument()
  })

  it('shows capability tags so members can make an informed switch', () => {
    render(<NetworkSettings />)
    // Each card renders the full capability set; assert the compliance + oracle tags.
    expect(screen.getAllByText('Sanctions Guard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Polymarket Oracle').length).toBeGreaterThan(0)
    expect(screen.getAllByText('UMA Oracle').length).toBeGreaterThan(0)
  })

  it('marks Token Swap available on mainnet but not on the testnet', () => {
    render(<NetworkSettings />)
    const polygonCard = screen.getByText('Polygon').closest('.network-card')
    const amoyCard = screen.getByText('Polygon Amoy').closest('.network-card')

    const polygonSwap = within(polygonCard).getByText('Token Swap').closest('.network-tag')
    const amoySwap = within(amoyCard).getByText('Token Swap').closest('.network-tag')

    expect(polygonSwap).toHaveClass('available')
    expect(amoySwap).toHaveClass('unavailable')
  })

  it('marks the connected network instead of offering a switch button', () => {
    useChainId.mockReturnValue(137)
    render(<NetworkSettings />)
    const polygonCard = screen.getByText('Polygon').closest('.network-card')
    expect(within(polygonCard).getByText('Connected')).toBeInTheDocument()
    expect(within(polygonCard).queryByRole('button', { name: /Switch to Polygon/ })).toBeNull()
  })

  it('switches chains through wagmi when a switch button is clicked', () => {
    render(<NetworkSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Polygon Amoy' }))
    expect(switchChain).toHaveBeenCalledWith({ chainId: 80002 })
  })

  it('lists Mordor (Ethereum Classic) as a selectable testnet', () => {
    render(<NetworkSettings />)
    const card = screen.getByText('Ethereum Classic Mordor').closest('.network-card')
    expect(card).toBeInTheDocument()
    expect(within(card).getByText('Testnet')).toBeInTheDocument()
  })

  it('switches to Mordor (chainId 63) through wagmi', () => {
    render(<NetworkSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Ethereum Classic Mordor' }))
    expect(switchChain).toHaveBeenCalledWith({ chainId: 63 })
  })

  it('marks oracle + swap features unavailable on Mordor (no oracle adapters, no DEX configured)', () => {
    render(<NetworkSettings />)
    const card = screen.getByText('Ethereum Classic Mordor').closest('.network-card')
    expect(within(card).getByText('Polymarket Oracle').closest('.network-tag')).toHaveClass('unavailable')
    expect(within(card).getByText('Chainlink Oracle').closest('.network-tag')).toHaveClass('unavailable')
    expect(within(card).getByText('UMA Oracle').closest('.network-tag')).toHaveClass('unavailable')
    expect(within(card).getByText('Token Swap').closest('.network-tag')).toHaveClass('unavailable')
  })

  it('documents Mordor explorer and Classic USD stablecoin on the card', () => {
    render(<NetworkSettings />)
    const card = screen.getByText('Ethereum Classic Mordor').closest('.network-card')
    const explorer = within(card).getByRole('link', { name: 'Blockscout' })
    expect(explorer).toHaveAttribute('href', 'https://etc-mordor.blockscout.com')
    expect(explorer).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(within(card).getByText('Classic USD (USC)')).toBeInTheDocument()
  })
})
