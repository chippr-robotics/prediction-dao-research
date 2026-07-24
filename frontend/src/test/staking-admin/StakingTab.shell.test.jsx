/**
 * Spec 066 (T019): StakingTab renders the honest "not deployed" empty state when no
 * router is on the network, role-gates its controls (config = STAKING_ADMIN, pause =
 * GUARDIAN), and is axe-clean.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'

const m = vi.hoisted(() => ({ routerAddr: null, reads: {} }))

vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: vi.fn(() => m.routerAddr),
}))
vi.mock('../../config/blockExplorer', () => ({
  getBlockscoutUrl: () => 'https://explorer.example/address/0xrouter',
}))
vi.mock('../../lib/fees/feeQuote', async (orig) => ({
  ...(await orig()),
  fetchFeeQuote: vi.fn(() => Promise.resolve({ available: false, bps: 0, capBps: 0 })),
}))
vi.mock('ethers', async (orig) => {
  const actual = await orig()
  function FakeContract() {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined
          if (prop === 'filters') return new Proxy({}, { get: () => () => ({}) })
          const key = String(prop)
          return (...args) => {
            const f = m.reads[key]
            return f ? f(...args) : Promise.resolve(undefined)
          }
        },
      },
    )
  }
  return { ...actual, Contract: vi.fn(FakeContract) }
})

import StakingTab from '../../components/admin/StakingTab'

const ROUTER = '0x1111111111111111111111111111111111111111'
const providerStub = {
  getBlockNumber: () => Promise.resolve(1000),
  getBlock: () => Promise.resolve({ timestamp: 0 }),
}

function baseProps(overrides = {}) {
  return {
    signer: {},
    chainId: 1,
    provider: providerStub,
    runTx: vi.fn(() => Promise.resolve()),
    pendingTx: false,
    isAdmin: false,
    isStakingAdmin: false,
    isGuardian: false,
    ...overrides,
  }
}

beforeEach(() => {
  m.routerAddr = null
  m.reads = {
    paused: () => Promise.resolve(false),
    validatorCount: () => Promise.resolve(0n),
    queryFilter: () => Promise.resolve([]),
  }
})

describe('StakingTab — not deployed', () => {
  it('shows the honest not-deployed empty state', () => {
    m.routerAddr = ''
    render(<StakingTab {...baseProps({ isAdmin: true })} />)
    expect(screen.getByText(/No StakingRouter is deployed/i)).toBeInTheDocument()
    expect(screen.queryByText(/Emergency pause/i)).not.toBeInTheDocument()
  })

  it('is axe-clean in the not-deployed state', async () => {
    m.routerAddr = ''
    const { container } = render(<StakingTab {...baseProps({ isAdmin: true })} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('StakingTab — role gating', () => {
  it('a guardian sees pause but not the config controls', async () => {
    m.routerAddr = ROUTER
    render(<StakingTab {...baseProps({ isGuardian: true })} />)
    await waitFor(() => expect(screen.getByText('Emergency pause')).toBeInTheDocument())
    expect(screen.queryByText('Provider addresses')).not.toBeInTheDocument()
    expect(screen.queryByText('Validator allowlist')).not.toBeInTheDocument()
  })

  it('a staking admin sees the config controls', async () => {
    m.routerAddr = ROUTER
    render(<StakingTab {...baseProps({ isStakingAdmin: true })} />)
    await waitFor(() => expect(screen.getByText('Provider addresses')).toBeInTheDocument())
    expect(screen.getByText('Validator allowlist')).toBeInTheDocument()
    // Not a guardian ⇒ no pause control.
    expect(screen.queryByText('Emergency pause')).not.toBeInTheDocument()
  })

  it('is axe-clean when loaded with controls', async () => {
    m.routerAddr = ROUTER
    const { container } = render(<StakingTab {...baseProps({ isAdmin: true })} />)
    await waitFor(() => expect(screen.getByText('Provider addresses')).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
