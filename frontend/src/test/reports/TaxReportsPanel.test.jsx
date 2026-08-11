import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

/** Open the sheet and generate with whatever is currently selected. */
async function generateFromSheet({ period } = {}) {
  fireEvent.click(screen.getByRole('button', { name: /new statement/i }))
  if (period) fireEvent.click(screen.getByRole('radio', { name: period }))
  fireEvent.click(screen.getByRole('button', { name: /generate statement/i }))
}

describe('TaxReportsPanel — the statement centre (issue #1026)', () => {
  it('generates from the sheet with smart defaults and downloads in one pass', async () => {
    const saveAs = vi.fn()
    render(<TaxReportsPanel hookOptions={hookOptions(saveAs)} />)

    await generateFromSheet()

    // The result lands on the page and the file downloads without a second trip.
    await waitFor(() => expect(screen.getByLabelText('Latest statement')).toBeInTheDocument())
    expect(saveAs).toHaveBeenCalledTimes(1)
    // ...and the sheet gets out of the way once it has done its job.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers the finished statement in both formats from the result card', async () => {
    const saveAs = vi.fn()
    render(<TaxReportsPanel hookOptions={hookOptions(saveAs)} />)
    await generateFromSheet()
    await waitFor(() => expect(screen.getByLabelText('Latest statement')).toBeInTheDocument())

    const card = screen.getByLabelText('Latest statement')
    fireEvent.click(within(card).getByRole('button', { name: /pdf/i }))
    fireEvent.click(within(card).getByRole('button', { name: /csv/i }))
    expect(saveAs).toHaveBeenCalledTimes(3) // the generate download, plus these two
  })

  it('shows the figures a member checks before opening the file', async () => {
    render(<TaxReportsPanel hookOptions={hookOptions(vi.fn())} />)
    await generateFromSheet({ period: 'Last 12 months' })
    await waitFor(() => expect(screen.getByLabelText('Latest statement')).toBeInTheDocument())
    const card = screen.getByLabelText('Latest statement')
    for (const label of ['In', 'Out', 'Net', 'Entries']) {
      expect(within(card).getByText(label)).toBeInTheDocument()
    }
  })

  it('says so plainly when a period holds no activity', async () => {
    render(<TaxReportsPanel hookOptions={hookOptions(vi.fn())} />)
    await generateFromSheet({ period: 'Last tax year' })
    await waitFor(() => expect(screen.getByText(/no activity recorded for this period/i)).toBeInTheDocument())
  })

  it('lists saved statements once one has been generated', async () => {
    render(<TaxReportsPanel hookOptions={hookOptions(vi.fn())} />)
    await generateFromSheet()
    await waitFor(() => expect(screen.getByText(/saved statements/i)).toBeInTheDocument())
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
    fireEvent.click(screen.getByRole('button', { name: /new statement/i }))
    fireEvent.click(screen.getByRole('radio', { name: 'Custom range' }))
    fireEvent.change(screen.getByLabelText('Custom start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('Custom end date'), { target: { value: '2026-05-31' } })
    fireEvent.click(screen.getByRole('button', { name: /generate statement/i }))
    await waitFor(() => expect(screen.getByLabelText('Latest statement')).toBeInTheDocument())
  }

  // The per-class breakdown now lives on the statement document rather than on
  // this page (see statementModel/statementPdf tests for FR-039a naming). What
  // the PAGE still owes a member is that the headline figures treat a bridge
  // as neither money in nor money out.
  it('keeps a cross-network move out of money in and money out (FR-036)', async () => {
    await generate()
    const card = screen.getByLabelText('Latest statement')
    // Out is the liquidity supply (200) + the wager pool join (25); the 500
    // bridge is in neither column, and the net is the difference of those two.
    expect(within(card).getByText('$225.00')).toBeInTheDocument()
    expect(within(card).getByText('-$225.00')).toBeInTheDocument()
    expect(within(card).getByText('3')).toBeInTheDocument()
  })
})
