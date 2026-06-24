import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExternalDaoView from '../ExternalDaoView'

// Spec 030 (US5) — every on-chain WRITE in the tracking view routes through run(label, makeTx), which must keep
// the user aware of the activity via the app notification system: a persistent "confirm in your wallet" prompt,
// a persistent "awaiting confirmation" toast while it mines, then a terminal confirmed (with tx hash) / failed
// toast — and a no-wallet warning. These assert that contract end-to-end.

const h = vi.hoisted(() => ({
  showNotification: vi.fn(),
  castVote: vi.fn(),
  readGovernorSummary: vi.fn(),
  readTreasuries: vi.fn(),
  fetchGovernorProposals: vi.fn(),
}))

vi.mock('../../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: h.showNotification }) }))
vi.mock('../governorConnector', () => ({
  readGovernorSummary: (...a) => h.readGovernorSummary(...a),
  readTreasuries: (...a) => h.readTreasuries(...a),
  extraTreasuries: () => [],
  fetchGovernorProposals: (...a) => h.fetchGovernorProposals(...a),
  castVote: (...a) => h.castVote(...a),
  queueProposal: vi.fn(),
  executeProposal: vi.fn(),
  proposeAction: vi.fn(),
}))
vi.mock('../../../config/networks', () => ({
  getNetwork: () => ({ name: 'Ethereum Classic Mordor', explorer: { baseUrl: 'https://etc-mordor.blockscout.com' }, nativeCurrency: { symbol: 'ETC' } }),
}))
// ProposalBuilder → CpAddressField → AddressBookButton → useWallet would throw without a provider.
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../../../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn() }) }))

const record = { id: 1, dao: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', framework: 0, label: 'Olympia DAO' }
const HASH = '0xabcdef0000000000000000000000000000000000000000000000000000001234' // short() → 0xabcd…1234

function renderView(signer) {
  return render(
    <ExternalDaoView record={record} reader={{}} signer={signer} chainId={63} usdcAddress="0x00000000000000000000000000000000000000dc" onBack={() => {}} />
  )
}

describe('ExternalDaoView notifications (spec 030 / US5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.readGovernorSummary.mockResolvedValue({
      name: 'OlympiaGovernor', tokenAddr: '0x0000000000000000000000000000000000000111', tokenName: 'Olympia Member',
      tokenSymbol: 'OLYM', timelock: '0x0000000000000000000000000000000000000222', treasuryNative: 0n,
      votingDelay: '1', votingPeriod: '100', proposalThreshold: '0', countingMode: 'support=bravo', clockMode: 'mode=blocknumber',
    })
    h.readTreasuries.mockResolvedValue([])
    h.fetchGovernorProposals.mockResolvedValue({
      ok: true, partial: false, scannedFrom: 1, scannedTo: 2,
      proposals: [{ id: '7', proposer: '0x00000000000000000000000000000000000000Aa', description: 'Fund dev', targets: [], values: [], calldatas: [], descriptionHash: '0x', voteStart: '1', voteEnd: '2', state: 1, votes: { for: '0', against: '0', abstain: '0' } }],
    })
  })

  it('surfaces confirm → submitted (persistent) → confirmed (with tx hash) for a vote', async () => {
    h.castVote.mockReturnValue({ hash: HASH, wait: vi.fn().mockResolvedValue({ status: 1 }) })
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() => expect(h.castVote).toHaveBeenCalled())
    // in-flight toasts are sticky (duration 0) so they survive slow block times
    expect(h.showNotification).toHaveBeenCalledWith('Vote For: confirm in your wallet…', 'info', 0)
    expect(h.showNotification).toHaveBeenCalledWith('Vote For submitted — awaiting confirmation…', 'info', 0)
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(expect.stringContaining('Vote For confirmed · tx 0xabcd…1234'), 'success')
    )
  })

  it('warns (does not send) when no wallet is connected', async () => {
    const user = userEvent.setup()
    renderView(null)
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    expect(h.showNotification).toHaveBeenCalledWith('Connect a wallet to act on this DAO.', 'warning')
    expect(h.castVote).not.toHaveBeenCalled()
  })

  it('surfaces a revert / rejection as an error toast', async () => {
    h.castVote.mockReturnValue({ hash: HASH, wait: vi.fn().mockRejectedValue(new Error('execution reverted')) })
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() => expect(h.showNotification).toHaveBeenCalledWith('execution reverted', 'error'))
  })

  it('treats a confirmation timeout as "may still confirm" (warning) and releases the busy lock', async () => {
    // A broadcast-but-dropped tx: wait() rejects with ethers v6 TIMEOUT — must NOT look like a failure or a
    // success, and must release busy so the controls are usable again (regression guard for the review finding).
    const timeoutErr = Object.assign(new Error('wait for transaction timeout'), { code: 'TIMEOUT' })
    h.castVote.mockReturnValue({ hash: HASH, wait: vi.fn().mockRejectedValue(timeoutErr) })
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() =>
      expect(h.showNotification).toHaveBeenCalledWith(expect.stringContaining('taking longer than expected'), 'warning', 0)
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /vote for/i })).not.toBeDisabled())
    expect(h.showNotification).not.toHaveBeenCalledWith(expect.stringContaining('confirmed'), 'success')
    expect(h.showNotification).not.toHaveBeenCalledWith(expect.stringContaining('failed'), 'error')
  })
})
