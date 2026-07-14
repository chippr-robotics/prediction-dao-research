/**
 * usePredictTrade (spec 057) — the state machine: fee-blocks-signing (FR-010), EOA sign+submit with
 * the builder code, network-switch prompt (FR-021), price-changed re-confirm (FR-008), unsupported
 * account honest reason (FR-019). All external calls are injected.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChainId } from 'wagmi'
import { WalletContext } from '../../contexts/WalletContext.js'
import { usePredictTrade } from '../../hooks/usePredictTrade'

const TRADER = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
const TOKEN = '71321045679252212594626385532706912750332728571942532289631379312455583992563'
const BUILDER = '0x6e0316783960e149b53466f0f2c5fdbaf5ce11ba15669491de980f6dedc493a3'
const FEE = { feeRateBps: 100, builderTakerFeeBps: 50, builderMakerFeeBps: 0 }
const BUY = { tokenId: TOKEN, side: 'BUY', price: '0.5', size: '100', isMaker: false }

function makeDeps(over = {}) {
  return {
    fetchFeeRate: vi.fn().mockResolvedValue(FEE),
    submitOrder: vi.fn().mockResolvedValue({ orderId: '0xneworder', status: 'matched', builder: { source: 'attributed', feeBps: 50 } }),
    cancelOrder: vi.fn().mockResolvedValue({ cancelled: true }),
    resolveTradeSigner: vi.fn(() => ({ canSign: true, kind: 'eoa', address: TRADER, sign: vi.fn().mockResolvedValue('0xsig') })),
    ...over,
  }
}

function wrapperFor(walletOver = {}) {
  const wallet = { address: TRADER, loginMethod: 'wallet', signer: { signTypedData: vi.fn() }, switchChain: vi.fn().mockResolvedValue(), ...walletOver }
  return ({ children }) => <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
}

beforeEach(() => {
  vi.clearAllMocks()
  useChainId.mockReturnValue(137)
})

describe('usePredictTrade', () => {
  it('loads the fee then becomes ready', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor() })
    await act(async () => { await result.current.loadFee(TOKEN) })
    expect(result.current.status).toBe('ready')
    expect(result.current.fee).toBe(FEE)
  })

  it('BLOCKS when the fee cannot be confirmed — never signs (FR-010)', async () => {
    const deps = makeDeps({ fetchFeeRate: vi.fn().mockRejectedValue(new Error('down')) })
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor() })
    await act(async () => { await result.current.loadFee(TOKEN) })
    expect(result.current.status).toBe('blocked')
    expect(deps.submitOrder).not.toHaveBeenCalled()
  })

  it('previews the honest total including the additive builder fee', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor() })
    await act(async () => { await result.current.loadFee(TOKEN) })
    const p = result.current.preview(BUY)
    expect(p.totalCostUnits).toBe(50_250000n)
    expect(p.feeLines.map((l) => l.label)).toContain('FairWins builder fee')
  })

  it('signs and submits an order carrying the builder code', async () => {
    const deps = makeDeps()
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor() })
    await act(async () => { await result.current.loadFee(TOKEN) })
    await act(async () => { await result.current.submit(BUY, { builder: BUILDER }) })
    expect(result.current.status).toBe('done')
    expect(deps.submitOrder).toHaveBeenCalledOnce()
    const submittedOrder = deps.submitOrder.mock.calls[0][1].order
    expect(submittedOrder.builder).toBe(BUILDER)
  })

  it('prompts a network switch when off Polygon (FR-021)', async () => {
    useChainId.mockReturnValue(1)
    const deps = makeDeps()
    const switchChain = vi.fn().mockRejectedValue(new Error('declined'))
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor({ switchChain }) })
    expect(result.current.onWrongNetwork).toBe(true)
    await act(async () => { await result.current.loadFee(TOKEN) })
    await act(async () => { await result.current.submit(BUY, { builder: BUILDER }) })
    expect(result.current.status).toBe('error')
    expect(result.current.reason).toMatch(/Polygon/)
    expect(deps.submitOrder).not.toHaveBeenCalled()
  })

  it('re-confirms on a price move (FR-008)', async () => {
    const err = Object.assign(new Error('moved'), { code: 'price_changed' })
    const deps = makeDeps({ submitOrder: vi.fn().mockRejectedValue(err) })
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor() })
    await act(async () => { await result.current.loadFee(TOKEN) })
    let res
    await act(async () => { res = await result.current.submit(BUY, { builder: BUILDER }) })
    expect(res).toEqual({ priceChanged: true })
    expect(result.current.reason).toMatch(/moved/)
  })

  it('shows an honest reason when the account cannot sign (FR-019) — never a dead button', async () => {
    const deps = makeDeps({ resolveTradeSigner: vi.fn(() => ({ canSign: false, kind: 'passkey', reason: "Trading isn't available for passkey accounts yet." })) })
    const { result } = renderHook(() => usePredictTrade({ deps }), { wrapper: wrapperFor({ loginMethod: 'passkey' }) })
    expect(result.current.canTrade).toBe(false)
    expect(result.current.unsupportedReason).toMatch(/passkey/)
    await act(async () => { await result.current.loadFee(TOKEN) })
    expect(result.current.status).toBe('blocked')
  })
})
