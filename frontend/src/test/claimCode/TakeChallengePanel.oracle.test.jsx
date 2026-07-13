import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The accept flow itself is resolution-type agnostic (FR-016) — mock it out.
const accept = vi.fn()
vi.mock('../../hooks/useOpenChallengeAccept', () => ({
  useOpenChallengeAccept: () => ({ accept, busy: false }),
}))

// Live market data holder — each test sets what the Gamma lookup "returns".
const liveHolder = { market: null, isLoading: false, error: null, refresh: vi.fn() }
vi.mock('../../hooks/usePolymarketMarket', () => ({
  usePolymarketMarket: () => liveHolder,
}))

// Open challenges stake the chain stablecoin.
vi.mock('../../hooks/useChainTokens', () => ({
  useChainTokens: () => ({ stable: 'USDC', stableDecimals: 6 }),
}))

import TakeChallengePanel from '../../components/fairwins/TakeChallengePanel'
import { WalletContext } from '../../contexts/WalletContext'

const CONDITION = '0xc0ffee00000000000000000000000000000000000000000000000000000000ab'

// A connected taker — the "Lock In!" accept button only renders with a wallet address.
const connectedWallet = { address: '0xTaker', account: '0xTaker', openConnectModal: () => {} }

const oracleWager = (over = {}) => ({
  resolutionType: 4n, // Polymarket
  polymarketConditionId: CONDITION,
  creatorIsYes: true,
  creatorStake: 10_000_000n, // 10 USDC
  opponentStake: 10_000_000n,
  acceptDeadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  resolveDeadline: BigInt(Math.floor(Date.now() / 1000) + 86400),
  ...over,
})

const sealedTerms = (over = {}) => ({
  description: 'Will ETH flip BTC? — creator takes Yes · settled automatically by Polymarket',
  createdAt: '2026-07-05T00:00:00.000Z',
  oracle: {
    source: 'polymarket',
    conditionId: CONDITION,
    question: 'Will ETH flip BTC?',
    outcomes: ['Yes', 'No'],
    creatorSide: 0,
    endDate: '2026-12-31T00:00:00Z',
    slug: 'will-eth-flip-btc',
    ...over,
  },
})

const liveMarket = (over = {}) => ({
  id: 'm1',
  slug: 'will-eth-flip-btc',
  question: 'Will ETH flip BTC?',
  conditionId: CONDITION,
  endDate: '2026-12-31T00:00:00Z',
  active: true,
  closed: false,
  outcomes: [{ name: 'Yes', price: 0.62 }, { name: 'No', price: 0.38 }],
  ...over,
})

function renderPanel({ wager = oracleWager(), terms = sealedTerms(), termsUnavailable = false, needsMembership = false } = {}) {
  return render(
    <WalletContext.Provider value={connectedWallet}>
      <TakeChallengePanel
        code="river tiger kite zoo"
        match={{ wagerId: 1n, wager, terms, termsUnavailable, needsMembership }}
        onClose={() => {}}
      />
    </WalletContext.Provider>
  )
}

