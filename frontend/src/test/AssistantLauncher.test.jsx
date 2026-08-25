/**
 * AssistantLauncher (spec 095) — the gating chain, which is almost the whole component.
 *
 * The launcher's job is mostly to NOT exist: tenant feature, connection, opt-in and an active,
 * READABLE membership all have to hold. The branch worth naming is the unreadable one — a
 * membership the reference chain would not answer for renders nothing at all, never a denial and
 * never a toast. An entry point is the wrong place to tell someone their RPC is slow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let featureEnabled
let walletState
let membershipState

vi.mock('../config/tenant', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isFeatureEnabled: (id) => (id === 'assistant' ? featureEnabled : actual.isFeatureEnabled(id)),
  }
})
vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))
vi.mock('../hooks/useRoleDetails', () => ({
  default: () => ({ getRoleDetails: () => membershipState, refresh: vi.fn() }),
  MembershipTier: { NONE: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4 },
}))

import AssistantLauncher from '../components/assistant/AssistantLauncher'
import {
  __resetAssistantPrefsForTests,
  setAssistantEnabled,
} from '../lib/assistant/assistantPrefs'
import { __resetAssistantSessionForTests } from '../lib/assistant/assistantClient'

const ACCOUNT = '0x' + '3'.repeat(40)
const ACTIVE = { isActive: true, tier: 2, tierName: 'Silver', readable: true, hasRole: true }
const INACTIVE = { isActive: false, tier: 0, tierName: 'None', readable: true, hasRole: false }
const UNREADABLE = { isActive: false, tier: 0, tierName: 'Unknown', readable: false, hasRole: false }

function renderLauncher() {
  return render(
    <MemoryRouter>
      <AssistantLauncher />
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  __resetAssistantPrefsForTests()
  __resetAssistantSessionForTests()
  featureEnabled = true
  walletState = { address: ACCOUNT, signer: null, loginMethod: 'injected', chainId: 137, isConnected: true }
  membershipState = ACTIVE
  setAssistantEnabled(ACCOUNT, true)
})

describe('gating', () => {
  it('renders nothing when the tenant does not enable the assistant', () => {
    featureEnabled = false
    renderLauncher()
    expect(screen.queryByTestId('assistant-launcher')).not.toBeInTheDocument()
  })

  it('renders nothing without a connected wallet', () => {
    walletState = { address: null, signer: null, loginMethod: null, chainId: 137, isConnected: false }
    renderLauncher()
    expect(screen.queryByTestId('assistant-launcher')).not.toBeInTheDocument()
  })

  it('renders nothing until the account has opted in (default OFF)', () => {
    __resetAssistantPrefsForTests()
    localStorage.clear()
    renderLauncher()
    expect(screen.queryByTestId('assistant-launcher')).not.toBeInTheDocument()
  })

  it('renders nothing while membership is still being read', () => {
    membershipState = null
    renderLauncher()
    expect(screen.queryByTestId('assistant-launcher')).not.toBeInTheDocument()
  })

  it('renders nothing — and no denial — when membership is UNREADABLE', () => {
    membershipState = UNREADABLE
    const { container } = renderLauncher()
    expect(screen.queryByTestId('assistant-launcher')).not.toBeInTheDocument()
    // Not a toast, not an alert, not a "you are not a member": simply absent.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an account with no active membership', () => {
    membershipState = INACTIVE
    renderLauncher()
    expect(screen.queryByTestId('assistant-launcher')).not.toBeInTheDocument()
  })

  it('renders the launcher when every gate passes', () => {
    renderLauncher()
    const button = screen.getByTestId('assistant-launcher')
    expect(button).toHaveAccessibleName(/open the fairwins assistant/i)
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('opening the panel', () => {
  it('asks the member to authorize a session before anything is sent', () => {
    renderLauncher()
    fireEvent.click(screen.getByTestId('assistant-launcher'))

    const dialog = screen.getByRole('dialog', { name: /fairwins assistant/i })
    expect(dialog).toBeInTheDocument()
    const authorize = screen.getByTestId('assistant-authorize')
    expect(authorize).toHaveTextContent(/no transaction, no fee, nothing moves/i)
    expect(authorize).toHaveTextContent(/24 hours/i)
    // There is no composer until a session exists — nothing can be typed, so nothing can be sent.
    expect(screen.queryByLabelText(/message the assistant/i)).not.toBeInTheDocument()
  })

  it('takes the launcher out of the tab order while its own panel is open', () => {
    renderLauncher()
    fireEvent.click(screen.getByTestId('assistant-launcher'))
    const button = screen.getByTestId('assistant-launcher')
    expect(button).toHaveClass('assistant-launcher--hidden')
    expect(button).toHaveAttribute('tabindex', '-1')
  })
})
