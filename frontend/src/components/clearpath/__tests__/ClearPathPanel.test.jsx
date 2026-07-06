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
vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))

const conn = { validateGovernor: vi.fn(), readGovernorSummary: vi.fn(), fetchGovernorProposals: vi.fn(), readTreasuries: vi.fn(), readVoterState: vi.fn(), readProposalEta: vi.fn(), detectTreasuryFunding: vi.fn() }
vi.mock('../governorConnector', () => ({
  validateGovernor: (...a) => conn.validateGovernor(...a),
  readGovernorSummary: (...a) => conn.readGovernorSummary(...a),
  readTreasuries: (...a) => conn.readTreasuries(...a),
  extraTreasuries: () => [{ label: 'Olympia Treasury', address: '0x035b2e3c189B772e52F4C3DA6c45c84A3bB871bf' }],
  detectTreasuryFunding: (...a) => conn.detectTreasuryFunding(...a),
  fetchGovernorProposals: (...a) => conn.fetchGovernorProposals(...a),
  readVoterState: (...a) => conn.readVoterState(...a),
  readProposalEta: (...a) => conn.readProposalEta(...a),
  explainTxError: (e) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed.',
  castVote: vi.fn(),
  queueProposal: vi.fn(),
  executeProposal: vi.fn(),
  proposeAction: vi.fn(),
}))

vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({
    name: 'Ethereum Classic Mordor',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    nativeCurrency: { symbol: 'ETC' },
  }),
}))

// CpAddressField (governor/recipient inputs) pulls in AddressBookButton → useWallet, which throws without a
// WalletProvider. Stub the wallet-scoped hooks so register + tracking views render the real fields in tests.
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../../../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn() }) }))

const OLYMPIA = '0xB85dbc899472756470EF4033b9637ff8fa2FD23D'
const olympiaRecord = { id: 1, dao: OLYMPIA, framework: 0, label: 'Olympia DAO', registrant: '0xabc', registeredAt: 1700000000 }

describe('ClearPathPanel (spec 030 / US3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cp.isSupported = true
    cp.listExternalDAOs.mockResolvedValue([olympiaRecord])
    conn.readGovernorSummary.mockResolvedValue({ clockMode: 'mode=blocknumber' })
    conn.fetchGovernorProposals.mockResolvedValue({ ok: true, proposals: [], scannedFrom: 16000000, scannedTo: 16500000, partial: false })
    conn.readTreasuries.mockResolvedValue([])
    conn.readVoterState.mockResolvedValue({ hasVoted: false, votingPower: null, support: null })
    conn.readProposalEta.mockResolvedValue(null)
    conn.detectTreasuryFunding.mockResolvedValue(null)
  })

  it('self-disables truthfully on an unsupported network', async () => {
    cp.isSupported = false
    render(<ClearPathPanel />)
    expect(screen.getByText(/ClearPath isn’t available/i)).toBeInTheDocument()
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
    conn.readTreasuries.mockResolvedValue([
      { label: 'Timelock', address: '0x0000000000000000000000000000000000000222', native: 0n, usdc: 1500000n, usdcSymbol: 'cUSD', usdcDecimals: 6 },
      { label: 'Olympia Treasury', address: '0x035b2e3c189B772e52F4C3DA6c45c84A3bB871bf', native: 2147152000000000000n, usdc: 0n, usdcSymbol: 'cUSD', usdcDecimals: 6 },
    ])
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    expect(await screen.findByText('OlympiaGovernor')).toBeInTheDocument()
    expect(screen.getByText(/Olympia Member \(OLYM\)/)).toBeInTheDocument()
    // treasury enrichment: the OlympiaTreasury vault + USDC balance render
    expect(await screen.findByText('Olympia Treasury')).toBeInTheDocument()
    expect(screen.getByText('1.5')).toBeInTheDocument() // 1500000 cUSD @ 6 decimals
    // live indexer: empty range shows a truthful state (not a fabricated list)
    expect(await screen.findByText(/No proposals found in the scanned range/i)).toBeInTheDocument()
  })

  it('renders a live proposal with vote actions when one is in range', async () => {
    conn.fetchGovernorProposals.mockResolvedValue({
      ok: true,
      partial: false,
      scannedFrom: 16000000,
      scannedTo: 16500000,
      proposals: [
        { id: '42', proposer: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', description: 'Fund core dev', targets: [], values: [], calldatas: [], descriptionHash: '0x', voteStart: '1', voteEnd: '2', state: 1, votes: { for: '3', against: '1', abstain: '0' } },
      ],
    })
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    expect(await screen.findByText('Fund core dev')).toBeInTheDocument()
    expect(screen.getByText('Active', { selector: '.cp-badge' })).toBeInTheDocument()
    // the proposal timeline surfaces the voting window position
    expect(screen.getByLabelText('Proposal timeline')).toBeInTheDocument()
    // US5: an Active proposal offers vote actions
    expect(screen.getByRole('button', { name: /vote for/i })).toBeInTheDocument()
  })

  it('shows the user vote receipt and hides vote buttons once they have voted', async () => {
    conn.fetchGovernorProposals.mockResolvedValue({
      ok: true, partial: false, scannedFrom: 16000000, scannedTo: 16500000,
      proposals: [
        { id: '42', proposer: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', description: 'Fund core dev', targets: [], values: [], calldatas: [], descriptionHash: '0x', voteStart: '1', voteEnd: '16500001', state: 1, votes: { for: '3', against: '1', abstain: '0' } },
      ],
    })
    conn.readVoterState.mockResolvedValue({ hasVoted: true, votingPower: '5', support: 1 /* For */ })
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    expect(await screen.findByText(/You voted: For/i)).toBeInTheDocument()
    // having voted, the vote buttons are not offered again
    expect(screen.queryByRole('button', { name: /vote for/i })).not.toBeInTheDocument()
  })

  it('disables Execute and shows a countdown until the timelock ETA elapses', async () => {
    conn.fetchGovernorProposals.mockResolvedValue({
      ok: true, partial: false, scannedFrom: 16000000, scannedTo: 16500000,
      proposals: [
        { id: '7', proposer: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', description: 'Queued prop', targets: [], values: [], calldatas: [], descriptionHash: '0x', voteStart: '1', voteEnd: '2', state: 5, votes: { for: '3', against: '0', abstain: '0' } },
      ],
    })
    conn.readProposalEta.mockResolvedValue(Math.floor(Date.now() / 1000) + 3600) // ETA 1h in the future
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    expect(await screen.findByText(/Executable in/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /execute/i })).toBeDisabled()
  })

  it('copies the full proposal id when the id is clicked', async () => {
    conn.fetchGovernorProposals.mockResolvedValue({
      ok: true, partial: false, scannedFrom: 16000000, scannedTo: 16500000,
      proposals: [
        { id: '123456789012345678', proposer: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', description: 'Copy me', targets: [], values: [], calldatas: [], descriptionHash: '0x', voteStart: '1', voteEnd: '2', state: 1, votes: { for: '0', against: '0', abstain: '0' } },
      ],
    })
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    await user.click(await screen.findByRole('button', { name: /copy proposal id/i }))
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('123456789012345678')
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
