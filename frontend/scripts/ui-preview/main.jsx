/**
 * Design preview for the Reporting section (issue #1026 follow-up).
 *
 * Mounts the REAL panel, with the app's real stylesheets and theme, against
 * fixture data injected through the `hookOptions` seam the panel already
 * exposes for tests. Nothing here reimplements a component — a preview that
 * rebuilt the markup would diverge from what members see, which is the one
 * thing a design harness must not do.
 *
 * Served by Vite in dev only; never imported by the app or its tests.
 * Query params:
 *   ?theme=dark   render in dark mode
 *   ?state=empty  the no-activity state
 *   ?state=error  the generation-failure state
 *   ?sheet=1      open the generate sheet on load
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../../src/index.css'
// theme.css is imported by App.jsx, which this preview does not mount. Without
// it the .theme-dark class is inert and every dark screenshot silently renders
// light — a preview that cannot show a defect is worse than no preview.
import '../../src/theme.css'
import '../../src/pages/WalletPage.css'
import { config } from '../../src/wagmi'
import TaxReportsPanel from '../../src/components/wallet/TaxReportsPanel'
import { LEDGER_CLASS } from '../../src/data/ledger/constants'

const params = new URLSearchParams(window.location.search)
const ACCOUNT = '0x7A16fF8270133F063aAb6C9977183D9e72835428'
const CHAIN_ID = 137
const NOW = Date.UTC(2026, 6, 20, 10, 30)
const DAY = 86400000

/** Ledger entries dense enough to fill the result state realistically. */
function entries() {
  const at = (d, h = 12) => Date.UTC(2026, 6, d, h)
  const hash = (n) => `0x${String(n).padStart(2, '0').repeat(32)}`
  const rows = [
    [LEDGER_CLASS.WAGER, 'deposit', 'out', 250, at(2)],
    [LEDGER_CLASS.TRANSFER, 'transfer_in', 'in', 1200, at(3)],
    [LEDGER_CLASS.WAGER, 'payout', 'in', 940, at(6)],
    [LEDGER_CLASS.EARN, 'vault_deposit', 'out', 2000, at(4)],
    [LEDGER_CLASS.POOL, 'deposit', 'out', 120, at(7)],
    [LEDGER_CLASS.TRANSFER, 'transfer_out', 'out', 85.5, at(8)],
    [LEDGER_CLASS.EARN, 'yield_claim', 'in', 41.28, at(14)],
    [LEDGER_CLASS.WAGER, 'refund', 'in', 500, at(12)],
    [LEDGER_CLASS.MEMBERSHIP, 'membership_purchase', 'out', 25, at(1)],
  ]
  return rows.map(([cls, kind, direction, amount, timestamp], i) => ({
    entryId: `oc:${i}`,
    chainId: CHAIN_ID,
    account: ACCOUNT,
    class: cls,
    kind,
    direction,
    status: 'settled',
    provenance: 'onchain',
    txHash: hash(i + 3),
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
    amount,
    amountRaw: String(Math.round(amount * 1e6)),
    valueUsd: amount,
    valuationStatus: 'valued',
    timestamp,
    timestampProvenance: 'chain',
    counterparty: '0x2fC1a3B4c5D6e7F8091a2B3c4D5e6F7a8B9c0D1E',
    refs: {},
  }))
}

const state = params.get('state')

const hookOptions = {
  account: ACCOUNT,
  chainId: CHAIN_ID,
  now: () => NOW,
  getNetwork: () => ({
    name: 'Polygon',
    isTestnet: false,
    chainId: CHAIN_ID,
    nativeCurrency: { symbol: 'POL', decimals: 18 },
  }),
  getEscrow: () => '0x0000000000000000000000000000000000000001',
  saveAs: (blob, name) => console.log('[preview] download suppressed:', name, blob),
  ledger: {
    listEntries: async () => {
      if (state === 'error') throw new Error('Could not reach the network to read your activity.')
      return { entries: state === 'empty' ? [] : entries(), staleClasses: [], prunedBefore: null }
    },
  },
  // The report builder asks for receipts to price gas; the preview answers
  // without a provider so the panel reaches its ready state instantly.
  createDataSource: () => ({
    getTransactionReceipt: async () => ({ from: ACCOUNT, gasUsed: 120000n, effectiveGasPrice: 30000000000n }),
    enumerateWagers: async () => [],
    getWagerEvents: async () => [],
    getBlock: async () => ({ timestamp: Math.floor(NOW / 1000) }),
  }),
  history: (() => {
    // A couple of saved statements so the history surface is not empty.
    const seeded = [
      { id: 'h1', label: 'June 2026', periodKind: 'lastMonth', from: new Date(NOW - 50 * DAY).toISOString(), to: new Date(NOW - 20 * DAY).toISOString(), createdAt: new Date(NOW - 19 * DAY).toISOString() },
      { id: 'h2', label: 'Q2 2026', periodKind: 'custom', from: new Date(NOW - 140 * DAY).toISOString(), to: new Date(NOW - 50 * DAY).toISOString(), createdAt: new Date(NOW - 48 * DAY).toISOString() },
    ]
    let items = seeded
    return {
      list: () => items,
      add: () => {},
      remove: (_a, _c, id) => { items = items.filter((e) => e.id !== id) },
    }
  })(),
}

if (params.get('theme') === 'dark') {
  document.documentElement.classList.add('theme-dark')
} else {
  document.documentElement.classList.add('theme-light')
}
document.documentElement.classList.add('platform-fairwins')

const queryClient = new QueryClient()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* The REAL nesting from WalletPage: wrapper > page > portal > tab
            content. A preview with its own container would flatter the design
            with padding the app does not actually give it. */}
        <div className="wallet-page-wrapper">
          <div className="wallet-page">
            <div className="wallet-portal-main">
              <div className="tab-content">
                <div className="reports-section" role="tabpanel">
                  <TaxReportsPanel hookOptions={hookOptions} previewOpenSheet={params.get('sheet') === '1'} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
