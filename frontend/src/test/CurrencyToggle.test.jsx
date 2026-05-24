import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import CurrencyToggle from '../components/ui/CurrencyToggle'

// Mock hooks
const mockUsePrice = vi.fn()
const mockUseChainTokens = vi.fn()

vi.mock('../contexts/PriceContext', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    usePrice: (...args) => mockUsePrice(...args),
  }
})

vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: (...args) => mockUseChainTokens(...args),
}))

describe('CurrencyToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseChainTokens.mockReturnValue({ native: 'MATIC' })
    mockUsePrice.mockReturnValue({
      showUsd: true,
      toggleCurrency: vi.fn(),
      nativeUsdRate: 0.85,
      loading: false,
    })
  })

  it('should render USD and native token options', () => {
    render(<CurrencyToggle />)
    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.getByText('MATIC')).toBeInTheDocument()
  })

  it('should highlight USD when showUsd is true', () => {
    const { container } = render(<CurrencyToggle />)
    const options = container.querySelectorAll('.currency-option')
    // First option is USD
    expect(options[0]).toHaveClass('active')
    expect(options[1]).not.toHaveClass('active')
  })

  it('should highlight native token when showUsd is false', () => {
    mockUsePrice.mockReturnValue({
      showUsd: false,
      toggleCurrency: vi.fn(),
      nativeUsdRate: 0.85,
      loading: false,
    })
    const { container } = render(<CurrencyToggle />)
    const options = container.querySelectorAll('.currency-option')
    expect(options[0]).not.toHaveClass('active')
    expect(options[1]).toHaveClass('active')
  })

  it('should call toggleCurrency when clicked', () => {
    const toggleCurrency = vi.fn()
    mockUsePrice.mockReturnValue({
      showUsd: true,
      toggleCurrency,
      nativeUsdRate: 0.85,
      loading: false,
    })
    render(<CurrencyToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(toggleCurrency).toHaveBeenCalled()
  })

  it('should be disabled when loading', () => {
    mockUsePrice.mockReturnValue({
      showUsd: true,
      toggleCurrency: vi.fn(),
      nativeUsdRate: null,
      loading: true,
    })
    render(<CurrencyToggle />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('should have accessible label describing current state', () => {
    render(<CurrencyToggle />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toContain('Currently showing prices in USD')
  })

  it('should use MATIC as default when nativeSymbol is empty', () => {
    mockUseChainTokens.mockReturnValue({ native: '' })
    render(<CurrencyToggle />)
    expect(screen.getByText('MATIC')).toBeInTheDocument()
  })

  it('should show exchange rate in title tooltip', () => {
    render(<CurrencyToggle />)
    const button = screen.getByRole('button')
    expect(button.getAttribute('title')).toContain('1 MATIC = $0.85')
  })
})
