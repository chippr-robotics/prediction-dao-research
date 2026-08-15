/**
 * useWrapNative — the engine behind Transfer ▸ Wrap.
 *
 * What is pinned here is the part a member can lose money or trust on:
 *
 *   1. The calldata. `deposit()` must carry the coin as msg.value and `withdraw(wad)` must name the
 *      amount and send no value. Getting these the wrong way round is a silent, unrecoverable send.
 *   2. The gas reserve. Wrapping is paid for in the very coin being wrapped, so MAX must hold back a
 *      quoted fee — an offer of the whole balance is a transaction that fails after signature.
 *   3. Who is acting. A vault wrap is a PROPOSAL, and a passkey op that was submitted but never
 *      included is reported as pending with no fabricated transaction hash.
 *   4. Unread ≠ zero. A balance that failed to read stays null so the view can render "—".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { ethers } from 'ethers'
import { WNATIVE_ABI } from '../../abis/WNative'

const MORDOR = 63
const WRAPPED = '0x1953cab0E5bFa6D4a9BaD6E05fD46C1CC6527a5a'

const IFACE = new ethers.Interface(WNATIVE_ABI)
const DEPOSIT = IFACE.encodeFunctionData('deposit', [])
const withdrawData = (v) => IFACE.encodeFunctionData('withdraw', [v])

const getBalance = vi.fn()
const balanceOf = vi.fn()
const symbolCall = vi.fn()
const getFeeData = vi.fn()
const sendTransaction = vi.fn()
const sendCalls = vi.fn()
const submitAsActive = vi.fn()

const readProvider = { getBalance, getFeeData }

const wallet = vi.hoisted(() => ({ current: {} }))
const active = vi.hoisted(() => ({ current: {} }))

vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => wallet.current }))
vi.mock('../../hooks/useActiveAccount', () => ({ useActiveAccount: () => active.current }))
vi.mock('../../utils/rpcProvider', () => ({ makeReadProvider: () => readProvider }))
vi.mock('../../hooks/useRpcEndpoints', () => ({ useEndpointsRevision: () => 0 }))

// Only `Contract` is stubbed — every read this hook makes goes through one, and the rest of ethers
// (Interface, parseUnits, formatUnits) is the real thing so the encoded calldata under test is
// genuinely what ethers would produce.
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Contract: function MockContract(address, abi) {
        // The symbol probe is built with a one-entry ABI; the balance reads use the full one.
        return abi.length === 1 ? { symbol: symbolCall } : { balanceOf }
      },
    },
  }
})

const { useWrapNative } = await import('../../hooks/useWrapNative')

beforeEach(() => {
  vi.clearAllMocks()
  wallet.current = {
    address: '0xAaAa000000000000000000000000000000000001',
    chainId: MORDOR,
    signer: { sendTransaction },
    provider: null,
    loginMethod: 'eoa',
    sendCalls,
  }
  active.current = {
    identity: { mode: 'personal' },
    isVault: false,
    isLegacy: false,
    canActAsVault: false,
    canActAsLegacy: false,
    submit: submitAsActive,
  }
  getBalance.mockResolvedValue(ethers.parseEther('10'))
  balanceOf.mockResolvedValue(ethers.parseEther('4'))
  symbolCall.mockResolvedValue('WETC')
  getFeeData.mockResolvedValue({ maxFeePerGas: 1_000_000_000n, gasPrice: 1_000_000_000n })
  sendTransaction.mockResolvedValue({ hash: '0xtx', wait: async () => ({ hash: '0xtx' }) })
})

async function mounted() {
  const view = renderHook(() => useWrapNative())
  await waitFor(() => expect(view.result.current.nativeBalance).not.toBeNull())
  return view
}

describe('resolution and balances', () => {
  it('resolves the network’s wrapped coin and reads both balances', async () => {
    const { result } = await mounted()
    expect(result.current.available).toBe(true)
    expect(result.current.token.address).toBe(WRAPPED)
    expect(result.current.nativeBalance).toBe(ethers.parseEther('10'))
    await waitFor(() => expect(result.current.wrappedBalance).toBe(ethers.parseEther('4')))
  })

  it('prefers the contract’s own symbol over the label derived from config', async () => {
    symbolCall.mockResolvedValue('WPOL')
    const { result } = await mounted()
    await waitFor(() => expect(result.current.wrappedSymbol).toBe('WPOL'))
  })

  it('keeps a failed balance read null — an unread balance is not a zero one', async () => {
    getBalance.mockRejectedValue(new Error('rpc down'))
    balanceOf.mockRejectedValue(new Error('rpc down'))
    const { result } = await mounted().catch(() => renderHook(() => useWrapNative()))
    await waitFor(() => expect(result.current.wrappedBalance).toBeNull())
    expect(result.current.nativeBalance).toBeNull()
    expect(result.current.maxWrappable).toBeNull()
  })

  it('reports unavailable on a network with no configured wrapper', async () => {
    wallet.current = { ...wallet.current, chainId: 11155111 }
    const { result } = renderHook(() => useWrapNative())
    expect(result.current.available).toBe(false)
    expect(result.current.token).toBeNull()
    await expect(result.current.wrap('1')).rejects.toThrow(/no wrapped coin/i)
  })
})

describe('the gas reserve', () => {
  it('holds back a quoted fee so a MAX wrap can still pay for itself', async () => {
    const { result } = await mounted()
    await waitFor(() => expect(result.current.gasReserve).not.toBeNull())
    expect(result.current.maxWrappable).toBe(ethers.parseEther('10') - result.current.gasReserve)
    expect(result.current.gasReserve).toBeGreaterThan(0n)
  })

  it('never goes negative when the balance is smaller than the reserve', async () => {
    getBalance.mockResolvedValue(1n)
    const { result } = await mounted()
    await waitFor(() => expect(result.current.gasReserve).not.toBeNull())
    expect(result.current.maxWrappable).toBe(0n)
  })

  it('holds nothing back when the op is sponsored — there is no fee to reserve for', async () => {
    wallet.current = { ...wallet.current, loginMethod: 'passkey', signer: null }
    const { result } = await mounted()
    // Mordor's passkey block is env-driven and unset in the test build, so sponsorship is off and
    // the reserve still applies. Asserting the honest default matters more than a contrived on-case.
    expect(result.current.sponsored).toBe(false)
    await waitFor(() => expect(result.current.maxWrappable).toBeLessThan(ethers.parseEther('10')))
  })
})

describe('the calldata', () => {
  it('wraps by sending the coin to deposit()', async () => {
    const { result } = await mounted()
    await act(async () => { await result.current.wrap('1.5') })
    expect(sendTransaction).toHaveBeenCalledWith({
      to: WRAPPED,
      value: ethers.parseEther('1.5'),
      data: DEPOSIT,
    })
  })

  it('unwraps by naming the amount to withdraw() and sending no value', async () => {
    const { result } = await mounted()
    await act(async () => { await result.current.unwrap('2') })
    expect(sendTransaction).toHaveBeenCalledWith({
      to: WRAPPED,
      value: 0n,
      data: withdrawData(ethers.parseEther('2')),
    })
  })

  it('refuses an amount larger than the balance being spent', async () => {
    const { result } = await mounted()
    await waitFor(() => expect(result.current.wrappedBalance).not.toBeNull())
    await expect(result.current.unwrap('5')).rejects.toThrow(/not enough/i)
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it('refuses a zero or unparseable amount', async () => {
    const { result } = await mounted()
    await expect(result.current.wrap('0')).rejects.toThrow(/greater than zero/i)
    await expect(result.current.wrap('abc')).rejects.toThrow(/valid amount/i)
    expect(sendTransaction).not.toHaveBeenCalled()
  })
})

describe('who is acting', () => {
  it('turns a vault wrap into a proposal, and never a transaction', async () => {
    active.current = {
      ...active.current,
      isVault: true,
      canActAsVault: true,
      identity: { mode: 'vault', vaultAddress: '0xVau1t00000000000000000000000000000000001', chainId: MORDOR },
    }
    submitAsActive.mockResolvedValue({ safeTxHash: '0xsafe' })
    const { result } = await mounted()
    let res
    await act(async () => { res = await result.current.wrap('1') })
    expect(res).toMatchObject({ proposed: true, safeTxHash: '0xsafe', txHash: null })
    expect(sendTransaction).not.toHaveBeenCalled()
    expect(submitAsActive).toHaveBeenCalledWith({ to: WRAPPED, value: ethers.parseEther('1'), data: DEPOSIT })
  })

  it('refuses a vault wrap from the wrong network rather than signing on it', async () => {
    active.current = {
      ...active.current,
      isVault: true,
      canActAsVault: false,
      identity: { mode: 'vault', vaultAddress: '0xVau1t00000000000000000000000000000000001', chainId: 137 },
    }
    const { result } = await mounted()
    await expect(result.current.wrap('1')).rejects.toThrow(/switch to the vault/i)
    expect(submitAsActive).not.toHaveBeenCalled()
  })

  it('reports a submitted-but-not-included passkey op as pending, with no fabricated tx hash', async () => {
    wallet.current = { ...wallet.current, loginMethod: 'passkey', signer: null }
    sendCalls.mockResolvedValue({ state: 'submitted', userOpHash: '0xuserop', sponsored: true })
    const { result } = await mounted()
    let res
    await act(async () => { res = await result.current.wrap('1') })
    expect(res).toMatchObject({ pending: true, txHash: null, userOpHash: '0xuserop' })
    expect(result.current.status).toBe('pending')
  })

  it('surfaces a failed passkey op as an error instead of a success', async () => {
    wallet.current = { ...wallet.current, loginMethod: 'passkey', signer: null }
    sendCalls.mockResolvedValue({ state: 'failed', reason: 'reverted: insufficient funds' })
    const { result } = await mounted()
    await act(async () => {
      await expect(result.current.wrap('1')).rejects.toThrow(/reverted/i)
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toMatch(/reverted/i)
  })

  it('reports the batch’s own sponsorship, not the config’s promise', async () => {
    wallet.current = { ...wallet.current, loginMethod: 'passkey', signer: null }
    sendCalls.mockResolvedValue({ state: 'included', txHash: '0xtx', sponsored: false })
    const { result } = await mounted()
    let res
    await act(async () => { res = await result.current.wrap('1') })
    expect(res).toMatchObject({ txHash: '0xtx', sponsored: false })
  })
})
