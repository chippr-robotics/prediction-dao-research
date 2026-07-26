/**
 * Spec 067 US4 (T127–T132, T135) — the SupplyTab operator control surface (AdminPanel → Liquidity → Supply).
 *
 * Two assertions here matter more than the rest, and both are about what the tab REFUSES to
 * imply (research R3, FR-024):
 *
 *   - the pause is labelled "Pauses new Uniswap supplies" and says out loud that it cannot stop
 *     bridge-pool deposits, because no FairWins contract is in that path;
 *   - a retired pool stays in the table, with its position count, because members still hold
 *     positions in it and must keep being able to exit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ethers as ethersActual } from 'ethers'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { axe } from 'vitest-axe'

const m = vi.hoisted(() => ({ addr: {}, reads: {}, events: {}, feeQuote: null, feeThrows: null }))

vi.mock('../../config/contracts', () => ({
  getContractAddressForChain: (name, chainId) =>
    name === 'liquidityRouter' ? m.addr[Number(chainId)] || '' : '',
}))
vi.mock('../../config/blockExplorer', () => ({
  getBlockscoutUrl: () => 'https://explorer.example/address/0xrouter',
  getTransactionUrl: () => 'https://explorer.example/tx/0xdead',
}))
vi.mock('../../lib/fees/feeQuote', async (orig) => ({
  ...(await orig()),
  fetchFeeQuote: vi.fn(() => (m.feeThrows ? Promise.reject(m.feeThrows) : Promise.resolve(m.feeQuote))),
}))
vi.mock('../../lib/liquidity/acrossLpPositions', () => ({
  // The bridge-pool SIZE comes from the Across HubPool, not from the router's events. `null` is the
  // unreadable case, which the tab must report as unknown rather than as an empty pool.
  readPooledToken: vi.fn(() => Promise.resolve(m.pooledToken)),
}))
vi.mock('ethers', async (orig) => {
  const actual = await orig()
  function FakeContract() {
    return new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return undefined
          if (prop === 'filters') {
            return new Proxy({}, { get: (_f, name) => () => ({ __event: String(name) }) })
          }
          const key = String(prop)
          return (...args) => (m.reads[key] ? m.reads[key](...args) : Promise.resolve(undefined))
        },
      },
    )
  }
  const FakeCtor = vi.fn(FakeContract)
  return { ...actual, Contract: FakeCtor, ethers: { ...actual.ethers, Contract: FakeCtor } }
})

import SupplyTab from '../../components/admin/SupplyTab'
import { POOL_KIND } from '../../lib/liquidity/liquidityRouter'

const ROUTER = '0x2222222222222222222222222222222222222222'
const VALID = '0x00000000000000000000000000000000000000a1'
const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const POOL_ADDR = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640'
const HUB_POOL = '0xc186fA914353c44b2E33eBE05f21846F1048bEda'

const TRADING_POOL = {
  poolId: '0xpool1',
  kind: BigInt(POOL_KIND.TRADING_LP),
  enabled: true,
  feeTier: 500n,
  token0: USDC_ETH,
  token1: WETH,
  poolAddress: POOL_ADDR,
  maxDeposit0PerTx: 10_000_000_000n, // 10,000 USDC
  maxDeposit1PerTx: 0n,
}
const RETIRED_POOL = {
  poolId: '0xpool2',
  kind: BigInt(POOL_KIND.TRADING_LP),
  enabled: false,
  feeTier: 3000n,
  token0: USDC_ETH,
  token1: WETH,
  poolAddress: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8',
  maxDeposit0PerTx: 0n,
  maxDeposit1PerTx: 0n,
}
const BRIDGE_POOL = {
  poolId: '0xpool3',
  kind: BigInt(POOL_KIND.BRIDGE_LP),
  enabled: true,
  feeTier: 0n,
  token0: USDC_ETH,
  token1: '0x0000000000000000000000000000000000000000',
  poolAddress: HUB_POOL,
  maxDeposit0PerTx: 0n,
  maxDeposit1PerTx: 0n,
}

const providerStub = {
  getBlockNumber: () => Promise.resolve(1_000_000),
  getBlock: () => Promise.resolve({ timestamp: Math.floor(Date.now() / 1000) }),
}


/** `runTx` resolves true on success — callers that send a sequence rely on the signal. */
const TX_OK = true
const ACCOUNT = '0x9999999999999999999999999999999999999999'
const ROLE_HASH = {
  admin: ethersActual.ZeroHash,
  guardian: ethersActual.id('GUARDIAN_ROLE'),
  liquidityAdmin: ethersActual.id('LIQUIDITY_ADMIN_ROLE'),
}

