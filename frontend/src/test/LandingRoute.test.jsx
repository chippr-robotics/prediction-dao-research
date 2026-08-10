/**
 * LandingRoute — a returning visitor is not made to walk the marketing page
 * before they can sign in, and a visitor who asked for it still gets it.
 * Which screen they land on (Home or Portfolio) follows landingViewPreference.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockWallet = { isConnected: false, connectionStatus: 'disconnected' }
const mockIsMobile = { current: false }
vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => mockWallet }))
vi.mock('../hooks/useMediaQuery', () => ({ useIsMobile: () => mockIsMobile.current }))
vi.mock('../components/LandingPage', () => ({ default: () => <div>Marketing page</div> }))

import LandingRoute from '../components/LandingRoute'
import { ENTRY_GATE_ACK_KEY } from '../utils/entryGateAck'
import { keepOnLanding } from '../utils/appEntry'
import { setLandingViewPreference } from '../utils/landingViewPreference'

const PK = { x: `0x${'1'.repeat(64)}`, y: `0x${'1'.repeat(64)}` }

const acknowledge = () => localStorage.setItem(ENTRY_GATE_ACK_KEY, JSON.stringify({ at: 'earlier' }))
const rememberPasskey = () =>
  localStorage.setItem(
    'fairwins.passkey.credentials.v1',
    JSON.stringify([{ credentialId: 'c1', publicKey: PK, address: '0x' + 'a'.repeat(40) }]),
  )

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/app" element={<div>App home</div>} />
        <Route path="/wallet" element={<div>Portfolio view</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockWallet.isConnected = false
  mockWallet.connectionStatus = 'disconnected'
  mockIsMobile.current = false
})

describe('LandingRoute', () => {
  it('shows the marketing page to a first-time visitor', () => {
    renderAt()
    expect(screen.getByText('Marketing page')).toBeInTheDocument()
  })

  it('forwards a returning member on a larger display to Portfolio by default', () => {
    acknowledge()
    rememberPasskey()
    renderAt()
    expect(screen.getByText('Portfolio view')).toBeInTheDocument()
  })

  it('forwards a returning member on mobile to Home by default', () => {
    acknowledge()
    rememberPasskey()
    mockIsMobile.current = true
    renderAt()
    expect(screen.getByText('App home')).toBeInTheDocument()
  })

  it('honours a pinned landing-view preference over the device default', () => {
    acknowledge()
    rememberPasskey()
    setLandingViewPreference('home')
    renderAt()
    expect(screen.getByText('App home')).toBeInTheDocument()

    setLandingViewPreference('portfolio')
    mockIsMobile.current = true
    renderAt()
    expect(screen.getByText('Portfolio view')).toBeInTheDocument()
  })

  it('forwards on a previously used wallet connector too', () => {
    acknowledge()
    localStorage.setItem('wagmi.recentConnectorId', '"injected"')
    mockIsMobile.current = true
    renderAt()
    expect(screen.getByText('App home')).toBeInTheDocument()
  })

  it('forwards while a stored session is still restoring', () => {
    acknowledge()
    mockWallet.connectionStatus = 'reconnecting'
    mockIsMobile.current = true
    renderAt()
    expect(screen.getByText('App home')).toBeInTheDocument()
  })

  it('never forwards past the eligibility gate (not acknowledged yet)', () => {
    rememberPasskey()
    renderAt()
    expect(screen.getByText('Marketing page')).toBeInTheDocument()
  })

  it('respects a visitor who stepped out of the app ("Leave")', () => {
    acknowledge()
    rememberPasskey()
    keepOnLanding()
    renderAt()
    expect(screen.getByText('Marketing page')).toBeInTheDocument()
  })

  it('respects /?stay=1 and remembers it for the tab session', () => {
    acknowledge()
    rememberPasskey()
    renderAt('/?stay=1')
    expect(screen.getByText('Marketing page')).toBeInTheDocument()

    // A later plain "/" in the same tab still shows the marketing page.
    renderAt()
    expect(screen.getAllByText('Marketing page').length).toBeGreaterThan(0)
  })
})
