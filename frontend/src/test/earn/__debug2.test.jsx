import { describe, it, vi, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const walletState = { address: '0x1111111111111111111111111111111111111111', chainId: 137 }
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => walletState }))
vi.mock('../../hooks/usePortfolio', () => ({ default: () => ({ holdings: [], status: 'ready' }) }))
vi.mock('../../hooks/useEarnSend', () => ({
  useEarnSend: () => ({ sendOnChain: vi.fn(), canTransactOn: () => true, cannotTransactReason: () => '', isPasskey: false }),
}))
vi.mock('../../hooks/useActivity', () => ({ useActivityOptional: () => ({ refresh: vi.fn() }) }))
vi.mock('../../utils/rpcProvider', () => ({ makeReadProvider: () => ({}) }))
vi.mock('../../lib/fees/feeQuote', async (o) => ({ ...(await o()), fetchFeeQuote: vi.fn().mockResolvedValue({ available: false, bps: 0 }) }))
import SupplySheet from '../../components/earn/SupplySheet'
import { POOL_KIND } from '../../lib/liquidity/liquidityRouter'

const T = {
  usdc137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  weth137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
}
const opt = (chainId, address, symbol, networkName) => ({ key: `${chainId}:${address.toLowerCase()}`, chainId, kind: 'erc20', address, symbol, name: symbol, decimals: 18, networkName, balance: 1 })
const pool = {
  poolId: '0x11', kind: POOL_KIND.TRADING_LP, enabled: true, feeTier: 3000,
  token0: T.usdc137, token1: T.weth137, poolAddress: '0xa1', maxDeposit0PerTx: 0n, maxDeposit1PerTx: 0n,
  chainId: 137, networkName: 'Polygon', token0Meta: { symbol: 'USDC', decimals: 6 }, token1Meta: { symbol: 'WETH', decimals: 18 },
  routerAddress: '0xdead', positionManager: '0xabc',
}
describe('debug2', () => {
  it('renders selects', async () => {
    const user = userEvent.setup()
    render(<SupplySheet pool={pool} pools={[pool]} assetOptions={[opt(137, T.usdc137, 'USDC', 'Polygon'), opt(137, T.weth137, 'WETH', 'Polygon')]} positions={[]} onClose={() => {}} />)
    const btns = screen.getAllByRole('button').map((b) => `${b.getAttribute('aria-label') || b.textContent} disabled=${b.disabled}`)
    console.log(btns.join('\n'))
    await user.click(screen.getByRole('button', { name: 'Paired with' }))
    console.log('after click roles:', screen.queryAllByRole('listbox').length)
    console.log(document.body.innerHTML.slice(0, 4000))
    expect(true).toBe(true)
  })
})
