import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ClearPathPanel from '../ClearPathPanel'

// Spec 030/042 + network-agnostic follow-up — the ClearPath panel: lists external DAOs across every supported
// network at once, opens a live tracking view (Olympia), registers/tracks a new DAO on a chosen network, and
// shows a non-blocking switch prompt when the wallet isn't on a ClearPath-capable network (the list itself
// never disables). No mock data in the product — the tests mock the hook/connector to drive the components
// deterministically.

const switchChainAsync = vi.fn().mockResolvedValue({})
vi.mock('wagmi', () => ({ useSwitchChain: () => ({ switchChainAsync, isPending: false }) }))

// A stable reader instance — `readerFor` must return the SAME reference across renders (like the real hook's
// cached provider), or an effect keyed on `reader` identity re-fires every render and loops forever.
const STABLE_READER = {}
const cp = {
  isSupported: true,
  chainId: 63,
  chainIds: [63],
  hasRegistryFor: (id) => Number(id) === 63,
  reader: STABLE_READER,
  readerFor: () => STABLE_READER,
  signer: {},
  account: '0xabc',
  isConnected: true,
  readRoute: 'public',
  setReadRoute: vi.fn(),
  listExternalDAOs: vi.fn(),
  registerExternalDAO: vi.fn(),
  trackDAO: vi.fn(),
  untrackDAO: vi.fn(),
}
vi.mock('../useClearPath', () => ({ useClearPath: () => cp }))
vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
// ExternalDaoView (rendered within) now reads sendCalls/loginMethod/chainId from useWallet (passkey rail +
// switch-to-act gating); these tests drive the classic signer-prop path on the SAME chain as the DAO (63) by
// default — a `mockReturnValue` override lets one test move the wallet to a different chain.
const useWalletMock = vi.fn(() => ({ loginMethod: 'injected', sendCalls: undefined, chainId: 63 }))
vi.mock('../../../hooks/useWalletManagement', () => ({ useWallet: (...a) => useWalletMock(...a) }))

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
// Spec 042 — ExternalDaoView reads/acts through the connector resolver + data-source router; mock those with the
// same fakes so the live tracking view renders deterministically.
vi.mock('../connectors', () => ({
  getConnector: () => ({
    framework: 0,
    readSummary: (...a) => conn.readGovernorSummary(...a),
    readTreasuries: (...a) => conn.readTreasuries(...a),
    extraTreasuries: () => [{ label: 'Olympia Treasury', address: '0x035b2e3c189B772e52F4C3DA6c45c84A3bB871bf' }],
    detectTreasuryFunding: (...a) => conn.detectTreasuryFunding(...a),
    readVoterState: (...a) => conn.readVoterState(...a),
    readProposalEta: (...a) => conn.readProposalEta(...a),
    explainTxError: (e) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed.',
    castVote: vi.fn(),
    queue: vi.fn(),
    execute: vi.fn(),
    propose: vi.fn(),
  }),
  detectFramework: () => Promise.resolve(0),
}))
vi.mock('../daoDataSource', () => ({
  fetchDaoProposals: async () => {
    const r = await conn.fetchGovernorProposals()
    return {
      ok: r.ok,
      kind: 'onchain',
      proposals: r.proposals || [],
      status: r.ok ? (r.proposals?.length ? 'ok' : 'empty') : 'error',
      partial: !!r.partial,
      scannedFrom: r.scannedFrom,
      scannedTo: r.scannedTo,
      error: r.error,
    }
  },
}))

vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({
    name: 'Ethereum Classic Mordor',
    explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' },
    nativeCurrency: { symbol: 'ETC' },
  }),
}))
vi.mock('../../../config/contracts', () => ({ getContractAddressForChain: () => null }))

// CpAddressField (governor/recipient inputs) pulls in AddressBookButton → useWallet, which throws without a
// WalletProvider. Stub the wallet-scoped hooks so register + tracking views render the real fields in tests.
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../../../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn(), screenOne: () => Promise.resolve('clear') }) }))

