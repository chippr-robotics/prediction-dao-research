import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Stub the heavy children to assert the HomeScreen wiring (not their internals).
vi.mock('../components/fairwins/CreateChallengePanel', () => ({
  default: ({ embedded, initialResolutionType, onDone, onOracleModeChange }) => (
    <div
      data-testid="create-panel"
      data-embedded={String(!!embedded)}
      data-initial-resolution={initialResolutionType ?? ''}
    >
      <button type="button" onClick={() => onDone?.()}>done</button>
      <button type="button" onClick={() => onOracleModeChange?.(true)}>enter oracle mode</button>
    </div>
  ),
}))
vi.mock('../components/fairwins/UnifiedLookupModal', () => ({
  default: ({ isOpen, initialPhrase, autoResolve }) => isOpen ? (
    <div data-testid="unified-modal" data-phrase={initialPhrase} data-auto={String(autoResolve)} />
  ) : null,
}))
vi.mock('../components/fairwins/MyMarketsModal', () => ({
  default: ({ isOpen }) => isOpen ? <div data-testid="my-wagers-modal" /> : null,
}))
vi.mock('../components/fairwins/PolymarketTickerCrawler', () => ({
  default: ({ onSelectMarket }) => (
    <button type="button" onClick={() => onSelectMarket?.()}>Ticker item</button>
  ),
}))

const walletHolder = { isConnected: true }
vi.mock('../hooks', () => ({
  useWallet: () => ({ isConnected: walletHolder.isConnected, account: '0xabc' }),
  useWalletConnection: () => ({ connectWallet: vi.fn() }),
}))
vi.mock('../hooks/useUI', () => ({ useModal: () => ({ showModal: vi.fn(), hideModal: vi.fn() }) }))
vi.mock('../contexts/FriendMarketsContext.js', () => ({ useFriendMarkets: () => ({ friendMarkets: [] }) }))

import HomeScreen from '../components/fairwins/HomeScreen'
import { OPEN_RESOLUTION_TYPES } from '../hooks/useOpenChallengeCreate'

const renderHome = (entries = ['/app']) =>
  render(<MemoryRouter initialEntries={entries}><HomeScreen /></MemoryRouter>)

describe('HomeScreen (spec 053) — the create-a-challenge landing', () => {
  beforeEach(() => { walletHolder.isConnected = true })

  it('opens on the inline create view as the primary content — no quick-action grid (US1)', () => {
    renderHome()
    expect(screen.getByTestId('create-panel')).toHaveAttribute('data-embedded', 'true')
    // None of the relocated grid cards are on home.
    expect(screen.queryByText('Make an Offer')).toBeNull()
    expect(screen.queryByText('Group Pool')).toBeNull()
    expect(screen.queryByText('Open Oracle Challenge')).toBeNull()
  })

  it('Accept a challenge opens the unified phrase lookup (US3)', () => {
    renderHome()
    expect(screen.queryByTestId('unified-modal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /accept a challenge/i }))
    expect(screen.getByTestId('unified-modal')).toBeInTheDocument()
  })

  it('My Wagers opens the My Wagers modal (US3)', () => {
    renderHome()
    expect(screen.queryByTestId('my-wagers-modal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /my wagers/i }))
    expect(screen.getByTestId('my-wagers-modal')).toBeInTheDocument()
  })

  it('hides the secondary actions while the create panel is on its oracle path (design feedback)', () => {
    renderHome()
    expect(screen.getByRole('button', { name: /accept a challenge/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /my wagers/i })).toBeInTheDocument()
    // The panel reports it switched to the oracle path → the secondary actions collapse.
    fireEvent.click(screen.getByRole('button', { name: /enter oracle mode/i }))
    expect(screen.queryByRole('button', { name: /accept a challenge/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /my wagers/i })).toBeNull()
  })

  it('a ticker pick routes the create view into its oracle path (US2)', () => {
    renderHome()
    expect(screen.getByTestId('create-panel')).toHaveAttribute('data-initial-resolution', '')
    fireEvent.click(screen.getByRole('button', { name: /ticker item/i }))
    expect(screen.getByTestId('create-panel'))
      .toHaveAttribute('data-initial-resolution', String(OPEN_RESOLUTION_TYPES.Polymarket))
  })

  it('a ?oc=take&code= deep link opens the unified lookup prefilled + auto-resolving (FR-016)', () => {
    renderHome(['/app?oc=take&code=river%20tiger%20kite%20zoo'])
    const modal = screen.getByTestId('unified-modal')
    expect(modal).toHaveAttribute('data-phrase', 'river tiger kite zoo')
    expect(modal).toHaveAttribute('data-auto', 'true')
  })

  it('shows a connect prompt when disconnected — the create view still renders, action gated (FR-013)', () => {
    walletHolder.isConnected = false
    renderHome()
    expect(screen.getByTestId('create-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument()
  })
})
