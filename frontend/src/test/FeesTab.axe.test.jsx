/**
 * FeesTab WCAG 2.1 AA audit (spec 060) — the unified fee screen with tables,
 * forms, and history must pass axe in its loaded state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ethers } from 'ethers'

const m = vi.hoisted(() => ({ routerAddr: null, reads: {} }))

vi.mock('../config/contracts', () => ({
  getContractAddressForChain: vi.fn(() => m.routerAddr),
}))
vi.mock('../hooks/useGatewayStatus', () => ({ gatewayBaseUrl: () => '' }))
vi.mock('../config/blockExplorer', () => ({
  getBlockscoutUrl: () => 'https://explorer.example/address/0xrouter',
}))
vi.mock('ethers', async (orig) => {
  const actual = await orig()
  function FakeContract() {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined
          if (prop === 'filters') return { FeeBpsChanged: () => ({}) }
          const key = String(prop)
          return (...args) => {
            const f = m.reads[key]
            if (!f) throw new Error('unmocked contract method: ' + key)
            return f(...args)
          }
        },
      },
    )
  }
  return { ...actual, ethers: { ...actual.ethers, Contract: FakeContract }, Contract: FakeContract }
})

import FeesTab from '../components/admin/FeesTab'

const EARN_LEND = ethers.id('earn.lend')

beforeEach(() => {
  m.routerAddr = '0x00000000000000000000000000000000000000f1'
  m.reads = {
    serviceCount: async () => 1n,
    serviceAt: async () => EARN_LEND,
    getService: async () => ({ capBps: 250n, feeBps: 50n, kind: 1n }),
    treasury: async () => '0x1111111111111111111111111111111111111111',
    MAX_WRAPPED_FEE_BPS: async () => 250n,
    queryFilter: async () => [
      {
        args: { serviceId: EARN_LEND, oldBps: 0n, newBps: 50n, actor: '0x1111111111111111111111111111111111111111' },
        blockNumber: 1,
        transactionHash: '0xabc',
      },
    ],
  }
})

describe('FeesTab accessibility', () => {
  it('has no WCAG 2.1 AA violations in the loaded state (tables + forms + history)', async () => {
    const { container } = render(
      <FeesTab
        signer={{}}
        chainId={137}
        provider={{ getBlockNumber: async () => 100, getBlock: async () => ({ timestamp: 1_752_800_000 }) }}
        runTx={vi.fn()}
        pendingTx={false}
        isAdmin
        isFeeAdmin
      />,
    )
    await screen.findAllByText(/earn — vault lending/i)
    await screen.findByText('0 → 50 bps')
    expect(await axe(container)).toHaveNoViolations()
  })
})
