/**
 * LandingRoute — a returning visitor is not made to walk the marketing page
 * before they can sign in, and a visitor who asked for it still gets it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockWallet = { isConnected: false, connectionStatus: 'disconnected' }
vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => mockWallet }))
vi.mock('../components/LandingPage', () => ({ default: () => <div>Marketing page</div> }))

import LandingRoute from '../components/LandingRoute'
import { ENTRY_GATE_ACK_KEY } from '../utils/entryGateAck'
import { keepOnLanding } from '../utils/appEntry'

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
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockWallet.isConnected = false
  mockWallet.connectionStatus = 'disconnected'
})

describe('LandingRoute', () => {
  it('shows the marketing page to a first-time visitor', () => {
    renderAt()
    expect(screen.getByText('Marketing page')).toBeInTheDocument()
  })

  it('forwards a returning member with a recorded passkey straight into the app', () => {
    acknowledge()
    rememberPasskey()
    renderAt()
    expect(screen.getByText('App home')).toBeInTheDocument()
  })

  it('forwards on a previously used wallet connector too', () => {
    acknowledge()
    localStorage.setItem('wagmi.recentConnectorId', '"injected"')
    renderAt()
    expect(screen.getByText('App home')).toBeInTheDocument()
  })

  it('forwards while a stored session is still restoring', () => {
    acknowledge()
    mockWallet.connectionStatus = 'reconnecting'
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
