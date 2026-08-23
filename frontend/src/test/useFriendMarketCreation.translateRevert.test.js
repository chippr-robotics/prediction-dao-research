import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ethers } from 'ethers'
import {
  translateRevert,
  revertReasonFrom,
  SANCTIONED_ADDRESS_SELECTOR,
  ResolutionType,
  ORACLE_RESOLUTION_TYPES,
} from '../hooks/useFriendMarketCreation'

// Light unit tests for the hook surface that's deterministic + pure:
//  - `translateRevert(reason)` maps contract revert reasons to user-friendly strings.
//  - The exported enum + Set match the on-chain enum and the canonical wagerDefaults.
//
// End-to-end hook behavior (signer wiring, gas estimation, on-chain submission)
// is covered indirectly via `FriendMarketsModal.test.jsx` with a mocked
// `onCreate`. That keeps these tests fast and avoids mocking ethers + wagmi.

describe('useFriendMarketCreation: translateRevert', () => {
  it('maps the legacy Polymarket reverts', () => {
    expect(translateRevert('execution reverted: PolymarketRequired'))
      .toMatch(/non-zero conditionId/i)
    expect(translateRevert('execution reverted: PolymarketDisallowed'))
      .toMatch(/must be zero/i)
    expect(translateRevert('execution reverted: AdapterNotSet'))
      .toMatch(/polymarket adapter/i)
  })

  it('maps the new oracle-extensible reverts', () => {
    expect(translateRevert('execution reverted: OracleConditionRequired'))
      .toMatch(/oracle-resolved wagers require a non-zero conditionId/i)
    expect(translateRevert('execution reverted: OracleAdapterNotSet'))
      .toMatch(/no oracle adapter is configured/i)
    expect(translateRevert('execution reverted: UnsupportedOracleResolutionType'))
      .toMatch(/not supported by the registry/i)
  })

  it('maps shared reverts (deadlines, membership, etc.)', () => {
    expect(translateRevert('execution reverted: BadDeadlines'))
      .toMatch(/invalid deadlines/i)
    expect(translateRevert('execution reverted: MembershipDenied'))
      .toMatch(/membership is inactive/i)
    expect(translateRevert('execution reverted: SelfWager'))
      .toMatch(/wager against yourself/i)
    expect(translateRevert('execution reverted: NotAllowedToken'))
      .toMatch(/allowlist/i)
    expect(translateRevert('execution reverted: ConditionAlreadyResolved'))
      .toMatch(/already resolved/i)
  })

  it('maps ERC20 allowance/balance reverts to actionable guidance', () => {
    // createWager pulls the stake via transferFrom; an unconfirmed approval
    // surfaces as an allowance revert (sometimes stripped to "missing revert
    // data" by wallet RPCs). Guide the user to wait for the approval instead.
    expect(translateRevert('execution reverted: ERC20: transfer amount exceeds allowance'))
      .toMatch(/approval has not been confirmed/i)
    expect(translateRevert('ERC20: insufficient allowance'))
      .toMatch(/approval has not been confirmed/i)
    expect(translateRevert('execution reverted: ERC20: transfer amount exceeds balance'))
      .toMatch(/insufficient token balance/i)
  })

  it('names sanctions screening instead of falling through to the raw reason (#1292)', () => {
    const message = translateRevert('execution reverted: SanctionedAddress')
    expect(message).toMatch(/sanctions screening/i)
    expect(message).toMatch(/cannot transact/i)
    // The screened member must not be shown the raw fallback.
    expect(message).not.toMatch(/transaction will fail/i)
  })

  it('does not tell a screened member that nothing was submitted on-chain (#1292)', () => {
    // The guard screens `_createWager` only. On the self-submit leg the stake approval — and the
    // `batchExpireOpen` cleanup — are sent, awaited and PAID FOR before the create simulation that
    // produces this message ever runs, so "nothing was submitted" would be false exactly when a
    // member has just confirmed a wallet prompt. "The wager was not created" is true on every leg.
    const message = translateRevert('execution reverted: SanctionedAddress')
    expect(message).not.toMatch(/nothing was (submitted|sent|moved)/i)
    expect(message).toMatch(/wager was not created/i)
  })

  it('maps EitherRequiresEqualStakes to equal-stakes guidance', () => {
    expect(translateRevert('execution reverted: EitherRequiresEqualStakes'))
      .toMatch(/equal-stakes \(non-leveraged\)/i)
  })

  it('falls back to a generic message for unknown reasons', () => {
    expect(translateRevert('out of gas: 0x1234'))
      .toMatch(/transaction will fail/i)
  })

  it('returns a sentinel for empty input', () => {
    expect(translateRevert('')).toBe('Unknown contract error.')
    expect(translateRevert(null)).toBe('Unknown contract error.')
    expect(translateRevert(undefined)).toBe('Unknown contract error.')
  })
})

