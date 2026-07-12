/**
 * useVouchers — passkey rail (spec 041/050). A passkey smart-account session has no ethers signer,
 * so buy/gift/redeem/transfer must route through WalletContext.sendCalls (one sponsored UserOp,
 * approve+action batched) instead of throwing "Connect a wallet". Reads use the session read provider.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: vi.fn() }))
vi.mock('../config/contracts', () => ({
  getContractAddressForChain: vi.fn(
    (key) =>
      ({
        membershipVoucher: '0x' + 'a1'.repeat(20),
        membershipManager: '0x' + 'b2'.repeat(20),
        voucherBatchMinter: '0x' + 'c3'.repeat(20),
        paymentToken: '0x' + 'd4'.repeat(20),
      }[key] ?? null)
  ),
  getDeploymentBlockForChain: vi.fn(() => 0),
}))
// The redeem gasless seam is signer-only; stub it so the passkey branch (which bypasses it) is isolated.
vi.mock('../lib/relay/useGaslessWrite', () => ({ useGaslessWrite: () => ({ run: vi.fn() }) }))

// Mock only ethers.Contract reads; keep Interface/isAddress/ZeroHash real so calldata is genuinely
// encoded. A real `function` (not an arrow) so `new ethers.Contract(...)` constructs, and `.interface`
// is a real Interface for encodeFunctionData.
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers')
  const RealInterface = actual.ethers.Interface
  function FakeContract(_addr, abi) {
    this.getTierConfig = vi.fn().mockResolvedValue({ active: true, priceUSDC: 1_000000n })
    this.allowance = vi.fn().mockResolvedValue(0n)
    this.interface = new RealInterface(abi)
  }
  return { ...actual, ethers: { ...actual.ethers, Contract: FakeContract } }
})

import { useWallet } from '../hooks/useWalletManagement'
import { useVouchers } from '../hooks/useVouchers'

const MANAGER = '0x' + 'b2'.repeat(20)
const VOUCHER = '0x' + 'a1'.repeat(20)
const MINTER = '0x' + 'c3'.repeat(20)
const TOKEN = '0x' + 'd4'.repeat(20)
const ACCOUNT = '0x' + '11'.repeat(20)
const OTHER = '0x' + '22'.repeat(20)
const ROLE = '0x' + '00'.repeat(31) + '01'

function passkeyWallet(sendCalls) {
  return { account: ACCOUNT, signer: null, provider: {}, chainId: 137, sendCalls, loginMethod: 'passkey' }
}

describe('useVouchers passkey rail (sendCalls, no signer)', () => {
  let sendCalls
  beforeEach(() => {
    sendCalls = vi.fn().mockResolvedValue({ txHash: '0xdead', sponsored: true })
    useWallet.mockReturnValue(passkeyWallet(sendCalls))
  })

  it('buy one for yourself → sendCalls([approve, mint]); never "Connect a wallet"', async () => {
    const { result } = renderHook(() => useVouchers())
    let res
    await act(async () => {
      res = await result.current.mintVouchers(ROLE, 1, 1, '')
    })
    expect(sendCalls).toHaveBeenCalledTimes(1)
    const calls = sendCalls.mock.calls[0][0]
    expect(calls).toHaveLength(2)
    expect(calls[0].target).toBe(TOKEN) // approve
    expect(calls[1].target).toBe(VOUCHER) // mint on the immutable voucher
    expect(res.txHash).toBe('0xdead')
    expect(res.gift).toBe(false)
  })

  it('gift / quantity>1 → sendCalls([approve(minter), mintBatch])', async () => {
    const { result } = renderHook(() => useVouchers())
    await act(async () => {
      await result.current.mintVouchers(ROLE, 1, 2, OTHER)
    })
    const calls = sendCalls.mock.calls[0][0]
    expect(calls[0].target).toBe(TOKEN) // approve the batch minter
    expect(calls[1].target).toBe(MINTER) // mintBatch
  })

  it('redeem → sendCalls([redeemVoucher on the manager])', async () => {
    const { result } = renderHook(() => useVouchers())
    await act(async () => {
      await result.current.redeemVoucher('7', undefined)
    })
    expect(sendCalls).toHaveBeenCalledTimes(1)
    expect(sendCalls.mock.calls[0][0][0].target).toBe(MANAGER)
  })

  it('transfer → sendCalls([safeTransferFrom on the voucher])', async () => {
    const { result } = renderHook(() => useVouchers())
    await act(async () => {
      await result.current.transferVoucher('7', OTHER)
    })
    expect(sendCalls).toHaveBeenCalledTimes(1)
    expect(sendCalls.mock.calls[0][0][0].target).toBe(VOUCHER)
  })
})