describe('TakeChallengePanel — oracle bet summary (spec 041, US2)', () => {
  beforeEach(() => {
    accept.mockReset()
    Object.assign(liveHolder, { market: null, isLoading: false, error: null })
  })

  it('shows the complete bet on one view: question, YOUR side, stake, payout, deadlines (SC-004)', () => {
    liveHolder.market = liveMarket()
    renderPanel()

    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
    // Creator took YES → the taker gets NO, spelled out.
    expect(screen.getByText(/you take:/i).parentElement).toHaveTextContent(/No/)
    expect(screen.getByText(/creator holds:/i).parentElement).toHaveTextContent(/Yes/)
    // Stake + payout from the on-chain equal stakes.
    expect(screen.getByLabelText(/stake and payout/i)).toHaveTextContent(/10 USDC/)
    expect(screen.getByLabelText(/stake and payout/i)).toHaveTextContent(/20 USDC/)
    // Deadlines (existing block still renders).
    expect(screen.getByText(/take by/i)).toBeInTheDocument()
    expect(screen.getByText(/resolve by/i)).toBeInTheDocument()
    // Live context row with prices + open status.
    expect(screen.getByRole('status')).toHaveTextContent(/Yes 62¢ · No 38¢/)
    expect(screen.getByRole('status')).toHaveTextContent(/market open/i)
    // Public market link from the sealed slug.
    expect(screen.getByRole('link', { name: /view on polymarket/i }))
      .toHaveAttribute('href', 'https://polymarket.com/market/will-eth-flip-btc')
  })

  it('names Polymarket as the settlement source with a plain-language explanation — live AND degraded (FR-013/SC-005)', () => {
    const badge = () => screen.getByText(/settled automatically by/i, { selector: '.tc-oracle-badge-text' })
    liveHolder.market = liveMarket()
    const live = renderPanel()
    expect(badge()).toHaveTextContent(/Polymarket/)
    expect(screen.getByText(/neither you, the creator, nor anyone else/i)).toBeInTheDocument()
    live.unmount()

    Object.assign(liveHolder, { market: null, error: 'down' })
    renderPanel()
    expect(badge()).toHaveTextContent(/Polymarket/)
  })

  it('degraded state: sealed terms still render the bet, unavailability is disclosed, accept stays enabled (FR-014)', () => {
    Object.assign(liveHolder, { market: null, error: 'network down' })
    renderPanel()

    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
    expect(screen.getByText(/live market info unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lock in/i })).toBeEnabled()
  })

  it('side labels follow on-chain creatorIsYes in both directions (D6)', () => {
    liveHolder.market = liveMarket()
    const a = renderPanel({ wager: oracleWager({ creatorIsYes: false }) })
    expect(screen.getByText(/you take:/i).parentElement).toHaveTextContent(/Yes/)
    a.unmount()

    renderPanel({ wager: oracleWager({ creatorIsYes: true }) })
    expect(screen.getByText(/you take:/i).parentElement).toHaveTextContent(/No/)
  })

  it('flags a sealed oracle block that does not match the on-chain linkage (honest state)', () => {
    liveHolder.market = liveMarket()
    renderPanel({ terms: sealedTerms({ conditionId: '0x' + 'ab'.repeat(32) }) })
    expect(screen.getByText(/doesn't match the market this challenge is actually linked to/i)).toBeInTheDocument()
  })

  it('renders from live data alone for a legacy bundle without an oracle block (no false warning)', () => {
    liveHolder.market = liveMarket()
    renderPanel({ terms: { description: 'legacy' } })
    expect(screen.getByText('Will ETH flip BTC?')).toBeInTheDocument()
    expect(screen.queryByText(/doesn't match the market/i)).toBeNull()
  })

  it('warns (but does not block) when the market has closed without a public outcome (FR-015)', () => {
    liveHolder.market = liveMarket({ closed: true, outcomes: [{ name: 'Yes', price: 0.7 }, { name: 'No', price: 0.3 }] })
    renderPanel()
    expect(screen.getByText(/already closed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /lock in/i })).toBeEnabled()
  })

  it('blocks acceptance with an explanation when the outcome is already public (FR-015/D8)', () => {
    liveHolder.market = liveMarket({ closed: true, outcomes: [{ name: 'Yes', price: 1 }, { name: 'No', price: 0 }] })
    renderPanel()
    const btn = screen.getByRole('button', { name: /lock in/i })
    expect(btn).toBeDisabled()
    expect(screen.getByText(/can no longer be taken fairly/i)).toBeInTheDocument()
    expect(screen.getByText(/can no longer be taken fairly/i).parentElement).toHaveTextContent(/Yes/)
  })

  it('non-oracle challenges are unchanged apart from the new stake/payout line (FR-018)', () => {
    renderPanel({
      wager: oracleWager({ resolutionType: 0n, polymarketConditionId: '0x' + '0'.repeat(64) }),
      terms: { description: 'plain user-defined bet' },
    })
    expect(screen.queryByText(/settled automatically by/i)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByLabelText(/stake and payout/i)).toHaveTextContent(/10 USDC/)
    expect(screen.getByRole('button', { name: /lock in/i })).toBeEnabled()
  })
})
