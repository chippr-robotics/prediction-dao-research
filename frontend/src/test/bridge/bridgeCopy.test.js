/**
 * bridgeCopy tests (spec 067, T077) — the settlement disclosure names the third
 * party (FR-014), the state copy never claims completion early (FR-009), and the
 * unavailable copy tells the truth per network, including Bitcoin (FR-006/FR-051).
 */
import { describe, it, expect } from 'vitest'
import {
  BRIDGE_TIPS,
  BRIDGE_DISCLOSURE,
  BRIDGE_SETTLEMENT,
  BRIDGE_ACTIVITY_SETTLEMENT_NOTE,
  BRIDGE_STATE_COPY,
  BRIDGE_UNAVAILABLE,
  BRIDGE_NEEDS_ATTENTION_RECOURSE,
  bridgeStateCopy,
  bridgeNetworks,
  bridgeUnavailableCopy,
  noBridgeDestinationCopy,
} from '../../lib/bridge/bridgeCopy'

describe('BRIDGE_DISCLOSURE (FR-014)', () => {
  it('names the settling third party and says delivery depends on it', () => {
    expect(BRIDGE_DISCLOSURE).toContain(BRIDGE_SETTLEMENT.protocol)
    expect(BRIDGE_DISCLOSURE).toMatch(/third-party/i)
    expect(BRIDGE_DISCLOSURE).toMatch(/not guaranteed/i)
    expect(BRIDGE_DISCLOSURE).toMatch(/FairWins never holds/i)
  })

  it('names the same protocol in the activity record', () => {
    expect(BRIDGE_ACTIVITY_SETTLEMENT_NOTE).toContain(BRIDGE_SETTLEMENT.protocol)
  })

  it('promises nothing about speed beyond "usually"', () => {
    expect(BRIDGE_DISCLOSURE).not.toMatch(/\binstant\b|\bguaranteed delivery\b/i)
  })
})

describe('BRIDGE_TIPS', () => {
  it('explains every cost line the quote shows (FR-007)', () => {
    for (const key of ['bridgeFee', 'destinationGas', 'platformFee', 'totalCost', 'amountReceived']) {
      expect(typeof BRIDGE_TIPS[key], key).toBe('string')
      expect(BRIDGE_TIPS[key].length, key).toBeGreaterThan(40)
    }
  })

  it('states the platform fee is capped at the quoted figure (FR-008/FR-028)', () => {
    expect(BRIDGE_TIPS.platformFee).toMatch(/never be charged more/i)
  })

  it('warns about destination gas without implying the asset is at risk (FR-012)', () => {
    expect(BRIDGE_TIPS.destinationGasWarning).toMatch(/arrives and is safe/i)
  })

  it('avoids unexplained jargon', () => {
    const all = Object.values(BRIDGE_TIPS).join(' ')
    expect(all).not.toMatch(/\bliquidity provider\b|\bcanonical\b|\battestation\b|\bslippage\b/i)
  })
})

describe('BRIDGE_STATE_COPY (FR-009/FR-011)', () => {
  it('covers every state the ledger can be in', () => {
    for (const state of [
      'submitted',
      'source_confirmed',
      'in_flight',
      'delivered',
      'refunded',
      'needs_attention',
      'failed',
    ]) {
      expect(BRIDGE_STATE_COPY[state], state).toBeTruthy()
      expect(BRIDGE_STATE_COPY[state].label, state).toBeTruthy()
      expect(BRIDGE_STATE_COPY[state].detail, state).toBeTruthy()
    }
  })

  it('only "delivered" claims the transfer arrived', () => {
    const inProgress = ['submitted', 'source_confirmed', 'in_flight', 'needs_attention']
    for (const state of inProgress) {
      const { label, detail } = BRIDGE_STATE_COPY[state]
      // Negations ("has not arrived yet") are fine; a positive arrival claim is not.
      expect(`${label} ${detail}`, state).not.toMatch(/\bhas arrived\b|\bcompleted?\b|\bdelivered your\b/i)
    }
    expect(BRIDGE_STATE_COPY.delivered.detail).toMatch(/destination network has delivered/i)
  })

  it('the in-flight copy says it has not arrived yet rather than spinning silently', () => {
    expect(BRIDGE_STATE_COPY.source_confirmed.detail).toMatch(/not arrived yet/i)
    expect(BRIDGE_STATE_COPY.needs_attention.detail).toMatch(/still live/i)
  })

  it('needs-attention recourse names what is known and what happens next (FR-011)', () => {
    expect(BRIDGE_NEEDS_ATTENTION_RECOURSE).toMatch(/not been lost/i)
    expect(BRIDGE_NEEDS_ATTENTION_RECOURSE).toMatch(/returned automatically/i)
    expect(BRIDGE_NEEDS_ATTENTION_RECOURSE).toContain(BRIDGE_SETTLEMENT.protocol)
  })

  it('an unknown state gets an honest fallback, not an invented reassurance', () => {
    const copy = bridgeStateCopy('something_new')
    expect(copy.label).toMatch(/unavailable/i)
    expect(copy.detail).toMatch(/cannot confirm/i)
    expect(bridgeStateCopy('delivered')).toBe(BRIDGE_STATE_COPY.delivered)
  })
})

describe('honest unavailable copy (FR-006/FR-006c/FR-051)', () => {
  it('lists the networks where bridging is actually configured', () => {
    const names = bridgeNetworks().map((n) => n.name)
    expect(names).toContain('Polygon')
    expect(names).toContain('Ethereum')
    expect(names).not.toContain('Ethereum Classic')
    expect(names).not.toContain('Mordor')
  })

  it('returns null on a network where bridging is available', () => {
    expect(bridgeUnavailableCopy(137)).toBe(null)
  })

  it('says so plainly on ETC/Mordor and points at where it works', () => {
    const copy = bridgeUnavailableCopy(63)
    expect(copy).toMatch(/not available/i)
    expect(copy).toMatch(/Polygon/)
  })

  it('answers Bitcoin from its string id without touching the EVM registry (spec 061)', () => {
    expect(bridgeUnavailableCopy('bitcoin')).toBe(BRIDGE_UNAVAILABLE.bitcoin)
    expect(BRIDGE_UNAVAILABLE.bitcoin).toMatch(/sending and receiving bitcoin work as they always have/i)
  })

  it('refuses to invent a price when the quoting service is unreachable (FR-053/FR-054)', () => {
    expect(BRIDGE_UNAVAILABLE.gateway).toMatch(/made-up price/i)
    expect(BRIDGE_UNAVAILABLE.gateway).toMatch(/already on their way are unaffected/i)
    expect(BRIDGE_UNAVAILABLE.paused).toMatch(/already on their way are not affected/i)
  })

  it('an empty destination list explains itself and names what would change it (FR-065)', () => {
    const copy = noBridgeDestinationCopy('USDC')
    expect(copy).toContain('USDC')
    expect(copy).toMatch(/pick a different asset/i)
  })
})