function props(overrides = {}) {
  const runTx = vi.fn(() => Promise.resolve(TX_OK))
  // ── ROLE FLAGS ARE TRANSLATED INTO ON-CHAIN ANSWERS, NOT PASSED AS PROPS ──────────────────────
  // The tab asks the router in scope `hasRole(...)` rather than trusting an app-wide flag, because
  // the flags were resolved against the wrong contract and the wrong network (see
  // readRouterAuthority). Call sites keep the readable `{ isGuardian: true }` shape; what it now
  // means is "the router says so", which is the thing that actually gates the control.
  const { isAdmin = false, isLiquidityAdmin = false, isGuardian = false, ...node } = overrides
  const held = []
  if (isAdmin) held.push(ROLE_HASH.admin)
  if (isGuardian) held.push(ROLE_HASH.guardian)
  if (isLiquidityAdmin) held.push(ROLE_HASH.liquidityAdmin)
  m.reads.hasRole = (role) => Promise.resolve(held.includes(role))
  return {
    runTx,
    node: {
      signer: {},
      account: ACCOUNT,
      chainId: 1,
      provider: providerStub,
      runTx,
      pendingTx: false,
      ...node,
    },
  }
}

beforeEach(() => {
  m.addr = { 1: ROUTER }
  m.events = {}
  m.feeQuote = { available: true, bps: 25, capBps: 250 }
  m.feeThrows = null
  m.pooledToken = null
  const pools = {
    [TRADING_POOL.poolId]: TRADING_POOL,
    [RETIRED_POOL.poolId]: RETIRED_POOL,
    [BRIDGE_POOL.poolId]: BRIDGE_POOL,
  }
  const ids = Object.keys(pools)
  m.reads = {
    paused: () => Promise.resolve(false),
    feeRouter: () => Promise.resolve(VALID),
    positionManager: () => Promise.resolve('0xC36442b4a4522E871399CD717aBDD847Ab11FE88'),
    sanctionsGuard: () => Promise.resolve(VALID),
    MAX_FEE_BPS: () => Promise.resolve(250n),
    poolCount: () => Promise.resolve(BigInt(ids.length)),
    poolAt: (i) => Promise.resolve(ids[Number(i)]),
    getPool: (id) => Promise.resolve(pools[id]),
    queryFilter: (filter) => Promise.resolve(m.events[filter?.__event] || []),
  }
})

