import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const tokensHolder = {}
vi.mock('../../../hooks/useChainTokens', () => ({ useChainTokens: () => tokensHolder }))

import HomePreferencesPanel from '../HomePreferencesPanel'
import { getDefaultHomeMode, getDefaultCurrencyKind } from '../../../utils/homePreference'

describe('HomePreferencesPanel (spec 058 US4)', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.assign(tokensHolder, { networkName: 'Polygon', stable: 'USDC', native: 'POL' })
  })

  it('renders both settings with the built-in presets checked (Pay / USDC)', () => {
    render(<HomePreferencesPanel />)
    expect(screen.getByRole('radiogroup', { name: /default home view/i })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: /default currency/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Pay' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'USDC' })).toBeChecked()
  })

  it('offers all three modes and persists a new default view', () => {
    render(<HomePreferencesPanel />)
    for (const name of ['Pay', 'Request', 'Wager']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Wager' }))
    expect(screen.getByRole('radio', { name: 'Wager' })).toBeChecked()
    expect(getDefaultHomeMode()).toBe('wager')
  })

  it("renders currency options with the active network's real symbols but stores the kind", () => {
    render(<HomePreferencesPanel />)
    fireEvent.click(screen.getByRole('radio', { name: 'POL' }))
    expect(getDefaultCurrencyKind()).toBe('native')
    expect(JSON.parse(localStorage.getItem('fairwins_home_v1')).defaultCurrencyKind).toBe('native')
  })

  it('reflects honest symbols on a network whose stablecoin is not USDC', () => {
    Object.assign(tokensHolder, { networkName: 'Mordor', stable: 'USC', native: 'METC' })
    render(<HomePreferencesPanel />)
    expect(screen.getByRole('radio', { name: 'USC' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'USDC' })).toBeNull()
  })

  it('reflects a previously saved choice on mount', async () => {
    const { setDefaultHomeMode } = await import('../../../utils/homePreference')
    setDefaultHomeMode('request')
    render(<HomePreferencesPanel />)
    expect(screen.getByRole('radio', { name: 'Request' })).toBeChecked()
  })
})
