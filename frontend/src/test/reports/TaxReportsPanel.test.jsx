import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TaxReportsPanel from '../../components/wallet/TaxReportsPanel'
import { makeFixtureDataSource, USER, REGISTRY, CHAIN_ID } from '../fixtures/wagers'

const NOW = Date.UTC(2026, 5, 18)

function hookOptions(saveAs) {
  return {
    account: USER,
    chainId: CHAIN_ID,
    createDataSource: () => makeFixtureDataSource(),
    // Exercise the legacy wager-only pipeline against the wager fixtures;
    // ledger-path behavior is covered in reportParity.test.js.
    ledger: null,
    getNetwork: () => ({ name: 'Polygon', isTestnet: false, nativeCurrency: { symbol: 'MATIC' } }),
    getEscrow: () => REGISTRY,
    saveAs,
    now: () => NOW,
  }
}

beforeEach(() => localStorage.clear())

describe('TaxReportsPanel (Story 1 + Story 2)', () => {
  it('generates a report and shows transfer count, totals, and downloads', async () => {
    const saveAs = vi.fn()
    render(<TaxReportsPanel hookOptions={hookOptions(saveAs)} />)

    // Custom range Jan–now 2026 (covers the fixture activity).
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))

    await waitFor(() => expect(screen.getByText(/5 transfer\(s\)/i)).toBeInTheDocument())
    expect(screen.getByText(/Totals/i)).toBeInTheDocument()

    // The PDF is the branded statement (issue #1026); the CSV stays the full
    // machine-readable record and is never narrowed by the statement options.
    fireEvent.click(screen.getByRole('button', { name: /download statement \(pdf\)/i }))
    fireEvent.click(screen.getByRole('button', { name: /download full data \(csv\)/i }))
    expect(saveAs).toHaveBeenCalledTimes(2)

    // a history entry now appears
    await waitFor(() => expect(screen.getByText(/saved reports/i)).toBeInTheDocument())
  })

  it('exports the current month in one click (generates + downloads a PDF)', async () => {
    const saveAs = vi.fn()
    render(<TaxReportsPanel hookOptions={hookOptions(saveAs)} />)

    fireEvent.click(screen.getByRole('button', { name: /export current month/i }))

    // The current month-to-date (Jun 2026) covers the fixture activity, so a
    // report is generated on screen and a single PDF download is triggered.
    await waitFor(() => expect(saveAs).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/current month \(jun 2026\)/i)).toBeInTheDocument()
  })

  it('shows a "no activity" empty state for an empty period', async () => {
    render(<TaxReportsPanel hookOptions={hookOptions(vi.fn())} />)
    fireEvent.click(screen.getByLabelText('Last calendar year'))
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    await waitFor(() => expect(screen.getByText(/no wager activity in this period/i)).toBeInTheDocument())
  })

  it('prompts to connect when no account', () => {
    render(<TaxReportsPanel hookOptions={{ ...hookOptions(vi.fn()), account: null }} />)
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument()
  })
})

/**
 * Spec 067 T107 — the Reporting panel over a period holding a bridge, a
 * liquidity supply, and a wager pool: the three activities a member is most
 * likely to have confused with one another.
 */
describe('TaxReportsPanel — bridge + liquidity (spec 067 FR-036/FR-039a)', () => {
  const TS = Date.UTC(2026, 2, 1)
  const TX = (n) => '0x' + String(n).padStart(2, '0').repeat(32)

  // Pre-enriched ledger entries — buildReport consumes these as-is.
  const ENTRIES = [
    {
      entryId: 'cl:bridge-1:delivered', chainId: CHAIN_ID, class: 'bridge', kind: 'bridge_transfer',
      direction: 'none', status: 'settled', provenance: 'client', txHash: TX(11),
      tokenSymbol: 'USDC', tokenDecimals: 6, amountRaw: '500000000', amount: 500,
      valueUsd: 500, valuationStatus: 'valued', timestamp: TS, timestampProvenance: 'device',
      refs: {
        bridgeId: 'cl:bridge-1', originChainId: CHAIN_ID, destinationChainId: 1,
        srcTxHash: TX(11), dstTxHash: TX(12), bridgeState: 'delivered',
        feeAmountRaw: '1000000', feeBps: 20, settlementProtocol: 'Across',
      },
    },
    {
      entryId: 'cl:liquidity:supply', chainId: CHAIN_ID, class: 'liquidity', kind: 'lp_supply',
      direction: 'out', status: 'settled', provenance: 'client', txHash: TX(20),
      tokenSymbol: 'USDC', tokenDecimals: 6, amountRaw: '200000000', amount: 200,
      valueUsd: 200, valuationStatus: 'valued', timestamp: TS + 3600_000,
      timestampProvenance: 'device',
      refs: { action: 'supply', poolKind: 'trading_lp', feeAmountRaw: '500000', feeBps: 25 },
    },
    {
      entryId: 'oc:pool-join', chainId: CHAIN_ID, class: 'pool', kind: 'pool_join',
      direction: 'out', status: 'settled', provenance: 'onchain', txHash: TX(30),
      tokenSymbol: 'USDC', tokenDecimals: 6, amountRaw: '25000000', amount: 25,
      valueUsd: 25, valuationStatus: 'valued', timestamp: TS + 7200_000,
      timestampProvenance: 'chain', refs: {},
    },
  ]

  const ledger = {
    listEntries: async () => ({ entries: ENTRIES, staleClasses: [], prunedBefore: null }),
  }

  async function generate() {
    render(<TaxReportsPanel hookOptions={{ ...hookOptions(vi.fn()), ledger }} />)
    fireEvent.click(screen.getByLabelText('Custom range'))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))
    await waitFor(() => expect(screen.getByText(/3 activity entries/i)).toBeInTheDocument())
  }

  it('names the wager pool and the liquidity pool distinctly (FR-039a)', async () => {
    await generate()
    expect(screen.getByText(/^Wager Pool:/)).toBeInTheDocument()
    expect(screen.getByText(/^Liquidity:/)).toBeInTheDocument()
    expect(screen.getByText(/^Bridge:/)).toBeInTheDocument()
  })

  it('states that a cross-network move is neither income nor a disposal (FR-036)', async () => {
    await generate()
    expect(screen.getByText(/Moving your own assets between networks is not income/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Moved between your own networks: USD 500\.00 — not income and not a disposal/i),
    ).toBeInTheDocument()
    // The overall is the liquidity supply + the wager pool join only.
    expect(screen.getByText(/Overall: USD 225\.00/)).toBeInTheDocument()
  })

  it('shows the platform fees actually charged as the cost of that activity', async () => {
    await generate()
    expect(screen.getByText(/Platform fees charged: USD 1\.50/)).toBeInTheDocument()
  })
})
