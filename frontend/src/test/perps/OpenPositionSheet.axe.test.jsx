/**
 * OpenPositionSheet WCAG 2.1 AA audits (spec 083, SC-008) — the opening sheet in the light and dark
 * themes, in the three states a member actually meets it in:
 *
 *   1. ready, with the attestation already given (the ordinary case);
 *   2. the busiest it gets — un-attested, so the four-checkbox panel is on screen, with an amount
 *      typed and a live refusal beside it. This is where an unlabelled control, an orphaned error
 *      message or a fieldset with no legend would hide;
 *   3. nothing offered — a paused venue, where the whole form is replaced by an explanation.
 *
 * No network: the trade hook's rail, the fee read, the venue quote, the allowance read and the
 * attestation store are all injected.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { axe } from 'vitest-axe'

import { WalletContext } from '../../contexts/WalletContext'
import OpenPositionSheet from '../../components/perps/OpenPositionSheet'

const ARBITRUM = 42161
const MEMBER = '0xd504dC1ac094F45272f46b25A2874bDab45132Da'
const USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

const PAIR = {
  id: `gains:${ARBITRUM}:BTC/USD`,
  venue: 'gains',
  chainId: ARBITRUM,
  symbol: 'BTC/USD',
  base: 'BTC',
  quote: 'USD',
  price: 60_000,
  fundingRate: 0.00001,
  openInterestUsd: 5_000_000,
  maxLeverage: 150,
}

const OPTION = {
  venue: 'gains',
  chainId: ARBITRUM,
  status: 'open',
  pair: PAIR,
  venueRef: { pairIndex: 1 },
  collaterals: [{ symbol: 'USDC', address: USDC, decimals: 6, collateralIndex: 3, isPrimary: true, usdPrice: 1 }],
  limits: { maxLeverage: 150, minLeverage: 2 },
}

const HOLDINGS = [{ symbol: 'USDC', address: USDC, balance: 1_000_000_000n, decimals: 6, usdValue: 1000 }]

const wallet = { address: MEMBER, chainId: ARBITRUM, loginMethod: 'wallet', signer: {}, sendCalls: vi.fn() }

function depsFor(attested) {
  const gate = { attested }
  return {
    readFee: async () => ({ bps: 5 }),
    readQuote: async () => null,
    readAllowance: async () => 10n ** 30n,
    hasAttested: () => gate.attested,
    subscribeAttestation: () => () => {},
    attestation: {
      state: () => ({ attested: gate.attested, record: null, version: 1, superseded: false, reason: null }),
      record: () => ({ version: 1, items: [], at: 'now' }),
      subscribe: () => () => {},
    },
    trade: {
      sendOnChain: async () => ({ route: 'direct', txHash: `0x${'11'.repeat(32)}`, receipts: [] }),
      getProvider: () => ({ getLogs: async () => [], getBlockNumber: async () => 100 }),
      sleep: () => new Promise(() => {}),
      now: () => 0,
      screenAccount: async () => 'clear',
    },
  }
}

async function renderSheet(themeClass, { attested = true, venueOptions = [OPTION] } = {}) {
  const view = render(
    <div className={themeClass}>
      <WalletContext.Provider value={wallet}>
        <OpenPositionSheet
          pair={PAIR}
          venueOptions={venueOptions}
          holdings={HOLDINGS}
          deps={depsFor(attested)}
          onClose={() => {}}
        />
      </WalletContext.Provider>
    </div>,
  )
  // Let the venue reads settle so the breakdown (and its fee line) is part of the audit.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
  return view
}

describe('OpenPositionSheet accessibility', () => {
  it('has no WCAG violations in the light theme', async () => {
    const { container } = await renderSheet('theme-light platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme', async () => {
    const { container } = await renderSheet('theme-dark platform-fairwins')
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations with the attestation panel and a live refusal on screen', async () => {
    const { container } = await renderSheet('theme-light platform-fairwins', { attested: false })
    await act(async () => {
      // More than the member holds — the refusal renders beside the field, as an alert.
      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '5000' } })
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations in the dark theme with the attestation panel on screen', async () => {
    const { container } = await renderSheet('theme-dark platform-fairwins', { attested: false })
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('has no WCAG violations when no venue is offering an open', async () => {
    const { container } = await renderSheet('theme-light platform-fairwins', {
      venueOptions: [{ ...OPTION, status: 'paused' }],
    })
    expect(screen.queryByRole('button', { name: /Open this/ })).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  }, 20000)
})
