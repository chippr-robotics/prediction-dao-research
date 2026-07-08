import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const wallet = vi.hoisted(() => ({
  signer: { provider: { getNetwork: () => Promise.resolve({ chainId: 137n }) } },
  provider: { getNetwork: () => Promise.resolve({ chainId: 137n }) },
  address: '0x3333333333333333333333333333333333333333',
  chainId: 137,
  sendCalls: vi.fn(async () => ({ txHash: '0xpasskeytx' })),
}))

const gasless = vi.hoisted(() => ({
  closeRun: vi.fn(async () => ({ txHash: '0xgasless' })),
}))

vi.mock('../hooks/useWeb3', () => ({
  useWeb3: () => ({
    signer: wallet.signer,
    provider: wallet.provider,
    address: wallet.address,
    account: wallet.address,
    chainId: wallet.chainId,
    sendCalls: wallet.sendCalls,
  }),
}))

vi.mock('../lib/relay/useGaslessWrite', () => ({
  useGaslessWrite: (action) => {
    if (action === 'poolCloseJoining') return { run: gasless.closeRun }
    return { run: vi.fn(async () => ({ txHash: '0xother' })) }
  },
}))

const poolMock = vi.hoisted(() => ({
  interface: { encodeFunctionData: vi.fn(() => '0xclose') },
  filters: { Joined: vi.fn(() => 'joined-filter') },
  queryFilter: vi.fn(async () => [{ args: { member: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } }]),
}))

vi.mock('../lib/pools/poolContracts', () => ({
  ERC20_ABI: [],
  POOL_STATE: [],
  poolStateDisplay: () => 'Open',
  getFactory: vi.fn(),
  getPool: () => poolMock,
}))

vi.mock('../lib/pools/gateway', () => ({
  phraseToIndices: vi.fn(),
  resolvePool: vi.fn(),
  indicesToPhrase: vi.fn(),
}))
vi.mock('../lib/pools/payout', () => ({ payoutMatrixHash: () => '0xhash' }))
vi.mock('../config/contracts', () => ({
  getContractAddressForChain: vi.fn(() => '0xtoken'),
  getDeploymentBlockForChain: vi.fn(() => 0),
}))
vi.mock('../lib/lookup/myWagersSources', () => ({ recordJoinedPool: vi.fn() }))

import { usePools } from '../hooks/usePools'

describe('usePools signer wiring', () => {
  beforeEach(() => {
    wallet.signer = { provider: { getNetwork: () => Promise.resolve({ chainId: 137n }) } }
    wallet.provider = { getNetwork: () => Promise.resolve({ chainId: 137n }) }
    wallet.sendCalls.mockReset().mockResolvedValue({ txHash: '0xpasskeytx' })
    gasless.closeRun.mockReset().mockResolvedValue({ txHash: '0xgasless' })
    poolMock.interface.encodeFunctionData.mockClear()
    poolMock.queryFilter.mockClear()
  })

  it('keeps classic signer closeJoining path on gasless seam', async () => {
    const { result } = renderHook(() => usePools())
    let txHash
    await act(async () => { txHash = await result.current.closeJoining('0xpool') })
    expect(txHash).toBe('0xgasless')
    expect(gasless.closeRun).toHaveBeenCalledWith('0xpool')
    expect(wallet.sendCalls).not.toHaveBeenCalled()
  })

  it('supports passkey sessions without signer by routing closeJoining through sendCalls', async () => {
    wallet.signer = null
    const { result } = renderHook(() => usePools())
    let txHash
    await act(async () => { txHash = await result.current.closeJoining('0xpool') })
    expect(txHash).toBe('0xpasskeytx')
    expect(wallet.sendCalls).toHaveBeenCalledTimes(1)
    expect(wallet.sendCalls.mock.calls[0][0][0]).toMatchObject({ target: '0xpool', data: '0xclose' })
  })

  it('supports read-only member lookups with provider + address and no signer', async () => {
    wallet.signer = null
    const { result } = renderHook(() => usePools())
    let members
    await act(async () => { members = await result.current.getMembers('0xpool') })
    expect(poolMock.queryFilter).toHaveBeenCalled()
    expect(members).toHaveLength(1)
    expect(members[0].address).toBe('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  })
})
