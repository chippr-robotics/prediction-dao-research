/**
 * PositionSheet WCAG 2.1 AA audits (spec 083, SC-008) — the exit sheet in the light and dark
 * themes, in the two states a member actually meets it in: the ready state, and the state where a
 * refusal and a venue status note are both on screen (the busiest it gets, and the one where an
 * unlabelled control or an orphaned error message would hide).
 *
 * No network: the trade hook's rail and the fee read are injected.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { WalletContext } from '../../contexts/WalletContext'
import PositionSheet from '../../components/perps/PositionSheet'
import * as gains from '../../lib/perps/venues/gains'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

const POSITION = {
  id: 'gains:42161:7',
  venue: 'gains',
  chainId: ARBITRUM,
  symbol: 'BTC/USD',
  direction: 'long',
  sizeUsd: 1000,
  collateralUsd: 100,
  entryPrice: 60_000,
  markPrice: 63_000,
  leverage: 10,
  liquidationPrice: 54_000,
  unrealizedPnlUsd: -50,
  venueRef: {
    venue: 'gains',
    chainId: ARBITRUM,
    tradeIndex: gains.tradeIndex(7),
    pairIndex: 1,
    collateralIndex: 3,
    collateralToken: USDC,
    collateralDecimals: 6,
    collateralPrecision: 1_000_000n,
  },
}

const wallet = { address: MEMBER, chainId: ARBITRUM, loginMethod: 'wallet', signer: {}, sendCalls: vi.fn() }

const deps = {
  readFee: async () => ({ bps: 5 }),
  trade: {
    sendOnChain: async () => ({ route: 'direct', txHash: `0x${'11'.repeat(32)}`, receipts: [] }),
    getProvider: () => ({ getLogs: async () => [], getBlockNumber: async () => 100 }),
    sleep: () => new Promise(() => {}),
    now: () => 0,
  },
}

async function renderSheet(themeClass, props = {}) {
  const view = render(
    <div className={themeClass}>
      <WalletContext.Provider value={wallet}>
        <PositionSheet position={POSITION} deps={deps} onClose={() => {}} {...props} />
      </WalletContext.Provider>
    </div>,
  )
  // Let the fee read settle so the breakdown (and its fee line) is part of the audit.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return view
}

describe('PositionSheet accessibility', () => {
  it('has no WCAG violations in the light theme', async () => {
    const { container } = await renderSheet('theme-light platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme', async () => {
    const { container } = await renderSheet('theme-dark platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations with a refusal and a venue warning on screen, in both themes', async () => {
    for (const theme of ['theme-light platform-fairwins', 'theme-dark platform-fairwins']) {
      const { container, unmount } = await renderSheet(theme, { venueStatus: 'paused' })
      // A stop beyond the liquidation price: the refusal, its live region, and a disabled control
      // are all rendered together.
      fireEvent.change(screen.getByLabelText('Stop-loss price'), { target: { value: '50000' } })
      expect(await axe(container)).toHaveNoViolations()
      unmount()
    }
  }, 30000)
})