describe('useFriendMarketCreation: revertReasonFrom', () => {
  // ISanctionsGuard's errors are not in the registry ABI the frontend ships (the guard reverts
  // *through* the registry call), so ethers can only say "execution reverted (unknown custom
  // error)". Recover the name from the selector — otherwise no `reason.includes('SanctionedAddress')`
  // check could ever fire. (#1292)
  const sanctionedData = `${SANCTIONED_ADDRESS_SELECTOR}${'0'.repeat(24)}${'11'.repeat(20)}`

  it('matches the selector of the error this repo actually compiles', () => {
    // The hardcoded selector is only defensible while it agrees with the Solidity in this build.
    // Derive it from the interface source (the parity pattern of `test/intent/TypehashParity.test.js`):
    // renaming `SanctionedAddress` or changing its arity must fail HERE, not silently return every
    // screened member to "execution reverted (unknown custom error)" with the suite still green.
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../contracts/interfaces/ISanctionsGuard.sol'),
      'utf8',
    )
    const declaration = source.match(/error\s+SanctionedAddress\s*\(([^)]*)\)\s*;/)
    expect(declaration, 'ISanctionsGuard no longer declares SanctionedAddress').not.toBeNull()

    const types = declaration[1]
      .split(',')
      .map((param) => param.trim().split(/\s+/)[0])
      .filter(Boolean)
    const signature = `SanctionedAddress(${types.join(',')})`
    expect(ethers.id(signature).slice(0, 10)).toBe(SANCTIONED_ADDRESS_SELECTOR)
  })

  it('names SanctionedAddress from the revert selector on error.data', () => {
    const err = { data: sanctionedData, shortMessage: 'execution reverted (unknown custom error)' }
    expect(revertReasonFrom(err)).toBe('SanctionedAddress')
    expect(translateRevert(revertReasonFrom(err))).toMatch(/sanctions screening/i)
  })

  it('finds the selector on the nested RPC error shapes ethers uses', () => {
    expect(revertReasonFrom({ info: { error: { data: sanctionedData } } })).toBe('SanctionedAddress')
    expect(revertReasonFrom({ error: { data: sanctionedData } })).toBe('SanctionedAddress')
  })

  it('falls back to the reason ethers already decoded', () => {
    expect(revertReasonFrom({ reason: 'MembershipDenied', data: '0xdeadbeef' })).toBe('MembershipDenied')
    expect(revertReasonFrom({ shortMessage: 'execution reverted: ZeroStake' }))
      .toBe('execution reverted: ZeroStake')
    expect(revertReasonFrom({ message: 'network error' })).toBe('network error')
  })

  it('returns an empty reason for an error carrying nothing usable', () => {
    expect(revertReasonFrom({})).toBe('')
    expect(revertReasonFrom(null)).toBe('')
    expect(revertReasonFrom(undefined)).toBe('')
  })
})

describe('useFriendMarketCreation: exported enum + ORACLE_RESOLUTION_TYPES', () => {
  it('exports the canonical 8-value ResolutionType', () => {
    expect(ResolutionType.Either).toBe(0)
    expect(ResolutionType.Creator).toBe(1)
    expect(ResolutionType.Opponent).toBe(2)
    expect(ResolutionType.ThirdParty).toBe(3)
    expect(ResolutionType.Polymarket).toBe(4)
    expect(ResolutionType.ChainlinkDataFeed).toBe(5)
    expect(ResolutionType.ChainlinkFunctions).toBe(6)
    expect(ResolutionType.UMA).toBe(7)
  })

  it('flags every oracle-resolved type in ORACLE_RESOLUTION_TYPES', () => {
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.Polymarket)).toBe(true)
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.ChainlinkDataFeed)).toBe(true)
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.ChainlinkFunctions)).toBe(true)
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.UMA)).toBe(true)
  })

  it('does NOT flag the local resolution types', () => {
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.Either)).toBe(false)
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.Creator)).toBe(false)
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.Opponent)).toBe(false)
    expect(ORACLE_RESOLUTION_TYPES.has(ResolutionType.ThirdParty)).toBe(false)
  })
})
