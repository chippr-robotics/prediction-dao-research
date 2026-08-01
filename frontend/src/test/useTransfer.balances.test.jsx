import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const getBalance = vi.fn()
const rpcGetBalance = vi.fn()
const tokenBalanceOf = vi.fn()
const contractCtor = vi.fn(() => ({ balanceOf: tokenBalanceOf }))
const makeReadProvider = vi.fn()

// Partial mock: only the pieces useTransfer drives are stubbed (Contract is a spy so the ERC-20
// balance read can be asserted). The rest of `ethers` stays real — config modules pulled in
// transitively import named exports from it at load time (e.g. `getAddress` in config/staking.js),
// and a hand-listed mock silently breaks the whole file the moment the import graph grows.
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      Interface: class MockInterface {},
      Contract: function MockContract(...args) { return contractCtor(...args) },
      formatUnits: (value, decimals) => (Number(value) / (10 ** decimals)).toString(),
      isAddress: () => true,
      parseUnits: () => 0n,
    },
  }
})

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
// Partial mock: only `getNetwork` is stubbed (a stablecoin with no EIP-3009 domain version, so the
// classic path stays self-submit, plus a deterministic rpcUrl to assert the read-provider wiring).
// Everything else stays REAL — modules pulled in transitively (constants/dex.js via data/wagers)
// call `getCurrentChainId`/`NETWORKS` at module load, and hand-listing those exports here just
// re-breaks the file the next time an import graph grows. The real module is safe to load: its
// import-time `assertReferenceChainInCohort()` passes for the default (mainnet) build.
vi.mock('../config/networks', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getNetwork: () => ({ stablecoin: { domainVersion: null }, rpcUrl: 'https://rpc.test' }),
  }
})
vi.mock('../utils/rpcProvider', () => ({ makeReadProvider: (...args) => makeReadProvider(...args) }))
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
    wallet.loginMethod = 'eoa'
    wallet.provider = { getBalance }
    getBalance.mockReset()
    rpcGetBalance.mockReset()
    tokenBalanceOf.mockReset()
    makeReadProvider.mockReset()
    contractCtor.mockClear()
    makeReadProvider.mockReturnValue({ getBalance: rpcGetBalance })
    getBalance.mockResolvedValue(2500000000000000000n)
    rpcGetBalance.mockResolvedValue(3500000000000000000n)
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

  it('uses the network RPC read provider for passkey sessions', async () => {
    wallet.loginMethod = 'passkey'
    wallet.provider = null

    const { result } = renderHook(() => useTransfer())

    await waitFor(() => expect(makeReadProvider).toHaveBeenCalledWith('https://rpc.test', wallet.chainId))
    await waitFor(() => expect(rpcGetBalance).toHaveBeenCalledWith(wallet.address))
    await waitFor(() => expect(tokenBalanceOf).toHaveBeenCalledWith(wallet.address))
    expect(contractCtor).toHaveBeenCalledWith(
      '0xToken000000000000000000000000000000000001',
      ['function balanceOf(address) view returns (uint256)'],
      expect.objectContaining({ getBalance: rpcGetBalance })
    )
    expect(result.current.balanceOf(TRANSFER_KIND.NATIVE)).toBe('3.5')
  })
})
