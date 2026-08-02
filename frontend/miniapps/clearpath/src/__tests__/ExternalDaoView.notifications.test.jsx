import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExternalDaoView from '../ExternalDaoView'
import { hostRef, resetHost } from './_host'
vi.mock('@fairwins/miniapp-sdk', () => ({ useMiniAppHost: () => hostRef.current }))

// Spec 030 (US5) — every on-chain WRITE in the tracking view routes through run(label, makeTx), which must keep
// the user aware of the activity via the app notification system: a persistent "confirm in your wallet" prompt,
// a persistent "awaiting confirmation" toast while it mines, then a terminal confirmed (with tx hash) / failed
// toast — and a no-wallet warning. These assert that contract end-to-end.

const h = vi.hoisted(() => ({
  showNotification: vi.fn(),
  encode: vi.fn(() => ({ to: '0x00000000000000000000000000000000000000d0', data: '0xfeed' })),
  readGovernorSummary: vi.fn(),
  readTreasuries: vi.fn(),
  fetchGovernorProposals: vi.fn(),
}))

// The view now reads sendCalls/loginMethod/chainId from useWallet (passkey rail + switch-to-act gating); these
// tests drive the classic signer-prop path on the SAME chain as the DAO (63, matching renderView below) by
// default — a `mockReturnValue` override lets one test move the wallet to a different chain.
vi.mock('../governorConnector', () => ({
  readGovernorSummary: (...a) => h.readGovernorSummary(...a),
  readTreasuries: (...a) => h.readTreasuries(...a),
  extraTreasuries: () => [],
  detectTreasuryFunding: () => Promise.resolve(null),
  fetchGovernorProposals: (...a) => h.fetchGovernorProposals(...a),
  readVoterState: () => Promise.resolve({ hasVoted: null, votingPower: null, support: null }),
  readProposalEta: () => Promise.resolve(null),
  explainTxError: (e) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed.',
  encode: (...a) => h.encode(...a),
  queueProposal: vi.fn(),
  executeProposal: vi.fn(),
  proposeAction: vi.fn(),
}))
// Spec 042 — ExternalDaoView now resolves reads/actions through the pluggable connector layer + data-source
// router, so drive those instead of the relocated governorConnector module.
// STABLE CONNECTOR INSTANCE. The real `getConnector` returns from a static per-framework map, so
// its result has a fixed identity; a mock that built a fresh object per call made `connector` a
// changing dependency of the view's effects, which re-ran, set state, re-rendered — an infinite
// loop that exhausted the heap rather than failing an assertion.
const CONNECTOR = {
    framework: 0,
    readSummary: (...a) => h.readGovernorSummary(...a),
    readTreasuries: (...a) => h.readTreasuries(...a),
    extraTreasuries: () => [],
    detectTreasuryFunding: () => Promise.resolve(null),
    readVoterState: () => Promise.resolve({ hasVoted: null, votingPower: null, support: null }),
    readProposalEta: () => Promise.resolve(null),
    explainTxError: (e) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed.',
    encode: (...a) => h.encode(...a),
    queue: vi.fn(),
    execute: vi.fn(),
    propose: vi.fn(),
}
vi.mock('../connectors', () => ({
  getConnector: () => CONNECTOR,
  detectFramework: () => Promise.resolve(0),
}))
vi.mock('../daoDataSource', () => ({
  fetchDaoProposals: async () => {
    const r = await h.fetchGovernorProposals()
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

const record = { id: 1, dao: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', framework: 0, label: 'Olympia DAO' }
const HASH = '0xabcdef0000000000000000000000000000000000000000000000000000001234' // short() → 0xabcd…1234

function renderView(_unusedSigner, account = '0x0000000000000000000000000000000000000Acc') {
  return render(
    <ExternalDaoView record={record} reader={{}} account={account} chainId={63} usdcAddress="0x00000000000000000000000000000000000000dc" onBack={() => {}} />
  )
}

describe('ExternalDaoView notifications (spec 030 / US5)', () => {
  let toast

  beforeEach(() => {
    vi.clearAllMocks()
    toast = resetHost({ chainId: 63 }).toast.show
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
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() => expect(hostRef.current.wallet.submit).toHaveBeenCalled())
    // in-flight toasts are sticky (duration 0) so they survive slow block times
    expect(toast).toHaveBeenCalledWith('Vote For: confirm in your wallet…', 'info')
    expect(toast).toHaveBeenCalledWith('Vote For submitted — awaiting confirmation…', 'info')
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('Vote For confirmed · tx 0xabcd…1234'), 'success')
    )
  })

  it('warns (does not send) when no wallet is connected', async () => {
    // The wallet is the HOST's now — there is no signer prop to withhold.
    toast = resetHost({ chainId: 63, wallet: { isConnected: false } }).toast.show
    const user = userEvent.setup()
    renderView(null)
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    expect(toast).toHaveBeenCalledWith('Connect a wallet to act on this DAO.', 'warning')
    expect(hostRef.current.wallet.submit).not.toHaveBeenCalled()
  })

  it('surfaces a revert / rejection as an error toast', async () => {
    toast = resetHost({
      chainId: 63,
      wallet: {
        submit: vi.fn(async () => {
          const r = { kind: 'sent', txHash: '0xabcdef0000000000000000000000000000000000000000000000000000001234', safeTxHash: null }
          Object.defineProperty(r, 'wait', { enumerable: false, value: () => Promise.reject(new Error('execution reverted')) })
          return Object.freeze(r)
        }),
      },
    }).toast.show
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('execution reverted', 'error'))
  })

  /*
   * Screening moved INTO `host.wallet.submit` (spec 073). The app no longer pre-screens, so it
   * does call submit — and the host refuses before touching any rail. That is strictly stronger
   * than the old app-side check, which a package could simply have skipped. What this test pins is
   * that the refusal reaches the member in the host's words, not an internal string.
   */
  it('spec 042 (FR-013): surfaces the host refusal for a sanctions-restricted account', async () => {
    toast = resetHost({ sanctioned: true }).toast.show
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('restricted by sanctions'), 'error'))
    // Nothing was CONFIRMED — the host refused inside submit, before any rail.
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('confirmed'), 'success')
  })

  it('treats a confirmation timeout as "may still confirm" (warning) and releases the busy lock', async () => {
    // A broadcast-but-dropped tx: wait() rejects with ethers v6 TIMEOUT — must NOT look like a failure or a
    // success, and must release busy so the controls are usable again (regression guard for the review finding).
    const timeoutErr = Object.assign(new Error('confirmation timed out'), { code: 'TIMEOUT' })
    toast = resetHost({
      chainId: 63,
      wallet: {
        submit: vi.fn(async () => {
          const r = { kind: 'sent', txHash: '0xabcdef0000000000000000000000000000000000000000000000000000001234', safeTxHash: null }
          Object.defineProperty(r, 'wait', { enumerable: false, value: () => Promise.reject(timeoutErr) })
          return Object.freeze(r)
        }),
      },
    }).toast.show
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /vote for/i }))
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringContaining('taking longer than expected'), 'warning')
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /vote for/i })).not.toBeDisabled())
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('confirmed'), 'success')
    expect(toast).not.toHaveBeenCalledWith(expect.stringContaining('failed'), 'error')
  })

  it('network-agnostic follow-up: disables voting and offers a switch prompt when the wallet is on a different chain than the DAO', async () => {
    toast = resetHost({ chainId: 137 }).toast.show // the DAO is on 63 — wallet is elsewhere
    const user = userEvent.setup()
    renderView({})
    const voteFor = await screen.findByRole('button', { name: /vote for/i })
    expect(voteFor).toBeDisabled()
    expect(await screen.findByRole('button', { name: /^switch to mordor$/i })).toBeInTheDocument()
    await user.click(voteFor)
    expect(hostRef.current.wallet.submit).not.toHaveBeenCalled()
  })

  it('network-agnostic follow-up: the switch button asks the HOST to move to the DAO’s own chain', async () => {
    toast = resetHost({ chainId: 137 }).toast.show
    const user = userEvent.setup()
    renderView({})
    await user.click(await screen.findByRole('button', { name: /^switch to mordor$/i }))
    expect(hostRef.current.wallet.switchChain).toHaveBeenCalledWith(63)
  })
})
