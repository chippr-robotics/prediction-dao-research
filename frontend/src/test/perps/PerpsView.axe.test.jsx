/** Perps view WCAG 2.1 AA audits (spec 082, FR-015 / SC-007) — ready state, light and dark themes. */
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { WalletContext } from '../../contexts/WalletContext.js'
import PerpsView from '../../components/perps/PerpsView'

vi.mock('../../config/perps', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, perpsCohortSupported: () => true, perpsGatewayUrl: () => 'https://gateway.test' }
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
    fetchPositions: async () => ({
      positions: [
        { id: 'hyperliquid:ETH:long', venue: 'hyperliquid', chainId: null, symbol: 'ETH/USD', direction: 'long', sizeUsd: 4500, entryPrice: 3000, leverage: 10, unrealizedPnlUsd: -50 },
      ],
      sources: { hyperliquid: { status: 'read' } },
    }),
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

describe('PerpsView accessibility', () => {
  it('has no WCAG violations in the light theme', async () => {
    const { container } = await renderReady('theme-light platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme', async () => {
    const { container } = await renderReady('theme-dark platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)
})
