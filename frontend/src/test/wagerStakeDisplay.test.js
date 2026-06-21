import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { toWagerShape } from '../utils/blockchainService'
import { getContractAddressForChain } from '../config/contracts'

// Regression for the My Wagers "Private Bet - 0.000000000001 tokens" bug: toWagerShape derived the stake
// token's decimals/symbol from the build-time chain (137) instead of the CONNECTED chain, so a USDC wager on
// Mordor (63) fell back to 18 decimals + 'tokens'. It must resolve the token against the connected chain.

const MORDOR = 63
const usdc = getContractAddressForChain('paymentToken', MORDOR) // synced Mordor USDC (6 decimals)

function wager(overrides = {}) {
  return {
    creator: '0x1111111111111111111111111111111111111111',
    opponent: ethers.ZeroAddress,
    arbitrator: ethers.ZeroAddress,
    token: usdc,
    creatorStake: 1_000_000n, // 1 USDC at 6 decimals
    opponentStake: 1_000_000n,
    acceptDeadline: 0n,
    resolveDeadline: 0n,
    resolutionType: 0,
    status: 1,
    winner: ethers.ZeroAddress,
    paid: false,
    metadataUri: '',
    polymarketConditionId: ethers.ZeroHash,
    creatorIsYes: false,
    metadataHash: ethers.ZeroHash,
    ...overrides,
  }
}

describe('toWagerShape — chain-aware stake token (My Wagers display)', () => {
  it('formats a USDC stake on the connected chain (Mordor 63) with 6 decimals + USDC symbol', () => {
    const w = toWagerShape('1', wager(), MORDOR)
    expect(w.stakeAmount).toBe('1.0')
    expect(w.creatorStake).toBe('1.0')
    expect(w.stakeTokenSymbol).toBe('USDC')
    // The bug rendered this as 1e6 / 1e18:
    expect(w.stakeAmount).not.toBe('0.000000000001')
  })

  it('reproduces the old bug when the token does not match the (default-chain) config', () => {
    // A token unknown to the resolved chain config → 18 decimals + 'tokens' (the pre-fix behavior). This
    // documents WHY the connected chain must be used — with the right chain the USDC case above is correct.
    const w = toWagerShape('2', wager({ token: '0x000000000000000000000000000000000000dEaD' }), MORDOR)
    expect(w.stakeTokenSymbol).toBe('tokens')
    expect(w.stakeAmount).toBe('0.000000000001')
  })
})
