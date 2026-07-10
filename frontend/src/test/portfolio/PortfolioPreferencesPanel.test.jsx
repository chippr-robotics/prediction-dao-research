/**
 * PortfolioPreferencesPanel (spec 044 follow-up) — the Preferences → Portfolio
 * settings group with the "show testnet tokens" switch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import PortfolioPreferencesPanel from '../../components/account/PortfolioPreferencesPanel'

const mockPrefs = {
  preferences: { showTestnetAssets: false, showZeroBalances: false },
  setShowTestnetAssets: vi.fn(),
  setShowZeroBalances: vi.fn(),
}
vi.mock('../../hooks/useUserPreferences', () => ({
  useUserPreferences: () => mockPrefs,
}))

beforeEach(() => {
  mockPrefs.preferences = { showTestnetAssets: false, showZeroBalances: false }
  mockPrefs.setShowTestnetAssets = vi.fn()
  mockPrefs.setShowZeroBalances = vi.fn()
})

describe('PortfolioPreferencesPanel', () => {
  it('renders an accessible switch reflecting the stored preference', () => {
    render(<PortfolioPreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: /show testnet tokens/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/mainnet assets only/i)).toBeInTheDocument()
  })

  it('flips the preference on click', () => {
    render(<PortfolioPreferencesPanel />)
    fireEvent.click(screen.getByRole('switch', { name: /show testnet tokens/i }))
    expect(mockPrefs.setShowTestnetAssets).toHaveBeenCalledWith(true)
  })

  it('describes the enabled state and turns off again', () => {
    mockPrefs.preferences = { showTestnetAssets: true }
    render(<PortfolioPreferencesPanel />)
    expect(screen.getByText(/sepolia, amoy, mordor/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /show testnet tokens/i }))
    expect(mockPrefs.setShowTestnetAssets).toHaveBeenCalledWith(false)
  })

  it('renders and flips the zero-balance switch (default hide, FR-023)', () => {
    render(<PortfolioPreferencesPanel />)
    const toggle = screen.getByRole('switch', { name: /show zero-balance assets/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText(/only assets with a balance are listed/i)).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(mockPrefs.setShowZeroBalances).toHaveBeenCalledWith(true)
  })

  it('describes the enabled zero-balance state and turns off again', () => {
    mockPrefs.preferences = { showTestnetAssets: false, showZeroBalances: true }
    render(<PortfolioPreferencesPanel />)
    expect(screen.getByText(/listed with a 0 balance/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /show zero-balance assets/i }))
    expect(mockPrefs.setShowZeroBalances).toHaveBeenCalledWith(false)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<PortfolioPreferencesPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
