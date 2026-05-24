import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { NativeToken } from '../components/ui/NativeToken'
import { StableToken } from '../components/ui/StableToken'
import { ChainCapabilityGate } from '../components/ui/ChainCapabilityGate'

// Mock useChainTokens hook
const mockUseChainTokens = vi.fn()
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: (...args) => mockUseChainTokens(...args),
}))

describe('NativeToken', () => {
  it('should render the native token symbol', () => {
    mockUseChainTokens.mockReturnValue({ native: 'MATIC' })
    const { container } = render(<NativeToken />)
    expect(container.textContent).toBe('MATIC')
  })

  it('should render ETH for Ethereum chain', () => {
    mockUseChainTokens.mockReturnValue({ native: 'ETH' })
    const { container } = render(<NativeToken />)
    expect(container.textContent).toBe('ETH')
  })

  it('should render empty when native is empty string', () => {
    mockUseChainTokens.mockReturnValue({ native: '' })
    const { container } = render(<NativeToken />)
    expect(container.textContent).toBe('')
  })
})

describe('StableToken', () => {
  it('should render the stable token symbol', () => {
    mockUseChainTokens.mockReturnValue({ stable: 'USDC' })
    const { container } = render(<StableToken />)
    expect(container.textContent).toBe('USDC')
  })

  it('should render STABLE as fallback', () => {
    mockUseChainTokens.mockReturnValue({ stable: 'STABLE' })
    const { container } = render(<StableToken />)
    expect(container.textContent).toBe('STABLE')
  })
})

describe('ChainCapabilityGate', () => {
  it('should render children when capability is supported', () => {
    mockUseChainTokens.mockReturnValue({
      capabilities: { dex: true, friendMarkets: true },
    })
    const { container } = render(
      <ChainCapabilityGate capability="dex">
        <p>DEX is supported</p>
      </ChainCapabilityGate>
    )
    expect(container.textContent).toContain('DEX is supported')
  })

  it('should render nothing when capability is not supported', () => {
    mockUseChainTokens.mockReturnValue({
      capabilities: { dex: false },
    })
    const { container } = render(
      <ChainCapabilityGate capability="dex">
        <p>DEX content</p>
      </ChainCapabilityGate>
    )
    expect(container.textContent).toBe('')
  })

  it('should render fallback when capability is missing', () => {
    mockUseChainTokens.mockReturnValue({
      capabilities: {},
    })
    const { container } = render(
      <ChainCapabilityGate capability="polymarketSidebets" fallback={<p>Not available</p>}>
        <p>Polymarket</p>
      </ChainCapabilityGate>
    )
    expect(container.textContent).toContain('Not available')
    expect(container.textContent).not.toContain('Polymarket')
  })

  it('should handle null capabilities gracefully', () => {
    mockUseChainTokens.mockReturnValue({
      capabilities: null,
    })
    const { container } = render(
      <ChainCapabilityGate capability="dex" fallback={<p>Fallback</p>}>
        <p>Content</p>
      </ChainCapabilityGate>
    )
    expect(container.textContent).toContain('Fallback')
  })

  it('should render nothing when capability is absent and no fallback', () => {
    mockUseChainTokens.mockReturnValue({
      capabilities: {},
    })
    const { container } = render(
      <ChainCapabilityGate capability="someFeature">
        <p>Feature content</p>
      </ChainCapabilityGate>
    )
    expect(container.textContent).toBe('')
  })
})
