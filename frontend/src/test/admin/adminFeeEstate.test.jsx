/**
 * Spec 071 US3 (T048) — fees across the whole estate, honestly.
 *
 * The defect: one network's `accruedFees` was shown without qualification, as "Accrued tier
 * fees: N USDC". An operator acts on that as if it were the total. Under-reporting the treasury
 * is a financial-reporting error, not a display bug.
 *
 * Three things this pins, all of which are ways to state a number that is not true:
 *   1. an unreadable network rendering as a zero, or vanishing from a total without a trace
 *   2. balances in different tokens summed into one invented figure
 *   3. accrued (still owed to us) added to received (already delivered)
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ethers } from 'ethers'
import ChainStateTable from '../../components/admin/ChainStateTable'
import { readOk, notDeployed, unreadable, aggregate } from '../../lib/chains/chainReadResult'
import { feeUnitFor } from '../../hooks/useFeeEstate'
import { cohortChainIds, NETWORKS } from '../../config/networks'
import adminPanelSource from '../../components/admin/apps/MembershipRevenueApp.jsx?raw'

const USDC = { symbol: 'USDC', decimals: 6 }
const USC = { symbol: 'USC', decimals: 6 }

const rowFor = (container, name) =>
  [...container.querySelectorAll('.chain-state-row')].find((tr) =>
    within(tr).queryByText(name, { selector: 'th' }),
  )

describe('every network appears, in exactly one of the three states (FR-014, FR-021)', () => {
  const results = [readOk(80002, 1_500_000n, USDC), notDeployed(63), unreadable(1337, 'endpoint down')]

  it('shows a read balance with its own unit', () => {
    const { container } = render(<ChainStateTable results={results} caption="Accrued" />)
    const row = rowFor(container, NETWORKS[80002].name)
    expect(within(row).getByText('1.5 USDC')).toBeInTheDocument()
  })

  it('says "not deployed" explicitly rather than rendering a zero or a blank', () => {
    const { container } = render(<ChainStateTable results={results} caption="Accrued" />)
    const row = rowFor(container, NETWORKS[63].name)
    expect(within(row).getByText(/Not deployed on this network/i)).toBeInTheDocument()
    expect(row.textContent).not.toMatch(/\b0(\.0+)?\s*(USDC|USC)\b/)
  })

  it('says an unreadable network could not be read, WITH the reason — never as a zero', () => {
    const { container } = render(<ChainStateTable results={results} caption="Accrued" />)
    const row = rowFor(container, NETWORKS[1337].name)
    expect(within(row).getByText(/Could not be read/i)).toBeInTheDocument()
    expect(row.textContent).toContain('endpoint down')
    expect(row.textContent).not.toMatch(/\b0(\.0+)?\s*(USDC|USC)\b/)
  })

  it('offers a retry on an unreadable network', () => {
    const onRetry = vi.fn()
    const { container } = render(<ChainStateTable results={results} caption="Accrued" onRetry={onRetry} />)
    const row = rowFor(container, NETWORKS[1337].name)
    within(row).getByRole('button', { name: /retry/i }).click()
    expect(onRetry).toHaveBeenCalled()
  })

  it('accounts for every network it was given — none silently omitted (SC-003)', () => {
    const { container } = render(<ChainStateTable results={results} caption="Accrued" />)
    expect(container.querySelectorAll('.chain-state-row')).toHaveLength(results.length)
  })
})

describe('totals are per unit and never cross tokens (FR-022, SC-004)', () => {
  // The test cohort genuinely spans two tokens: Amoy holds USDC, Mordor holds Classic USD.
  it('the fixture is real: two cohort chains declare different payment tokens', () => {
    const symbols = new Set(
      cohortChainIds().map((id) => feeUnitFor(id)?.symbol).filter(Boolean),
    )
    expect(symbols.size).toBeGreaterThan(1)
  })

  it('renders one subtotal per token, never one combined figure', () => {
    const results = [readOk(80002, 1_000_000n, USDC), readOk(63, 2_000_000n, USC)]
    const { container } = render(
      <ChainStateTable results={results} caption="Accrued" totals={aggregate(results)} />,
    )

    // Scope to the totals block: the per-row values also read "1.0 USDC", and it is the
    // TOTALS that must not cross units.
    const totalsEl = container.querySelector('.chain-state-totals')
    expect(totalsEl.textContent).toMatch(/1\.0 USDC/)
    expect(totalsEl.textContent).toMatch(/2\.0 USC/)
    // 3.0 of anything would be the invented cross-unit sum.
    expect(totalsEl.textContent).not.toMatch(/3\.0/)
  })
})

describe('a partial total says so and names what is missing (FR-023, SC-007)', () => {
  it('flags partial and names the excluded network', () => {
    const results = [readOk(80002, 1_000_000n, USDC), unreadable(63, 'timeout')]
    render(<ChainStateTable results={results} caption="Accrued" totals={aggregate(results)} />)

    const note = screen.getByRole('status')
    expect(note).toHaveTextContent(/Partial/i)
    expect(note).toHaveTextContent(NETWORKS[63].name)
  })

  it('does NOT flag partial when a network is merely not deployed', () => {
    const results = [readOk(80002, 1_000_000n, USDC), notDeployed(63)]
    render(<ChainStateTable results={results} caption="Accrued" totals={aggregate(results)} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('the total does not silently shrink — the same figure, but labelled incomplete', () => {
    const complete = aggregate([readOk(80002, 1_000_000n, USDC)])
    const withGap = aggregate([readOk(80002, 1_000_000n, USDC), unreadable(63, 'timeout')])

    expect(withGap.subtotals.USDC).toBe(complete.subtotals.USDC)
    expect(withGap.partial).toBe(true)
    expect(complete.partial).toBe(false)
  })
})

describe('accrued and received are never combined (research R6)', () => {
  it('are rendered as two separate tables with distinct captions', () => {
    const accrued = [readOk(80002, 1_000_000n, USDC)]
    const received = [readOk(80002, 5_000_000n, USDC)]
    const { container } = render(
      <>
        <ChainStateTable results={accrued} caption="Accrued (undrawn)" totals={aggregate(accrued)} />
        <ChainStateTable results={received} caption="Treasury balance (received)" totals={aggregate(received)} />
      </>,
    )

    // Each caption renders twice (visible heading + the table's screen-reader caption).
    expect(screen.getAllByText(/Accrued \(undrawn\)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Treasury balance \(received\)/).length).toBeGreaterThan(0)
    // 6.0 USDC would be the two summed — money still owed added to money already paid.
    expect(container.textContent).not.toMatch(/6\.0 USDC/)
  })
})

describe('feeUnitFor — a unit is config or nothing, never guessed', () => {
  it('returns the configured stablecoin for a chain that has one', () => {
    const unit = feeUnitFor(80002)
    expect(unit).toMatchObject({ symbol: NETWORKS[80002].stablecoin.symbol })
  })

  it('returns null for a chain with no configured payment token', () => {
    expect(feeUnitFor(999999)).toBeNull()
  })

  it('a value with no unit is excluded from totals rather than bucketed by guess', () => {
    const agg = aggregate([readOk(80002, 1_000_000n, USDC), readOk(63, 5n, null)])
    expect(Object.keys(agg.subtotals)).toEqual(['USDC'])
    expect(agg.partial).toBe(true)
  })
})

describe('formatting refuses to guess a scale', () => {
  it('renders raw units, and says so, rather than mis-scaling an unformattable value', () => {
    const results = [readOk(80002, 'not-a-number', USDC)]
    const { container } = render(<ChainStateTable results={results} caption="Accrued" />)
    expect(container.textContent).toMatch(/raw units/)
  })

  it('formats a genuine zero as a zero — a read answer, not a gap', () => {
    const results = [readOk(80002, 0n, USDC)]
    const { container } = render(<ChainStateTable results={results} caption="Accrued" />)
    expect(container.textContent).toContain(`${ethers.formatUnits(0n, 6)} USDC`)
    expect(container.textContent).not.toMatch(/Could not be read|Not deployed/)
  })
})

// ── T047: a withdrawal is a WRITE, so it targets one named chain ────────────────────────────
// `withdrawFees` moves money on exactly one MembershipManager. An estate total is not something
// any single call could move, and a Max button filled from an unread balance would be a guess.
describe('the Treasury withdrawal is scoped to one named chain (FR-017, FR-018)', () => {
  const source = adminPanelSource

  it('sends to the SCOPED chain\'s MembershipManager, not the wallet chain\'s', () => {
    expect(source).toMatch(/getContractAddressForChain\('membershipManager', withdrawChainId\)/)
  })

  it('refuses to sign while the wallet is on a different chain, before the transaction', () => {
    expect(source).toMatch(/Number\(chainId\) !== Number\(withdrawChainId\)/)
    expect(source).toContain('Switch your wallet there first')
  })

  it('names the chain in the confirmation', () => {
    expect(source).toMatch(/Withdrew \$\{withdrawForm\.amount\} \$\{symbol\} to \$\{shortAddr\(target\)\} on \$\{networkName\(withdrawChainId\)\}/)
  })

  it('offers Max only when that chain\'s balance was actually read', () => {
    expect(source).toMatch(/disabled=\{!withdrawScope \|\| !isRead\(withdrawScope\)\}/)
  })

  it('uses the scoped chain\'s own decimals and symbol, not a hardcoded USDC', () => {
    expect(source).toMatch(/withdrawScope\?\.unit\?\.decimals \?\? USDC_DECIMALS/)
    expect(source).toMatch(/withdrawScope\?\.unit\?\.symbol \?\? 'USDC'/)
  })

  it('does not let the scope follow the wallet once chosen (FR-016)', () => {
    // The effect seeds the scope only while it is null; it never re-assigns on a chainId change.
    expect(source).toMatch(/if \(withdrawChainId != null \|\| feeEstate\.accrued\.length === 0\) return/)
  })
})
