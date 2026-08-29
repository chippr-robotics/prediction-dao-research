/**
 * Group pay — the pure half (recipient list, rail selection, disclosure).
 *
 * The rules under test are the ones that decide whether a member is told the truth about a
 * multi-recipient payment BEFORE they sign it:
 *
 *   - a recipient the platform cannot pay is REFUSED and the refusal names why (a Bitcoin,
 *     Solana or Zcash address is not "invalid" — it is a real address on a chain this release
 *     does not group-pay to, and saying "invalid address" would be a lie about the member's
 *     own clipboard);
 *   - a duplicate or a self-payment is FLAGGED, never refused — both are legitimate things to
 *     want, and the honest response is to say what will happen, not to decide for the member;
 *   - the total is summed in BASE UNITS, so 0.1 + 0.2 is 0.3 and not 0.30000000000000004;
 *   - the rail is derived from the acting identity ALONE, and every identity the app can be in
 *     resolves to something — batch, proposal, sequential, or an honest refusal. There is no
 *     fall-through (spec 088 FR-002).
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_GROUP_RECIPIENTS,
  RECIPIENT_ISSUE,
  GROUP_RAIL,
  classifyRecipientAddress,
  makeRecipient,
  validateRecipients,
  selectGroupRail,
  describeRail,
} from '../../lib/payments/groupPay'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const C = '0x3333333333333333333333333333333333333333'
const SELF = '0x9999999999999999999999999999999999999999'

const BTC_BECH32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'
const BTC_LEGACY = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
const SOL = '11111111111111111111111111111111'
const ZEC_T = 't1KsFmpNo8SSKrpKzRxWMwWaMRSTFVoJEbc'
const ZEC_Z = 'zs1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'

const rows = (list) => list.map((r, i) => ({ id: `r${i}`, raw: r.address, address: r.address, amount: r.amount }))
const codesFor = (result, id) => result.rows.find((r) => r.id === id).issues.map((i) => i.code)

describe('classifyRecipientAddress', () => {
  it('recognises an EVM address', () => {
    expect(classifyRecipientAddress(A).kind).toBe('evm')
    expect(classifyRecipientAddress(A.toLowerCase()).kind).toBe('evm')
  })

  it('recognises Bitcoin addresses (bech32 and legacy) as Bitcoin, not as garbage', () => {
    expect(classifyRecipientAddress(BTC_BECH32).kind).toBe('bitcoin')
    expect(classifyRecipientAddress(BTC_LEGACY).kind).toBe('bitcoin')
  })

  it('recognises Solana and Zcash addresses', () => {
    expect(classifyRecipientAddress(SOL).kind).toBe('solana')
    expect(classifyRecipientAddress(ZEC_T).kind).toBe('zcash')
    expect(classifyRecipientAddress(ZEC_Z).kind).toBe('zcash')
  })

  it('reports empty and unrecognisable input distinctly', () => {
    expect(classifyRecipientAddress('').kind).toBe('empty')
    expect(classifyRecipientAddress('   ').kind).toBe('empty')
    expect(classifyRecipientAddress('not an address at all').kind).toBe('unknown')
    expect(classifyRecipientAddress('0xdeadbeef').kind).toBe('unknown')
  })
})

describe('makeRecipient', () => {
  it('mints a blank row with a stable unique id', () => {
    const a = makeRecipient()
    const b = makeRecipient()
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
    expect(a).toMatchObject({ raw: '', address: '', amount: '' })
  })
})

describe('validateRecipients', () => {
  it('accepts a clean list and totals it in base units', () => {
    const res = validateRecipients(rows([{ address: A, amount: '0.1' }, { address: B, amount: '0.2' }]), {
      decimals: 6,
      balance: 100,
    })
    expect(res.blocking).toBe(false)
    expect(res.count).toBe(2)
    expect(res.totalUnits).toBe(300000n)
    expect(res.total).toBe('0.3')
    expect(res.rows.every((r) => r.issues.length === 0)).toBe(true)
  })

  it('refuses an invalid address', () => {
    const res = validateRecipients(rows([{ address: 'nope', amount: '1' }]), { decimals: 6 })
    expect(codesFor(res, 'r0')).toContain(RECIPIENT_ISSUE.INVALID_ADDRESS)
    expect(res.blocking).toBe(true)
  })

  it('refuses a non-EVM recipient and NAMES the network in the reason', () => {
    const res = validateRecipients(
      rows([{ address: BTC_BECH32, amount: '1' }, { address: SOL, amount: '1' }, { address: ZEC_T, amount: '1' }]),
      { decimals: 6 },
    )
    for (const id of ['r0', 'r1', 'r2']) expect(codesFor(res, id)).toContain(RECIPIENT_ISSUE.NON_EVM)
    expect(res.rows[0].issues[0].message).toMatch(/bitcoin/i)
    expect(res.rows[1].issues[0].message).toMatch(/solana/i)
    expect(res.rows[2].issues[0].message).toMatch(/zcash/i)
    expect(res.blocking).toBe(true)
  })

  it('FLAGS a duplicate on every copy without blocking the batch', () => {
    const res = validateRecipients(rows([{ address: A, amount: '1' }, { address: A, amount: '2' }]), {
      decimals: 6,
      balance: 100,
    })
    expect(codesFor(res, 'r0')).toContain(RECIPIENT_ISSUE.DUPLICATE)
    expect(codesFor(res, 'r1')).toContain(RECIPIENT_ISSUE.DUPLICATE)
    expect(res.rows[0].issues.every((i) => !i.blocking)).toBe(true)
    expect(res.blocking).toBe(false)
    expect(res.totalUnits).toBe(3000000n)
  })

  it('FLAGS a self-payment without blocking it', () => {
    const res = validateRecipients(rows([{ address: SELF, amount: '1' }]), {
      decimals: 6,
      balance: 100,
      selfAddress: SELF.toLowerCase(),
    })
    expect(codesFor(res, 'r0')).toContain(RECIPIENT_ISSUE.SELF)
    expect(res.blocking).toBe(false)
  })

  it('refuses a zero, negative, unparseable or over-precise amount', () => {
    const res = validateRecipients(
      rows([
        { address: A, amount: '0' },
        { address: B, amount: '-1' },
        { address: C, amount: 'abc' },
        { address: '0x4444444444444444444444444444444444444444', amount: '0.0000001' },
      ]),
      { decimals: 6 },
    )
    for (const id of ['r0', 'r1', 'r2', 'r3']) expect(codesFor(res, id)).toContain(RECIPIENT_ISSUE.INVALID_AMOUNT)
    expect(res.blocking).toBe(true)
  })

  it('blocks when the TOTAL exceeds the balance, not when a single row does', () => {
    const res = validateRecipients(rows([{ address: A, amount: '6' }, { address: B, amount: '6' }]), {
      decimals: 6,
      balance: 10,
    })
    expect(res.overBalance).toBe(true)
    expect(res.blocking).toBe(true)
    // Each row on its own is affordable — the failure belongs to the batch, not a recipient.
    expect(res.rows.every((r) => r.issues.length === 0)).toBe(true)
  })

  it('refuses a screening-restricted recipient and leaves the others clean', () => {
    const res = validateRecipients(rows([{ address: A, amount: '1' }, { address: B, amount: '1' }]), {
      decimals: 6,
      balance: 100,
      screening: { [A.toLowerCase()]: 'restricted', [B.toLowerCase()]: 'clear' },
    })
    expect(codesFor(res, 'r0')).toContain(RECIPIENT_ISSUE.RESTRICTED)
    expect(codesFor(res, 'r1')).toEqual([])
    expect(res.blocking).toBe(true)
  })

  it('does not treat uncertain screening as a refusal', () => {
    const res = validateRecipients(rows([{ address: A, amount: '1' }]), {
      decimals: 6,
      balance: 100,
      screening: { [A.toLowerCase()]: 'uncertain' },
    })
    expect(res.blocking).toBe(false)
  })

  it('caps the batch size', () => {
    const many = Array.from({ length: MAX_GROUP_RECIPIENTS + 1 }, (_, i) => ({
      address: `0x${String(i + 1).padStart(40, '0')}`,
      amount: '1',
    }))
    const res = validateRecipients(rows(many), { decimals: 6, balance: 1000 })
    expect(res.tooMany).toBe(true)
    expect(res.blocking).toBe(true)
  })

  it('blocks an empty list and an empty row', () => {
    expect(validateRecipients([], { decimals: 6 }).blocking).toBe(true)
    const res = validateRecipients(rows([{ address: A, amount: '1' }, { address: '', amount: '' }]), {
      decimals: 6,
      balance: 100,
    })
    expect(codesFor(res, 'r1')).toContain(RECIPIENT_ISSUE.EMPTY)
    expect(res.blocking).toBe(true)
  })
})

describe('selectGroupRail', () => {
  it('batches for a passkey account acting as itself', () => {
    expect(selectGroupRail({ actingType: 'personal', isPasskey: true }).rail).toBe(GROUP_RAIL.BATCH_PASSKEY)
  })

  it('sends sequentially for a classic wallet acting as itself', () => {
    expect(selectGroupRail({ actingType: 'personal', isPasskey: false }).rail).toBe(GROUP_RAIL.SEQUENTIAL)
  })

  it('proposes ONE vault transaction when acting as a vault on its own network', () => {
    expect(selectGroupRail({ actingType: 'vault', canActAsVault: true }).rail).toBe(GROUP_RAIL.VAULT_PROPOSAL)
  })

  it('refuses — with the reason — when acting as a vault on the wrong network', () => {
    const r = selectGroupRail({ actingType: 'vault', canActAsVault: false })
    expect(r.rail).toBe(GROUP_RAIL.REFUSED)
    expect(r.reason).toMatch(/network/i)
  })

  it('sends sequentially for recovered and hardware accounts (they sign one at a time)', () => {
    expect(selectGroupRail({ actingType: 'legacy' }).rail).toBe(GROUP_RAIL.SEQUENTIAL)
    expect(selectGroupRail({ actingType: 'hardware' }).rail).toBe(GROUP_RAIL.SEQUENTIAL)
  })

  it('refuses a derived (non-EVM-signing) acting account honestly rather than signing as the wallet', () => {
    const r = selectGroupRail({ actingType: 'derived' })
    expect(r.rail).toBe(GROUP_RAIL.REFUSED)
    expect(r.reason).toBeTruthy()
  })

  it('has no fall-through: an unknown acting kind is refused, never sent', () => {
    expect(selectGroupRail({ actingType: 'something-new' }).rail).toBe(GROUP_RAIL.REFUSED)
  })
})

describe('describeRail', () => {
  it('says a passkey batch is one transaction, all-or-nothing', () => {
    const d = describeRail(GROUP_RAIL.BATCH_PASSKEY, { count: 3, gasless: true, nativeSymbol: 'POL' })
    expect(d.atomic).toBe(true)
    expect(d.submissionLine).toMatch(/one/i)
    expect(d.feeLine).toMatch(/no network fee/i)
  })

  it('never claims gasless for an unsponsored passkey batch', () => {
    const d = describeRail(GROUP_RAIL.BATCH_PASSKEY, { count: 3, gasless: false, nativeSymbol: 'POL' })
    expect(d.feeLine).toMatch(/you pay/i)
    expect(d.feeLine).not.toMatch(/gasless/i)
  })

  it('says a vault batch is one proposal its signers must approve', () => {
    const d = describeRail(GROUP_RAIL.VAULT_PROPOSAL, { count: 4, gasless: false, nativeSymbol: 'POL' })
    expect(d.atomic).toBe(true)
    expect(d.submissionLine).toMatch(/proposal/i)
    expect(d.feeLine).toMatch(/vault/i)
  })

  it('says a sequential run is N transactions and that one failure does not stop the rest', () => {
    const d = describeRail(GROUP_RAIL.SEQUENTIAL, { count: 3, gasless: false, nativeSymbol: 'POL' })
    expect(d.atomic).toBe(false)
    expect(d.submissionLine).toMatch(/3 separate/i)
    expect(d.feeLine).toMatch(/POL/)
    expect(d.outcomeLine).toMatch(/continue|rest|each/i)
  })
})
