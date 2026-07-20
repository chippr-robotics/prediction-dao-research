import { describe, it, expect } from 'vitest'
import {
  selectCoins,
  maxSendable,
  balanceComponents,
  estimateVsize,
  isSelectable,
  dustThreshold,
  DUST_SATS,
} from '../coinSelection'

let seq = 0
const coin = (valueSats, overrides = {}) => ({
  txid: `tx${++seq}`,
  vout: 0,
  valueSats,
  address: 'bc1qtest',
  confirmations: 3,
  classification: 'spendable',
  scriptType: 'p2wpkh',
  stampId: null,
  lockedByTx: null,
  ...overrides,
})

describe('coinSelection (spec 061 — FR-013/FR-014/FR-018/FR-019)', () => {
  describe('selectability (fail-safe)', () => {
    it('only positively-spendable, unlocked coins are selectable', () => {
      expect(isSelectable(coin(1000))).toBe(true)
      expect(isSelectable(coin(1000, { classification: 'protected' }))).toBe(false)
      expect(isSelectable(coin(1000, { classification: 'unverified' }))).toBe(false)
      expect(isSelectable(coin(1000, { classification: 'pending' }))).toBe(false)
      expect(isSelectable(coin(1000, { lockedByTx: 'txabc' }))).toBe(false)
      // unknown/missing classification fails safe
      expect(isSelectable(coin(1000, { classification: undefined }))).toBe(false)
      expect(isSelectable(coin(1000, { classification: 'garbage' }))).toBe(false)
    })

    it('never selects protected/unverified/pending/locked coins at any amount', () => {
      const utxos = [
        coin(100_000, { classification: 'protected', stampId: 'A1' }),
        coin(100_000, { classification: 'unverified' }),
        coin(100_000, { classification: 'pending' }),
        coin(100_000, { lockedByTx: 'inflight' }),
        coin(50_000),
      ]
      const res = selectCoins({ utxos, targetSats: 40_000, feeRate: 2, recipientType: 'p2wpkh' })
      expect(res.ok).toBe(true)
      expect(res.inputs).toHaveLength(1)
      expect(res.inputs[0].valueSats).toBe(50_000)

      // Asking beyond the spendable subset fails even though total is ample.
      const over = selectCoins({ utxos, targetSats: 200_000, feeRate: 2, recipientType: 'p2wpkh' })
      expect(over.ok).toBe(false)
      expect(over.error).toBe('insufficient_funds')
      expect(over.spendableSats).toBe(50_000)
      expect(over.shortfallSats).toBeGreaterThan(0)
    })
  })

  describe('fee and change math', () => {
    it('produces change when the remainder clears dust', () => {
      const utxos = [coin(100_000)]
      const res = selectCoins({ utxos, targetSats: 50_000, feeRate: 10, recipientType: 'p2wpkh' })
      expect(res.ok).toBe(true)
      expect(res.feeSats).toBe(10 * estimateVsize(res.inputs, 'p2wpkh', true, 'p2wpkh'))
      expect(res.changeSats).toBe(100_000 - 50_000 - res.feeSats)
      expect(res.changeSats).toBeGreaterThanOrEqual(dustThreshold('p2wpkh'))
      // conservation: inputs = target + fee + change
      expect(50_000 + res.feeSats + res.changeSats).toBe(100_000)
    })

    it('folds sub-dust change into the fee — never a dust output', () => {
      const feeRate = 2
      const utxos = [coin(60_000)]
      const feeNoChange = feeRate * estimateVsize(utxos, 'p2wpkh', false)
      // Leave a remainder strictly between 0 and dust.
      const target = 60_000 - feeNoChange - 100
      const res = selectCoins({ utxos, targetSats: target, feeRate, recipientType: 'p2wpkh' })
      expect(res.ok).toBe(true)
      expect(res.changeSats).toBe(0)
      expect(res.feeSats).toBe(feeNoChange + 100) // remainder honestly reported as fee
      expect(target + res.feeSats).toBe(60_000) // conservation, nothing stranded
    })

    it('accumulates multiple coins largest-first until covered', () => {
      const utxos = [coin(10_000), coin(30_000), coin(20_000)]
      const res = selectCoins({ utxos, targetSats: 45_000, feeRate: 1, recipientType: 'p2tr' })
      expect(res.ok).toBe(true)
      expect(res.inputs.map((c) => c.valueSats)).toEqual([30_000, 20_000])
    })

    it('rejects sub-dust recipient amounts per output type', () => {
      const utxos = [coin(100_000)]
      const res = selectCoins({ utxos, targetSats: 200, feeRate: 1, recipientType: 'p2wpkh' })
      expect(res).toMatchObject({ ok: false, error: 'amount_below_dust', dustSats: DUST_SATS.p2wpkh })
      const legacy = selectCoins({ utxos, targetSats: 500, feeRate: 1, recipientType: 'p2pkh' })
      expect(legacy).toMatchObject({ ok: false, error: 'amount_below_dust', dustSats: 546 })
    })

    it('vsize estimates are deterministic and type-sensitive', () => {
      const segwitIn = [coin(1, { scriptType: 'p2wpkh' })]
      const taprootIn = [coin(1, { scriptType: 'p2tr' })]
      expect(estimateVsize(segwitIn, 'p2wpkh', false)).toBe(11 + 68 + 31)
      expect(estimateVsize(taprootIn, 'p2tr', true, 'p2wpkh')).toBe(11 + 58 + 43 + 31)
      expect(estimateVsize(segwitIn, 'p2pkh', false)).toBe(11 + 68 + 34)
      expect(estimateVsize(segwitIn, 'p2wsh', false)).toBe(11 + 68 + 43)
      expect(estimateVsize(segwitIn, 'p2sh', false)).toBe(11 + 68 + 32)
    })

    it('throws on invalid fee rates and unknown types (never silent)', () => {
      const utxos = [coin(10_000)]
      expect(() => selectCoins({ utxos, targetSats: 1000, feeRate: 0, recipientType: 'p2wpkh' })).toThrow()
      expect(() => selectCoins({ utxos, targetSats: 1000, feeRate: 1.5, recipientType: 'p2wpkh' })).toThrow()
      expect(() =>
        selectCoins({ utxos: [coin(10_000, { scriptType: 'p2pkh' })], targetSats: 1000, feeRate: 1, recipientType: 'p2wpkh' })
      ).toThrow(/input script type/)
      expect(() => selectCoins({ utxos, targetSats: 1000, feeRate: 1, recipientType: 'op_return' })).toThrow()
    })
  })

  describe('MAX (FR-013)', () => {
    it('MAX consumes every spendable coin, leaves zero remainder', () => {
      const utxos = [
        coin(40_000),
        coin(25_000),
        coin(9_000, { classification: 'protected', stampId: 'S1' }),
        coin(7_000, { classification: 'pending' }),
      ]
      const res = maxSendable({ utxos, feeRate: 5, recipientType: 'p2tr' })
      expect(res.ok).toBe(true)
      expect(res.inputs).toHaveLength(2)
      expect(res.amountSats + res.feeSats).toBe(65_000) // exact, nothing stranded
      expect(res.feeSats).toBe(5 * estimateVsize(res.inputs, 'p2tr', false))
      // and the resulting amount round-trips through selectCoins with no change
      const check = selectCoins({ utxos, targetSats: res.amountSats, feeRate: 5, recipientType: 'p2tr' })
      expect(check.ok).toBe(true)
      expect(check.changeSats).toBe(0)
    })

    it('MAX with nothing spendable / only-dust reports honestly', () => {
      expect(maxSendable({ utxos: [], feeRate: 2, recipientType: 'p2wpkh' })).toMatchObject({
        ok: false,
        error: 'insufficient_funds',
      })
      const dusty = maxSendable({ utxos: [coin(400)], feeRate: 2, recipientType: 'p2wpkh' })
      expect(dusty.ok).toBe(false)
    })
  })

  describe('balance components (data-model.md)', () => {
    it('splits confirmed/pending/protected/spendable and explains total ≠ spendable', () => {
      const utxos = [
        coin(50_000),
        coin(20_000, { lockedByTx: 'inflight' }),
        coin(10_000, { classification: 'protected', stampId: 'S1' }),
        coin(5_000, { classification: 'unverified' }),
        coin(3_000, { classification: 'pending' }),
      ]
      const b = balanceComponents(utxos)
      expect(b.confirmedSats).toBe(85_000)
      expect(b.pendingSats).toBe(3_000)
      expect(b.protectedSats).toBe(15_000) // stamps + fail-safe unverified
      expect(b.spendableSats).toBe(50_000) // excludes locked too
    })
  })
})
