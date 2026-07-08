import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const getBalance = vi.fn()
const tokenBalanceOf = vi.fn()
const contractCtor = vi.fn(() => ({ balanceOf: tokenBalanceOf }))

vi.mock('ethers', () => ({
  ethers: {
    Interface: class MockInterface {},
    Contract: function MockContract(...args) { return contractCtor(...args) },
    formatUnits: (value, decimals) => (Number(value) / (10 ** decimals)).toString(),
    isAddress: () => true,
    parseUnits: () => 0n,
  },
}))

const wallet = {
  address: '0xAaAa000000000000000000000000000000000001',
  chainId: 137,
  signer: {},
  provider: { getBalance },
  loginMethod: 'eoa',
  sendCalls: vi.fn(),
}

vi.mock('../hooks/useWalletManagement', () => ({ useWallet: () => wallet }))
vi.mock('../hooks/useActiveAccount', () => ({
  useActiveAccount: () => ({ isVault: false, canActAsVault: false, submit: vi.fn() }),
}))
vi.mock('../hooks/useChainTokens', () => ({
  useChainTokens: () => ({
    native: 'MATIC',
    nativeName: 'Matic',
    nativeDecimals: 18,
    stable: 'USDC',
    stableName: 'USD Coin',
    stableDecimals: 6,
    stableAddress: '0xToken000000000000000000000000000000000001',
  }),
}))
vi.mock('../config/networks', () => ({ getNetwork: () => ({ stablecoin: { domainVersion: null } }) }))
vi.mock('../lib/transfer/eip3009Transfer', () => ({
  TRANSFER_ABI: ['function balanceOf(address) view returns (uint256)'],
  signTransferAuthorization: vi.fn(),
  getTransferRelayer: () => null,
  relayGaslessTransfer: vi.fn(),
}))
vi.mock('../lib/transfer/transferStore', () => ({
  recordTransfer: vi.fn(),
  updateTransfer: vi.fn(),
  TRANSFER_STATUS: { COMPLETE: 'complete', FAILED: 'failed' },
}))

import { useTransfer, TRANSFER_KIND } from '../hooks/useTransfer'

describe('useTransfer balances', () => {
  beforeEach(() => {
    getBalance.mockReset()
    tokenBalanceOf.mockReset()
    contractCtor.mockClear()
    getBalance.mockResolvedValue(2500000000000000000n)
    tokenBalanceOf.mockResolvedValue(123450000n)
  })

  it('reads balances from the RPC provider and exposes them by asset kind', async () => {
    const { result } = renderHook(() => useTransfer())

    await waitFor(() => expect(getBalance).toHaveBeenCalledWith(wallet.address))
    await waitFor(() => expect(tokenBalanceOf).toHaveBeenCalledWith(wallet.address))
    expect(contractCtor).toHaveBeenCalledWith(
      '0xToken000000000000000000000000000000000001',
      ['function balanceOf(address) view returns (uint256)'],
      wallet.provider
    )
    expect(result.current.balanceOf(TRANSFER_KIND.NATIVE)).toBe('2.5')
    expect(result.current.balanceOf(TRANSFER_KIND.STABLE)).toBe('123.45')

    await act(async () => {
      await result.current.refreshBalances()
    })
    expect(getBalance).toHaveBeenCalledTimes(2)
    expect(tokenBalanceOf).toHaveBeenCalledTimes(2)
  })
})
