/**
 * Perps view WCAG 2.1 AA audits (spec 082 FR-015 / SC-007, spec 083 SC-008) — the ready state in
 * the light and dark themes, with the management surface both OFF (the phase-0 surface, the state
 * CI and most members are in) and ON (the row's manage control audited too).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import userEvent from '@testing-library/user-event'
import { WalletContext } from '../../contexts/WalletContext.js'
import PerpsView from '../../components/perps/PerpsView'

let manageFlag = false
vi.mock('../../config/perps', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    perpsCohortSupported: () => true,
    perpsGatewayUrl: () => 'https://gateway.test',
    perpsManageFeatureEnabled: () => manageFlag,
  }
})

const PAIRS = [
  {
    id: 'gains:137:BTC/USD',
    venue: 'gains',
    chainId: 137,
    symbol: 'BTC/USD',
    base: 'BTC',
    price: 63000,
    fundingRate: 0.0000125,
    fundingIntervalHours: 1,
    openInterestUsd: 8000,
    maxLeverage: 200,
    volume24hUsd: null,
  },
  {
    id: 'hyperliquid:ETH',
    venue: 'hyperliquid',
    chainId: null,
    symbol: 'ETH/USD',
    base: 'ETH',
    price: 3000,
    fundingRate: -0.00002,
    fundingIntervalHours: 1,
    openInterestUsd: 90_000_000,
    maxLeverage: 25,
    volume24hUsd: 4_000_000,
  },
]

const deps = {
  markets: {
    available: () => true,
    fetchPairs: async () => ({
      pairs: PAIRS,
      sources: { gains: { status: 'read', chains: [137] }, hyperliquid: { status: 'degraded', chains: [] } },
      asOf: 'now',
    }),
  },
  positions: {
    available: () => true,
    // GMX positions are read client-side (spec 083 T032); stubbed so this a11y pass never reaches a
    // live endpoint.
    getProvider: () => ({}),
    makeContract: () => ({ getAccountPositions: async () => [] }),
    fetchPositions: async () => ({
      positions: [
        { id: 'hyperliquid:ETH:long', venue: 'hyperliquid', chainId: null, symbol: 'ETH/USD', direction: 'long', sizeUsd: 4500, entryPrice: 3000, leverage: 10, unrealizedPnlUsd: -50 },
        {
          id: 'gains:137:7',
          venue: 'gains',
          chainId: 137,
          symbol: 'BTC/USD',
          direction: 'long',
          sizeUsd: 1000,
          collateralUsd: 100,
          entryPrice: 60_000,
          markPrice: 63_000,
          leverage: 10,
          liquidationPrice: 54_000,
          unrealizedPnlUsd: 50,
        },
      ],
      sources: { hyperliquid: { status: 'read' }, gains: { status: 'read' } },
    }),
  },
  // The stuck-order read (spec 083) is stubbed the same way: GMX resolves to "not deployed" so the
  // Arbitrum log read never runs, and the gateway reports no pending orders.
  orders: {
    fetchPositions: async () => ({ positions: [], pendingOrders: [], sources: { gains: { status: 'read' } } }),
    getProvider: () => ({ getBlockNumber: async () => 1000, getLogs: async () => [] }),
    addressesFor: () => null,
  },
  trade: {
    sendOnChain: async () => ({ receipts: [] }),
    getProvider: () => ({ getBlockNumber: async () => 1000, getLogs: async () => [] }),
    sleep: () => new Promise(() => {}),
  },
  config: {
    fetchConfig: async () => ({
      attribution: { gmx: { refCode: 'fairwins' } },
      hyperliquidBuilderFee: { bps: 5, capBps: 10, source: 'chain' },
    }),
  },
}

async function renderReady(themeClass) {
  const view = render(
    <div className={themeClass}>
      <WalletContext.Provider value={{ address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', isConnected: true }}>
        <PerpsView deps={deps} />
      </WalletContext.Provider>
    </div>,
  )
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  await waitFor(() => expect(screen.getByText('Your positions')).toBeInTheDocument())
  return view
}

beforeEach(() => {
  manageFlag = false
})

describe('PerpsView accessibility', () => {
  it('has no WCAG violations in the light theme', async () => {
    const { container } = await renderReady('theme-light platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme', async () => {
    const { container } = await renderReady('theme-dark platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations with the management controls on, in both themes', async () => {
    manageFlag = true
    for (const theme of ['theme-light platform-fairwins', 'theme-dark platform-fairwins']) {
      const { container, unmount } = await renderReady(theme)
      await waitFor(() => expect(screen.getByRole('button', { name: /close or protect/i })).toBeInTheDocument())
      // The ENTRY control is in this audit too (spec 083 US3) — asserted rather than assumed,
      // because a table cell that stopped rendering it would leave this pass reporting a clean
      // result about markup that is no longer there.
      expect(screen.getByRole('button', { name: /Open a position on BTC\/USD/i })).toBeInTheDocument()
      // Hyperliquid keeps no in-app control at all, so the audit also covers the mixed row set.
      expect(screen.queryByRole('button', { name: /Open a position on ETH\/USD/i })).not.toBeInTheDocument()
      expect(await axe(container)).toHaveNoViolations()
      unmount()
    }
  }, 30000)

  it('has no WCAG violations with the ENTRY SHEET open, in both themes', async () => {
    // The sheet has its own audit driven directly with props; this one audits it AS COMPOSED —
    // over the live pairs table, with the venue-status and balance reads the view supplies.
    manageFlag = true
    for (const theme of ['theme-light platform-fairwins', 'theme-dark platform-fairwins']) {
      const { container, unmount } = await renderReady(theme)
      const open = screen.getByRole('button', { name: /Open a position on BTC\/USD/i })
      await userEvent.click(open)
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
      expect(await axe(container)).toHaveNoViolations()
      unmount()
    }
  }, 30000)
})