describe('SupplyTab — honest empty states', () => {
  it('says the router is not deployed rather than showing empty controls', async () => {
    m.addr = {}
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    expect(await screen.findByText(/No LiquidityRouter is deployed on Ethereum/i)).toBeInTheDocument()
  })

  it('is axe-clean in the not-deployed state', async () => {
    m.addr = {}
    const { container } = render(<SupplyTab {...props({ isAdmin: true }).node} />)
    await screen.findByText(/No LiquidityRouter is deployed/i)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('SupplyTab — the pause is narrow and says so (T128, research R3)', () => {
  it('is labelled "new Uniswap supplies", never "pooling"', async () => {
    render(<SupplyTab {...props({ isGuardian: true }).node} />)
    expect(await screen.findByRole('button', { name: 'Pause new Uniswap supplies' })).toBeInTheDocument()
    expect(screen.getByText('Pauses new Uniswap supplies')).toBeInTheDocument()
    expect(screen.queryByText(/Pauses pooling/i)).not.toBeInTheDocument()
  })

  it('states that it cannot stop bridge-pool deposits, and why', async () => {
    render(<SupplyTab {...props({ isGuardian: true }).node} />)
    await screen.findByRole('button', { name: 'Pause new Uniswap supplies' })
    // The emphasis tags split the sentence across nodes, so the paragraph is read whole.
    const note = screen.getByText(/pause bridge-pool deposits/i).closest('p')
    expect(note.textContent).toMatch(/It does not pause bridge-pool deposits/i)
    expect(note.textContent).toMatch(/no FairWins contract in the path/i)
    expect(note.textContent).toMatch(/what withholds a bridge pool is its enabled flag/i)
    expect(note.textContent).toMatch(/every existing position stays withdrawable/i)
  })

  it('names the paused state as Uniswap-only and keeps positions withdrawable', async () => {
    m.reads.paused = () => Promise.resolve(true)
    render(<SupplyTab {...props({ isGuardian: true }).node} />)
    expect(
      await screen.findByText(/PAUSED — no new Uniswap supplies\. Existing positions are untouched and still withdrawable\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume new Uniswap supplies' })).toBeInTheDocument()
  })

  it('dispatches the pause with Uniswap-only wording', async () => {
    const { node, runTx } = props({ isGuardian: true })
    render(<SupplyTab {...node} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pause new Uniswap supplies' }))
    await waitFor(() => expect(runTx.mock.calls.some((c) => c[1] === 'New Uniswap supplies paused')).toBe(true))
  })
})

describe('SupplyTab — a retired pool is retired, not gone (T129, FR-024)', () => {
  it('keeps the retired pool listed, marked retired and still withdrawable', async () => {
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    expect(within(table).getByText(/RETIRED — closed to new deposits, still withdrawable/)).toBeInTheDocument()
    // Both trading pools are present: retiring one does not remove it from the list.
    expect(within(table).getAllByText(/Trading pool \(Uniswap V3\)/).length).toBe(2)
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument()
  })

  it('shows a position count for it, sourced from the router’s own deposits', async () => {
    m.events.LiquiditySupplied = [
      { blockNumber: 900_000, index: 0, transactionHash: '0xa', args: { poolId: RETIRED_POOL.poolId, tokenId: 1n, amount0: 1_000_000n, amount1: 0n } },
      { blockNumber: 900_001, index: 0, transactionHash: '0xb', args: { poolId: RETIRED_POOL.poolId, tokenId: 2n, amount0: 2_000_000n, amount1: 0n } },
    ]
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    const retiredRow = within(table).getByText(/RETIRED/).closest('tr')
    expect(within(retiredRow).getByText('2')).toBeInTheDocument()
    expect(within(retiredRow).getByText(/3\.0 USDC/)).toBeInTheDocument()
  })

  it('reports a bridge pool’s position COUNT as not observable, never as zero', async () => {
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    const bridgeRow = within(table).getByText(/Bridge pool \(Across\)/).closest('tr')
    // Exactly ONE cell, not two. Attributing LP balances to individual members needs an indexer, so
    // the COUNT genuinely cannot be produced — but the pool's SIZE is a plain HubPool read that the
    // member-facing Supply view already performs, so withholding it too left an operator deciding
    // whether to retire a bridge pool with no figure at all for the money inside it.
    expect(within(bridgeRow).getAllByText('not observable here').length).toBe(1)
    expect(screen.getByText(/would read as “no member has money in this pool”/)).toBeInTheDocument()
  })

  // ── AN UNREADABLE SCAN IS NOT A ZERO ─────────────────────────────────────────────────────────
  // The error path stored an EMPTY map rather than a null one, so the cell fell through to `?? 0` and
  // printed "0 positions" against a pool members still hold LP in — at the exact moment an operator
  // is deciding whether to retire it. That is the one claim FR-024 exists to prevent.
  it('says the position count is unknown when the deposit scan fails, never 0', async () => {
    m.reads.queryFilter = () => Promise.reject(new Error('query returned more than 10000 results'))
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    const retiredRow = within(table).getByText(/RETIRED/).closest('tr')
    await waitFor(() =>
      expect(within(retiredRow).getAllByText(/unknown — the scan failed/).length).toBe(2),
    )
    expect(within(retiredRow).queryByText('0')).not.toBeInTheDocument()
  })

  it('distinguishes "none in window" from a failed scan', async () => {
    // The lookback is bounded, so a pool whose deposits predate it has nothing to show — which is a
    // different statement from "the scan would not run", and a different one again from zero.
    m.reads.queryFilter = () => Promise.resolve([])
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    const retiredRow = within(table).getByText(/RETIRED/).closest('tr')
    await waitFor(() => expect(within(retiredRow).getAllByText('none in window').length).toBe(2))
  })

  it('reads a bridge pool’s size from the HubPool, and says so when that read fails', async () => {
    m.pooledToken = { liquidReserves: 4_000_000n, utilizedReserves: 1_000_000n }
    const { unmount } = render(<SupplyTab {...props({ isAdmin: true }).node} />)
    let table = await screen.findByRole('table', { name: 'Curated pools' })
    let bridgeRow = within(table).getByText(/Bridge pool \(Across\)/).closest('tr')
    await waitFor(() => expect(within(bridgeRow).getByText(/5\.0 USDC in the pool/)).toBeInTheDocument())
    unmount()

    // An unreadable HubPool is not an empty pool.
    m.pooledToken = null
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    table = await screen.findByRole('table', { name: 'Curated pools' })
    bridgeRow = within(table).getByText(/Bridge pool \(Across\)/).closest('tr')
    await waitFor(() =>
      expect(within(bridgeRow).getByText(/unknown — the HubPool could not be read/)).toBeInTheDocument(),
    )
  })

  it('dispatches retire and reopen', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    await screen.findByRole('table', { name: 'Curated pools' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Retire' })[0])
    await waitFor(() =>
      expect(runTx.mock.calls.some((c) => /existing positions untouched/.test(c[1]))).toBe(true),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(runTx.mock.calls.some((c) => /reopened/.test(c[1]))).toBe(true))
  })
})

describe('SupplyTab — per-leg caps (T130, FR-045)', () => {
  it('renders two ceilings for a trading pool and dispatches both', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    // 10,000 USDC on leg 0, uncapped on leg 1 — not one scalar for both.
    expect(within(table).getByText(/10000\.0 USDC/)).toBeInTheDocument()

    fireEvent.change(screen.getAllByLabelText(/Per-transaction cap for USDC in pool/i)[0], {
      target: { value: '500' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Set caps' })[0])
    await waitFor(() => expect(runTx.mock.calls.some((c) => /caps updated/.test(c[1]))).toBe(true))
  })

  // ── SETTING ONE CEILING MUST NOT DELETE THE OTHER ────────────────────────────────────────────
  // `setPoolLimit` writes BOTH legs in one call, and 0 means UNCAPPED on-chain. The blank leg used to
  // default to '0', so typing a new WETH ceiling on a pool capped at 10,000 USDC silently removed the
  // USDC cap and reported success — a member-facing limit deleted by an operator who never touched
  // it. The old test filled only leg 0 and asserted nothing about the values sent, so it was blind
  // to this; these three assert the ARGUMENTS.
  it('keeps the untouched leg’s current ceiling instead of writing 0 over it', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    await screen.findByRole('table', { name: 'Curated pools' })

    // Type ONLY the WETH leg. The pool is capped at 10,000 USDC on leg 0 and uncapped on leg 1.
    fireEvent.change(screen.getAllByLabelText(/Per-transaction cap for WETH in pool/i)[0], {
      target: { value: '2' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Set caps' })[0])
    await waitFor(() => expect(runTx).toHaveBeenCalled())

    // Inspect what the transaction thunk actually asks the contract for.
    const args = []
    m.reads.setPoolLimit = (...a) => {
      args.push(a)
      return Promise.resolve({ wait: () => Promise.resolve() })
    }
    await runTx.mock.calls[runTx.mock.calls.length - 1][0]()
    expect(args.length).toBe(1)
    const [, max0, max1] = args[0]
    expect(max0).toBe(TRADING_POOL.maxDeposit0PerTx) // 10,000 USDC preserved, not zeroed
    expect(max1).toBe(ethersActual.parseUnits('2', 18))
  })

  it('refuses to write anything when both cap boxes are blank', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    await screen.findByRole('table', { name: 'Curated pools' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Set caps' })[0])
    expect(screen.getByRole('alert')).toHaveTextContent(/Type a new ceiling first/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/enter 0 explicitly/i)
    expect(runTx).not.toHaveBeenCalled()
  })

  it('still accepts an explicit 0 as uncapped', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    await screen.findByRole('table', { name: 'Curated pools' })

    fireEvent.change(screen.getAllByLabelText(/Per-transaction cap for USDC in pool/i)[0], {
      target: { value: '0' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Set caps' })[0])
    await waitFor(() => expect(runTx.mock.calls.some((c) => /caps updated/.test(c[1]))).toBe(true))
  })

  it('marks a bridge pool’s cap as app-honoured, not contract-enforced', async () => {
    render(<SupplyTab {...props({ isLiquidityAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Curated pools' })
    const bridgeRow = within(table).getByText(/Bridge pool \(Across\)/).closest('tr')
    // The router's limit check lives inside the Uniswap supply path; a bridge-LP deposit is a direct
    // member call to Across that never enters it. Same property the pause card explains for the
    // enabled flag, so the number does not get to imply enforcement it does not have.
    expect(within(bridgeRow).getByText(/honoured by this app, not by the contract/i)).toBeInTheDocument()
  })

  it('refuses a mis-scaled cap before the wallet prompt', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    await screen.findByRole('table', { name: 'Curated pools' })
    fireEvent.change(screen.getAllByLabelText(/Per-transaction cap for USDC in pool/i)[0], {
      target: { value: 'lots' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Set caps' })[0])
    expect(screen.getByRole('alert')).toHaveTextContent(/Enter an amount in USDC/i)
    expect(runTx).not.toHaveBeenCalled()
  })
})

describe('SupplyTab — listing a pool (FR-041/FR-042)', () => {
  it('refuses the listing shapes the contract refuses, with the reason', async () => {
    const { node, runTx } = props({ isLiquidityAdmin: true })
    render(<SupplyTab {...node} />)
    await screen.findByRole('button', { name: 'Save pool listing' })

    fireEvent.click(screen.getByRole('button', { name: 'Save pool listing' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/pool address and the first asset must both be valid/i)

    fireEvent.change(screen.getByPlaceholderText('pool 0x…'), { target: { value: POOL_ADDR } })
    fireEvent.change(screen.getByPlaceholderText('token0 0x…'), { target: { value: USDC_ETH } })
    fireEvent.change(screen.getByPlaceholderText('token1 0x…'), { target: { value: WETH } })
    fireEvent.click(screen.getByRole('button', { name: 'Save pool listing' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/needs its Uniswap fee tier/i)
    expect(runTx).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('500 / 3000 / 10000'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save pool listing' }))
    await waitFor(() => expect(runTx.mock.calls.some((c) => /Pool listing saved/.test(c[1]))).toBe(true))
  })

  it('checks the named pool before signing and explains a non-pool address', async () => {
    const { node } = props({ isLiquidityAdmin: true })
    m.reads.token0 = () => Promise.reject(new Error('not a pool'))
    render(<SupplyTab {...node} />)
    await screen.findByRole('button', { name: 'Check pool' })
    fireEvent.change(screen.getByPlaceholderText('pool 0x…'), { target: { value: POOL_ADDR } })
    fireEvent.click(screen.getByRole('button', { name: 'Check pool' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/did not answer as a Uniswap V3 pool/i),
    )
  })

  it('fills the legs from the pool itself when it does answer', async () => {
    const { node } = props({ isLiquidityAdmin: true })
    m.reads.token0 = () => Promise.resolve(USDC_ETH)
    m.reads.token1 = () => Promise.resolve(WETH)
    m.reads.fee = () => Promise.resolve(500n)
    render(<SupplyTab {...node} />)
    await screen.findByRole('button', { name: 'Check pool' })
    fireEvent.change(screen.getByPlaceholderText('pool 0x…'), { target: { value: POOL_ADDR } })
    fireEvent.click(screen.getByRole('button', { name: 'Check pool' }))
    await waitFor(() => expect(screen.getByText(/Pool confirmed: USDC \/ WETH at 0\.05%/)).toBeInTheDocument())
  })
})

describe('SupplyTab — fee is read-only (T132, FR-048)', () => {
  it('shows the live rate with its cap and the bridge-pool fee-free rule', async () => {
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    expect(await screen.findByText(/25 bps \(0\.25%\) — service cap 250 bps/)).toBeInTheDocument()
    expect(screen.getByText(/read-only here/i)).toBeInTheDocument()
    expect(screen.getByText(/carries no FairWins fee/i)).toBeInTheDocument()
  })

  it('says the rate could not be read and keeps the other controls usable', async () => {
    m.feeThrows = new Error('FeeRouter unreachable')
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    expect(await screen.findByText(/could not be read — members cannot start a fee-bearing supply/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause new Uniswap supplies' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save pool listing' })).toBeEnabled()
  })
})

describe('SupplyTab — least privilege and history', () => {
  it('a guardian gets the pause and no configuration controls', async () => {
    render(<SupplyTab {...props({ isGuardian: true }).node} />)
    await screen.findByRole('button', { name: 'Pause new Uniswap supplies' })
    expect(screen.queryByText('Protocol addresses')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save pool listing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument()
  })

  it('an operator with none of the three can act on nothing', async () => {
    render(<SupplyTab {...props().node} />)
    await screen.findByRole('table', { name: 'Curated pools' })
    expect(screen.queryByRole('button', { name: /Pause/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retire/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Set caps/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Protocol addresses')).not.toBeInTheDocument()
  })

  it('decodes retirement in the history and says it stays withdrawable', async () => {
    m.events.PoolEnabledChanged = [
      {
        blockNumber: 999_000,
        index: 0,
        transactionHash: '0xhist',
        args: { poolId: RETIRED_POOL.poolId, enabled: false, actor: VALID },
      },
    ]
    render(<SupplyTab {...props({ isAdmin: true }).node} />)
    const table = await screen.findByRole('table', { name: 'Change history' })
    expect(within(table).getByText('Pool availability')).toBeInTheDocument()
    expect(within(table).getByText('retired (still visible and withdrawable)')).toBeInTheDocument()
  })

  it('is axe-clean fully loaded', async () => {
    const { container } = render(<SupplyTab {...props({ isAdmin: true }).node} />)
    await screen.findByRole('table', { name: 'Curated pools' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
