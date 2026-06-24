import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClearPathPanel from '../ClearPathPanel'

// Spec 030 (US3) — the ClearPath panel: lists external DAOs from the on-chain registry, opens a live tracking
// view (Olympia), registers a new DAO, and self-disables truthfully on unsupported networks. No mock data in
// the product — the tests mock the hook/connector to drive the components deterministically.

const cp = {
  isSupported: true,
  chainId: 63,
  reader: {},
  account: '0xabc',
  isConnected: true,
  listExternalDAOs: vi.fn(),
  registerExternalDAO: vi.fn(),
}
vi.mock('../useClearPath', () => ({ useClearPath: () => cp }))

const conn = { validateGovernor: vi.fn(), readGovernorSummary: vi.fn() }
vi.mock('../governorConnector', () => ({
  validateGovernor: (...a) => conn.validateGovernor(...a),
  readGovernorSummary: (...a) => conn.readGovernorSummary(...a),
}))

vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({
    name: 'Ethereum Classic Mordor',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    nativeCurrency: { symbol: 'ETC' },
  }),
}))

const OLYMPIA = '0xB85dbc899472756470EF4033b9637ff8fa2FD23D'
const olympiaRecord = { id: 1, dao: OLYMPIA, framework: 0, label: 'Olympia DAO', registrant: '0xabc', registeredAt: 1700000000 }

describe('ClearPathPanel (spec 030 / US3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cp.isSupported = true
    cp.listExternalDAOs.mockResolvedValue([olympiaRecord])
  })

  it('self-disables truthfully on an unsupported network', async () => {
    cp.isSupported = false
    render(<ClearPathPanel />)
    expect(screen.getByText(/ClearPath isn’t deployed/i)).toBeInTheDocument()
  })

  it('lists external DAOs from the on-chain registry', async () => {
    render(<ClearPathPanel />)
    expect(await screen.findByText('Olympia DAO')).toBeInTheDocument()
    expect(screen.getByText('OpenZeppelin Governor')).toBeInTheDocument()
  })

  it('opens a live tracking view for a registered DAO', async () => {
    conn.readGovernorSummary.mockResolvedValue({
      name: 'OlympiaGovernor',
      tokenAddr: '0x0000000000000000000000000000000000000111',
      tokenName: 'Olympia Member',
      tokenSymbol: 'OLYM',
      timelock: '0x0000000000000000000000000000000000000222',
      treasuryNative: 0n,
      votingDelay: '1',
      votingPeriod: '100',
      proposalThreshold: '0',
      countingMode: 'support=bravo&quorum=for,abstain',
      clockMode: 'mode=blocknumber&from=default',
    })
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    expect(await screen.findByText('OlympiaGovernor')).toBeInTheDocument()
    expect(screen.getByText(/Olympia Member \(OLYM\)/)).toBeInTheDocument()
    // proposals truthfully disabled (no indexing on this network)
    expect(screen.getByText(/Proposal history requires event indexing/i)).toBeInTheDocument()
  })

  it('validates then registers a new external DAO', async () => {
    conn.validateGovernor.mockResolvedValue({ ok: true, name: 'OlympiaGovernor', reason: '' })
    cp.registerExternalDAO.mockResolvedValue({})
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(screen.getByRole('tab', { name: /register/i }))
    await user.type(screen.getByLabelText(/governor address/i), OLYMPIA)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    expect(await screen.findByText(/Recognized governance contract/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /register dao/i }))
    await waitFor(() =>
      expect(cp.registerExternalDAO).toHaveBeenCalledWith(
        expect.objectContaining({ dao: OLYMPIA, framework: 0 })
      )
    )
  })
})
