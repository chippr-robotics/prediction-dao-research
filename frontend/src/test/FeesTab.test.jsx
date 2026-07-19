/**
 * FeesTab tests (spec 060, US2) — the unified fee screen renders every fee
 * system with live rates and caps, gates edits by role, validates caps
 * client-side before any transaction, renders the on-chain change history,
 * and is honest when no router is deployed or the gateway is unreachable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ethers } from 'ethers'

const m = vi.hoisted(() => ({ routerAddr: null, reads: {}, writes: {} }))

vi.mock('../config/contracts', () => ({
  getContractAddressForChain: vi.fn(() => m.routerAddr),
}))
vi.mock('../hooks/useGatewayStatus', () => ({
  gatewayBaseUrl: () => '', // gateway rows exercise the unreachable path by default
}))
vi.mock('../config/blockExplorer', () => ({
  getBlockscoutUrl: () => 'https://explorer.example/address/0xrouter',
}))

// One fake Contract serves reads (provider) and writes (signer): methods come
// from m.reads / m.writes, plus the queryFilter/filters event surface.
vi.mock('ethers', async (orig) => {
  const actual = await orig()
  function FakeContract(_addr, _abi, signerOrProvider) {
    const table = signerOrProvider?.isSigner ? m.writes : m.reads
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined
          if (prop === 'filters') return { FeeBpsChanged: () => ({}) }
          const key = String(prop)
          return (...args) => {
            const f = table[key]
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
const PM_TAKER = ethers.id('polymarket.taker')
const TREASURY = '0x1111111111111111111111111111111111111111'

const PROVIDER = { getBlockNumber: async () => 500_000, getBlock: async () => ({ timestamp: 1_752_800_000 }) }
const SIGNER = { isSigner: true }

function seedReads({ feeBps = { [EARN_LEND]: 50, [PM_TAKER]: 40 }, events = [] } = {}) {
  const ids = [EARN_LEND, PM_TAKER]
  const svc = {
    [EARN_LEND]: { capBps: 250n, feeBps: BigInt(feeBps[EARN_LEND] ?? 0), kind: 1n },
    [PM_TAKER]: { capBps: 100n, feeBps: BigInt(feeBps[PM_TAKER] ?? 0), kind: 2n },
  }
  m.reads = {
    serviceCount: async () => 2n,
    serviceAt: async (i) => ids[i],
    getService: async (id) => svc[id],
    treasury: async () => TREASURY,
    MAX_WRAPPED_FEE_BPS: async () => 250n,
    queryFilter: async () => events,
  }
}

function renderTab({ isAdmin = true, isFeeAdmin = false, runTx } = {}) {
  const tx = runTx ?? vi.fn(async (fn) => fn())
  render(
    <FeesTab
      signer={SIGNER}
      chainId={137}
      provider={PROVIDER}
      runTx={tx}
      pendingTx={false}
      isAdmin={isAdmin}
      isFeeAdmin={isFeeAdmin}
    />,
  )
  return tx
}

beforeEach(() => {
  m.routerAddr = '0x00000000000000000000000000000000000000f1'
  m.writes = { setFeeBps: vi.fn(async () => ({})), setTreasury: vi.fn(async () => ({})) }
  seedReads()
})

describe('FeesTab rendering', () => {
  it('lists every registered service with live rate, cap, and enforcement', async () => {
    renderTab()
    expect((await screen.findAllByText(/earn — vault lending/i)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/polymarket builder fee \(taker\)/i).length).toBeGreaterThan(0)
    expect(screen.getByText('50 bps (0.50%)')).toBeInTheDocument()
    expect(screen.getByText('40 bps (0.40%)')).toBeInTheDocument()
    expect(screen.getByText(/charged on-chain \(wrapper\)/i)).toBeInTheDocument()
    expect(screen.getByText(/read by the gateway/i)).toBeInTheDocument()
    // Treasury + OpenSea display-only row + unreachable-gateway honesty.
    expect(screen.getByText('0x1111...1111')).toBeInTheDocument()
    expect(screen.getByText('OpenSea referral (Collect)')).toBeInTheDocument()
    expect(screen.getAllByText(/gateway unreachable/i).length).toBeGreaterThan(0)
  })

  it('is honest when no FeeRouter is deployed on the network', async () => {
    m.routerAddr = null
    renderTab()
    expect(
      await screen.findByText(/no feerouter is deployed on this network/i),
    ).toBeInTheDocument()
  })

  it('renders the change history from FeeBpsChanged events', async () => {
    seedReads({
      events: [
        {
          args: { serviceId: EARN_LEND, oldBps: 0n, newBps: 50n, actor: TREASURY },
          blockNumber: 499_000,
          transactionHash: '0xabc',
        },
      ],
    })
    renderTab()
    expect(await screen.findByText('0 → 50 bps')).toBeInTheDocument()
  })
})

describe('FeesTab editing & gating', () => {
  it('sends setFeeBps through runTx for an in-cap change', async () => {
    const tx = renderTab({ isAdmin: false, isFeeAdmin: true })
    await screen.findAllByText(/earn — vault lending/i)
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: EARN_LEND } })
    fireEvent.change(screen.getByLabelText(/new rate/i), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /set fee rate/i }))
    await waitFor(() => expect(m.writes.setFeeBps).toHaveBeenCalledWith(EARN_LEND, 75))
    expect(tx).toHaveBeenCalled()
  })

  it('blocks an above-cap rate client-side with a clear error (contract would refuse too)', async () => {
    renderTab()
    await screen.findAllByText(/earn — vault lending/i)
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: EARN_LEND } })
    fireEvent.change(screen.getByLabelText(/new rate/i), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: /set fee rate/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/above this service's hard cap/i)
    expect(m.writes.setFeeBps).not.toHaveBeenCalled()
  })

  it('hides the rate editor entirely without the fee-admin capability', async () => {
    renderTab({ isAdmin: false, isFeeAdmin: false })
    await screen.findAllByText(/earn — vault lending/i)
    expect(screen.queryByRole('button', { name: /set fee rate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set treasury/i })).not.toBeInTheDocument()
  })

  it('treasury changes are admin-only and validate the address', async () => {
    renderTab({ isAdmin: true })
    await screen.findAllByText(/earn — vault lending/i)
    fireEvent.change(screen.getByLabelText(/treasury address/i), { target: { value: 'nonsense' } })
    fireEvent.click(screen.getByRole('button', { name: /set treasury/i }))
    expect(await screen.findByText(/valid, nonzero treasury address/i)).toBeInTheDocument()
    expect(m.writes.setTreasury).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/treasury address/i), { target: { value: TREASURY } })
    fireEvent.click(screen.getByRole('button', { name: /set treasury/i }))
    await waitFor(() => expect(m.writes.setTreasury).toHaveBeenCalledWith(TREASURY))
  })

  it('fee admins without full admin cannot change the treasury', async () => {
    renderTab({ isAdmin: false, isFeeAdmin: true })
    await screen.findAllByText(/earn — vault lending/i)
    expect(screen.getByRole('button', { name: /set fee rate/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set treasury/i })).not.toBeInTheDocument()
  })
})
