import { describe, it, expect } from 'vitest'
import { deriveTransfersFromWagers } from '../../lib/account/deriveTransfers'

const ME = '0x00000000000000000000000000000000000000Me'.toLowerCase()
const OPP = '0x00000000000000000000000000000000000000Op'.toLowerCase()
const USDC = '0xUsdc'

// 1 USDC in base units (6 decimals) keeps the fixtures readable.
const U = (n) => String(BigInt(n) * 1_000_000n)

const base = {
  token: USDC,
  creatorStake: U(10),
  opponentStake: U(10),
  createdAt: 1000,
  resolvedAt: 2000,
}

describe('deriveTransfersFromWagers (Account dashboard money flows)', () => {
  it('returns nothing without an address', () => {
    expect(deriveTransfersFromWagers({ wagers: [{ id: '1', creator: ME }], address: null })).toEqual([])
  })

  it('skips wagers the member is not a party to', () => {
    const wagers = [{ id: '1', creator: OPP, opponent: '0xother', status: 'active', ...base }]
    expect(deriveTransfersFromWagers({ wagers, address: ME })).toEqual([])
  })

  it('creator deposit is recorded at creation even while open (not yet accepted)', () => {
    const wagers = [{ id: '1', creator: ME, opponent: OPP, status: 'open', ...base, stakeTokenAddress: USDC }]
    const out = deriveTransfersFromWagers({ wagers, address: ME })
    expect(out).toEqual([
      { wagerId: '1', direction: 'deposit', tokenAddress: USDC, amountRaw: U(10), txHash: '', timestamp: 1000 },
    ])
  })

  it('opponent only deposits once the wager is accepted (active+), never while open', () => {
    const open = [{ id: '1', creator: OPP, opponent: ME, status: 'open', ...base, stakeTokenAddress: USDC }]
    expect(deriveTransfersFromWagers({ wagers: open, address: ME })).toEqual([])

    const active = [{ id: '1', creator: OPP, opponent: ME, status: 'active', ...base, stakeTokenAddress: USDC }]
    const out = deriveTransfersFromWagers({ wagers: active, address: ME })
    expect(out).toEqual([
      { wagerId: '1', direction: 'deposit', tokenAddress: USDC, amountRaw: U(10), txHash: '', timestamp: 1000 },
    ])
  })

  it('winner gets a payout of the full pot (creatorStake + opponentStake), no fee', () => {
    const wagers = [{ id: '1', creator: ME, opponent: OPP, winner: ME, status: 'resolved', ...base, stakeTokenAddress: USDC }]
    const out = deriveTransfersFromWagers({ wagers, address: ME })
    expect(out).toEqual([
      { wagerId: '1', direction: 'deposit', tokenAddress: USDC, amountRaw: U(10), txHash: '', timestamp: 1000 },
      { wagerId: '1', direction: 'payout', tokenAddress: USDC, amountRaw: U(20), txHash: '', timestamp: 2000 },
    ])
  })

  it('loser records only their deposit (a realized loss)', () => {
    const wagers = [{ id: '1', creator: ME, opponent: OPP, winner: OPP, status: 'resolved', ...base, stakeTokenAddress: USDC }]
    const out = deriveTransfersFromWagers({ wagers, address: ME })
    expect(out.map((t) => t.direction)).toEqual(['deposit'])
  })

  it('refunded / drawn return each party their own stake', () => {
    for (const status of ['refunded', 'drawn']) {
      const wagers = [{ id: '1', creator: ME, opponent: OPP, status, ...base, stakeTokenAddress: USDC }]
      const out = deriveTransfersFromWagers({ wagers, address: ME })
      expect(out.map((t) => t.direction)).toEqual(['deposit', 'refund'])
      expect(out[1].amountRaw).toBe(U(10))
    }
  })

  it('cancelled / declined refund only the creator (opponent never deposited)', () => {
    for (const status of ['cancelled', 'declined']) {
      const asCreator = deriveTransfersFromWagers({
        wagers: [{ id: '1', creator: ME, opponent: OPP, status, ...base, stakeTokenAddress: USDC }],
        address: ME,
      })
      expect(asCreator.map((t) => t.direction)).toEqual(['deposit', 'refund'])

      const asOpponent = deriveTransfersFromWagers({
        wagers: [{ id: '1', creator: OPP, opponent: ME, status, ...base, stakeTokenAddress: USDC }],
        address: ME,
      })
      expect(asOpponent).toEqual([]) // opponent never staked, so no deposit and no refund
    }
  })

  it('uses createdAt for settlement when resolvedAt is absent', () => {
    const wagers = [{ id: '1', creator: ME, opponent: OPP, status: 'refunded', token: USDC, creatorStake: U(5), opponentStake: U(5), createdAt: 1500, resolvedAt: null }]
    const out = deriveTransfersFromWagers({ wagers, address: ME })
    expect(out.every((t) => t.timestamp === 1500)).toBe(true)
  })
})
