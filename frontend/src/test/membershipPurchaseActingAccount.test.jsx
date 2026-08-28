/**
 * A membership must never land on a different account than the one on screen.
 *
 * `MembershipManager.purchaseTier` credits `msg.sender` and takes NO beneficiary, so a membership
 * belongs to exactly the address that signed. Every rail in this modal signs with the CONNECTED
 * wallet — none of them route through the spec-088 acting-account seam.
 *
 * So once the modal reads the ACTING account's tier (which it must — that is the account whose
 * membership every gate checks), buying while acting as somebody else would quote one account's
 * tier and credit another's. The rule is the same one `useActiveAccount#submit` already applies
 * to an unhandled acting kind: name the account and REFUSE, rather than acting as one identity
 * under another's label.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const CONNECTED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const VAULT = '0x1215000000000000000000000000000000008575'

const m = vi.hoisted(() => ({
  tierByAddress: {},
  askedFor: [],
  effective: null,
  started: [],
  notified: [],
}))

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: () => ({
    account: CONNECTED,
    isConnected: true, isCorrectNetwork: true, switchNetwork: vi.fn(),
    chainId: m.chainId, loginMethod: 'wallet', sendCalls: vi.fn(), provider: {},
  }),
}))
vi.mock('../hooks/useRoles', () => ({ useRoles: () => ({ grantRole: vi.fn(), loadRoles: vi.fn() }) }))
vi.mock('../hooks/useUI', () => ({
  useNotification: () => ({ showNotification: (msg, kind) => m.notified.push({ msg, kind }) }),
}))
vi.mock('../hooks/useTierPrices', () => ({
  useTierPrices: () => ({
    getPrice: (_role, tier) => ({ BRONZE: 2, SILVER: 8, GOLD: 25, PLATINUM: 100 }[tier]),
    getLimits: () => ({ monthly: 15, concurrent: 5 }),
    usingFallbackPrices: false,
    isTierActive: () => true,
  }),
}))
vi.mock('../hooks/useEncryption', () => ({
  useEncryption: () => ({ ensureInitialized: vi.fn(), isInitialized: true }),
}))
vi.mock('../hooks/useEffectiveAccount', () => ({ useEffectiveAccount: () => m.effective }))
vi.mock('../utils/blockchainService', async (orig) => ({
  ...(await orig()),
  getUserTierOnChain: (addr) => {
    m.askedFor.push(String(addr))
    return Promise.resolve(m.tierByAddress[String(addr).toLowerCase()] || { tier: 0, readable: true })
  },
}))
vi.mock('../hooks/usePurchaseFlow', () => {
  const flow = () => ({
    steps: [], status: 'idle', total: 0, completedCount: 0, activeIndex: -1, activeStep: null,
    progressFraction: 0, keyRegOutcome: null, canContinueAnyway: false, purchaseReceipt: null,
    start: (params) => { m.started.push(params); return Promise.resolve() },
    retry: vi.fn(), continueAnyway: vi.fn(), reset: vi.fn(),
  })
  return { usePurchaseFlow: flow, default: flow }
})

import PremiumPurchaseModal from '../components/ui/PremiumPurchaseModal'
import { membershipChainId } from '../config/networks'

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>)
const radio = (tier) => document.querySelector(`input[type="radio"][value="${tier}"]`)

const personal = () => ({
  address: CONNECTED, isActingAccount: false, type: 'personal', label: null,
  connectedAddress: CONNECTED, chainId: null,
})
const actingAsVault = () => ({
  address: VAULT, isActingAccount: true, type: 'vault', label: 'Ops vault',
  connectedAddress: CONNECTED, chainId: 80002,
})

/** Walk to the confirm step with a tier selected. */
async function toConfirm() {
  render(<PremiumPurchaseModal />)
  await waitFor(() => expect(radio('SILVER')).toBeTruthy())
  fireEvent.click(radio('SILVER'))
  fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }))
  screen.getAllByRole('checkbox').forEach((cb) => fireEvent.click(cb))
}

beforeEach(() => {
  m.chainId = membershipChainId()
  m.effective = personal()
  m.tierByAddress = {}
  m.askedFor = []
  m.started = []
  m.notified = []
})

describe('the tier quoted is the ACTING account’s', () => {
  it('reads the acting account, not the connected wallet', async () => {
    m.effective = actingAsVault()
    render(<PremiumPurchaseModal />)
    await waitFor(() => expect(m.askedFor.length).toBeGreaterThan(0))
    expect(m.askedFor.map((a) => a.toLowerCase())).toContain(VAULT.toLowerCase())
    expect(m.askedFor.map((a) => a.toLowerCase())).not.toContain(CONNECTED.toLowerCase())
  })

  it('reads the connected wallet while acting as yourself', async () => {
    render(<PremiumPurchaseModal />)
    await waitFor(() => expect(m.askedFor.length).toBeGreaterThan(0))
    expect(m.askedFor.map((a) => a.toLowerCase())).toContain(CONNECTED.toLowerCase())
  })
})

describe('buying while acting as another account is refused, not redirected', () => {
  it('says which account is acting and where the membership would land', async () => {
    m.effective = actingAsVault()
    await toConfirm()
    expect(screen.getByText(/Switch back to your personal wallet to buy/i)).toBeTruthy()
    // Names the acting account rather than a generic "wrong account" — an operator with several
    // vaults needs to know which one they are on.
    expect(screen.getAllByText(/Ops vault/).length).toBeGreaterThan(0)
  })

  it('disables Confirm, and starts no flow even if the control is driven directly', async () => {
    m.effective = actingAsVault()
    await toConfirm()
    const confirm = screen.getByRole('button', { name: /^Confirm Purchase/i })
    expect(confirm).toBeDisabled()

    // Defense in depth behind the disabled button: a disabled control is a UI fact, and the
    // submit path must refuse on its own. This is the assertion that survives a restyle.
    fireEvent.click(confirm)
    await waitFor(() => expect(m.started.length).toBe(0))
  })

  it('leaves the purchase available when acting as yourself', async () => {
    await toConfirm()
    expect(screen.queryByText(/Switch back to your personal wallet to buy/i)).toBeNull()
    const confirm = screen.getByRole('button', { name: /^Confirm Purchase/i })
    expect(confirm).not.toBeDisabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(m.started.length).toBe(1))
  })
})