const OLYMPIA = '0xB85dbc899472756470EF4033b9637ff8fa2FD23D'
const olympiaRecord = { id: 1, dao: OLYMPIA, framework: 0, label: 'Olympia DAO', registrant: '0xabc', registeredAt: 1700000000, chainId: 63, networkName: 'Ethereum Classic Mordor' }

describe('ClearPathPanel (spec 030/042, network-agnostic)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cp.isSupported = true
    cp.chainId = 63
    cp.chainIds = [63]
    useWalletMock.mockReturnValue({ loginMethod: 'injected', sendCalls: undefined, chainId: 63 })
    cp.listExternalDAOs.mockResolvedValue([olympiaRecord])
    conn.readGovernorSummary.mockResolvedValue({ clockMode: 'mode=blocknumber' })
    conn.fetchGovernorProposals.mockResolvedValue({ ok: true, proposals: [], scannedFrom: 16000000, scannedTo: 16500000, partial: false })
    conn.readTreasuries.mockResolvedValue([])
    conn.readVoterState.mockResolvedValue({ hasVoted: false, votingPower: null, support: null })
    conn.readProposalEta.mockResolvedValue(null)
    conn.detectTreasuryFunding.mockResolvedValue(null)
  })

  it('shows a non-blocking switch notice on an unsupported network, but still lists DAOs from every network', async () => {
    cp.isSupported = false
    render(<ClearPathPanel />)
    expect(screen.getByText(/doesn't run ClearPath/i)).toBeInTheDocument()
    expect(await screen.findByText('Olympia DAO')).toBeInTheDocument()
  })

  it('lists external DAOs with a network badge', async () => {
    render(<ClearPathPanel />)
    expect(await screen.findByText('Olympia DAO')).toBeInTheDocument()
    expect(screen.getByText('OpenZeppelin Governor')).toBeInTheDocument()
    expect(screen.getByText('Ethereum Classic Mordor')).toBeInTheDocument()
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
    // US5: an Active proposal offers vote actions, enabled since the wallet is on the DAO's own chain
    const voteFor = screen.getByRole('button', { name: /vote for/i })
    expect(voteFor).toBeInTheDocument()
    expect(voteFor).not.toBeDisabled()
  })

  it('disables vote actions and offers a switch prompt when the wallet is on a different network', async () => {
    conn.fetchGovernorProposals.mockResolvedValue({
      ok: true, partial: false, scannedFrom: 16000000, scannedTo: 16500000,
      proposals: [
        { id: '42', proposer: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', description: 'Fund core dev', targets: [], values: [], calldatas: [], descriptionHash: '0x', voteStart: '1', voteEnd: '2', state: 1, votes: { for: '3', against: '1', abstain: '0' } },
      ],
    })
    // Two networks in scope; the wallet is connected to the OTHER one (137, not the DAO's own 63).
    cp.chainId = 137
    cp.chainIds = [63, 137]
    useWalletMock.mockReturnValue({ loginMethod: 'injected', sendCalls: undefined, chainId: 137 })
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(await screen.findByText('Olympia DAO'))
    expect(await screen.findByRole('button', { name: /^switch to ethereum classic mordor$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /vote for/i })).toBeDisabled()
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

  it('validates then registers a new external DAO on the selected network', async () => {
    conn.validateGovernor.mockResolvedValue({ ok: true, name: 'OlympiaGovernor', reason: '' })
    cp.registerExternalDAO.mockResolvedValue({})
    cp.trackDAO.mockResolvedValue({})
    const user = userEvent.setup()
    render(<ClearPathPanel />)
    await user.click(screen.getByRole('tab', { name: /register/i }))
    await user.type(screen.getByLabelText(/governor address/i), OLYMPIA)
    await user.click(screen.getByRole('button', { name: /^validate$/i }))
    expect(await screen.findByText(/Recognized governance contract/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /register dao/i }))
    await waitFor(() =>
      expect(cp.trackDAO).toHaveBeenCalledWith(
        expect.objectContaining({ address: OLYMPIA, framework: 0, chainId: 63 })
      )
    )
  })
})
