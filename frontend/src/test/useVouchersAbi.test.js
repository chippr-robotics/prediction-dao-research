import { describe, it, expect } from 'vitest'
import { MEMBERSHIP_VOUCHER_ABI } from '../abis/MembershipVoucher'
import { MEMBERSHIP_MANAGER_ABI } from '../abis/MembershipManager'

// Regression guard for the "(intermediate value).getTierConfig is not a function" bug:
// useVouchers builds ethers contracts from these ABIs and calls the functions below.
// If a synced/mirrored ABI ever drops one, minting/redeeming breaks at runtime — these
// tests fail loudly at build time instead.
const hasFn = (abi, name) =>
  abi.some((e) => e.type === 'function' && e.name === name)

describe('useVouchers ABI surface', () => {
  it('MembershipVoucher ABI exposes the functions the voucher contract is called with', () => {
    for (const fn of ['mint', 'voucherInfo', 'ownerOf']) {
      expect(hasFn(MEMBERSHIP_VOUCHER_ABI, fn), `voucher ABI missing ${fn}`).toBe(true)
    }
  })

  it('MembershipManager ABI exposes the functions the manager contract is called with', () => {
    for (const fn of ['getTierConfig', 'redeemVoucher']) {
      expect(hasFn(MEMBERSHIP_MANAGER_ABI, fn), `manager ABI missing ${fn}`).toBe(true)
    }
  })
})
