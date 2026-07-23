/**
 * stakingLedgerSource tests (spec 065, US3/T035) — captureStakingAction maps
 * action types to ledger kind/direction, uses an idempotent client entryId, and
 * the source lists only STAKING-class records.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  captureStakingAction,
  createStakingLedgerSource,
} from '../../data/ledger/sources/stakingLedgerSource'
import { listClientRecords } from '../../data/ledger/ledgerClientStore'
import { LEDGER_CLASS } from '../../data/ledger/constants'

const ACCOUNT = '0x2222222222222222222222222222222222222222'
const CHAIN = 1

beforeEach(() => {
  localStorage.clear()
})

describe('captureStakingAction', () => {
  it('maps stake → out and reward-claim → in', () => {
    captureStakingAction(ACCOUNT, CHAIN, { type: 'stake', txHash: '0xa', optionId: 'liquid:lido', model: 'liquid', tokenSymbol: 'ETH', tokenDecimals: 18, amountRaw: '1000' })
    captureStakingAction(ACCOUNT, CHAIN, { type: 'rewards-claimed', txHash: '0xb', optionId: 'delegated:47', model: 'delegated', tokenSymbol: 'POL', tokenDecimals: 18 })
    const records = listClientRecords(ACCOUNT, CHAIN).filter((r) => r.class === LEDGER_CLASS.STAKING)
    const stake = records.find((r) => r.kind === 'stake')
    const claim = records.find((r) => r.kind === 'reward_claim')
    expect(stake.direction).toBe('out')
    expect(claim.direction).toBe('in')
    expect(stake.class).toBe(LEDGER_CLASS.STAKING)
  })

  it('is idempotent by tx hash (same entryId)', () => {
    captureStakingAction(ACCOUNT, CHAIN, { type: 'withdraw', txHash: '0xc', tokenSymbol: 'POL', tokenDecimals: 18 })
    captureStakingAction(ACCOUNT, CHAIN, { type: 'withdraw', txHash: '0xc', tokenSymbol: 'POL', tokenDecimals: 18 })
    const records = listClientRecords(ACCOUNT, CHAIN).filter((r) => r.class === LEDGER_CLASS.STAKING)
    expect(records).toHaveLength(1)
  })

  it('ignores unknown types and missing txHash', () => {
    captureStakingAction(ACCOUNT, CHAIN, { type: 'nonsense', txHash: '0xd' })
    captureStakingAction(ACCOUNT, CHAIN, { type: 'stake' })
    expect(listClientRecords(ACCOUNT, CHAIN).filter((r) => r.class === LEDGER_CLASS.STAKING)).toHaveLength(0)
  })

  it('source lists only STAKING-class records', async () => {
    captureStakingAction(ACCOUNT, CHAIN, { type: 'stake', txHash: '0xe', tokenSymbol: 'ETH', tokenDecimals: 18 })
    const source = createStakingLedgerSource()
    const listed = await source.list({ account: ACCOUNT, chainId: CHAIN })
    expect(listed.every((r) => r.class === LEDGER_CLASS.STAKING)).toBe(true)
    expect(listed).toHaveLength(1)
  })
})
