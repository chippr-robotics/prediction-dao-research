/**
 * Spec 071 US4 (T053) — the shared scope controls every operator view uses.
 *
 * These encode three rules that were each a real defect first:
 *   • scope is a network the operator picks, not the wallet's
 *   • the scope does NOT follow the wallet (FR-016) — an operator mid-audit must not have their
 *     reading silently re-targeted
 *   • a withheld write says WHY, in words, before signing (FR-018) — and an UNCONFIRMED
 *     authority read leaves the control offered, because withdrawing a killswitch on an RPC
 *     timeout tells an operator who holds it that there isn't one
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { NetworkScopeCard, WriteScopeNotice, WriteGate } from '../../components/admin/scopeControls'
import { useScopedChain, writeGateReason, writeAllowed } from '../../components/admin/scopeGate'
import { NETWORKS, cohortChainIds } from '../../config/networks'

const COHORT = cohortChainIds()
const A = COHORT[0]
const B = COHORT[1]
const networks = COHORT.map((id) => NETWORKS[id])
const deployedEverywhere = () => true

describe('useScopedChain — the scope does not follow the wallet (FR-016)', () => {
  it('defaults to the wallet chain when it is in the roster', () => {
    const { result } = renderHook(() => useScopedChain(networks, B))
    expect(result.current.scopeChainId).toBe(B)
  })

  it('falls back to the first roster entry when the wallet is elsewhere', () => {
    const { result } = renderHook(() => useScopedChain(networks, 999999))
    expect(result.current.scopeChainId).toBe(networks[0].chainId)
  })

  it('does NOT re-target when the wallet changes network', () => {
    const { result, rerender } = renderHook(({ w }) => useScopedChain(networks, w), {
      initialProps: { w: A },
    })
    expect(result.current.scopeChainId).toBe(A)

    rerender({ w: B }) // wallet moved

    // The operator is still looking at what they chose. Only write availability changes.
    expect(result.current.scopeChainId).toBe(A)
  })

  it('lets a view jump to the wallet chain explicitly, when the operator asks', () => {
    const { result } = renderHook(() => useScopedChain(networks, B))
    act(() => result.current.setScopeChainId(A))
    expect(result.current.scopeChainId).toBe(A)
    act(() => result.current.scopeToWallet())
    expect(result.current.scopeChainId).toBe(B)
  })
})

describe('NetworkScopeCard', () => {
  const renderCard = (props = {}) =>
    render(
      <NetworkScopeCard
        title="Test Controls"
        description="Per-network control state."
        networks={networks}
        scopeChainId={A}
        onScopeChange={props.onScopeChange || vi.fn()}
        isDeployed={props.isDeployed || deployedEverywhere}
        walletChainId={props.walletChainId ?? A}
        onRefresh={vi.fn()}
        lastReadAt={null}
        notDeployedLabel={props.notDeployedLabel}
      />,
    )

  it('lists every network in the roster, including undeployed ones', () => {
    renderCard({ isDeployed: (id) => Number(id) === Number(A) })
    const select = screen.getByLabelText(/^Network/)
    expect(select.querySelectorAll('option')).toHaveLength(networks.length)
  })

  it('marks an undeployed network with contract-neutral wording by default', () => {
    renderCard({ isDeployed: (id) => Number(id) === Number(A) })
    // The old copy said "no router deployed", which is wrong for a MembershipManager view.
    expect(screen.getByText(new RegExp(`${NETWORKS[B].name} — not deployed here`))).toBeInTheDocument()
  })

  it('lets a view name what is not deployed', () => {
    renderCard({ isDeployed: () => false, notDeployedLabel: 'no MembershipManager' })
    expect(screen.getAllByText(/no MembershipManager/).length).toBeGreaterThan(0)
  })

  it('says where the wallet is, so scope and wallet are never confused', () => {
    renderCard({ walletChainId: B })
    expect(screen.getByText(new RegExp(`${NETWORKS[B].name} \\(wallet is here\\)`))).toBeInTheDocument()
  })

  it('reports scope changes to the view', () => {
    const onScopeChange = vi.fn()
    renderCard({ onScopeChange })
    fireEvent.change(screen.getByLabelText(/^Network/), { target: { value: String(B) } })
    expect(onScopeChange).toHaveBeenCalledWith(B)
  })

  it('is axe-clean', async () => {
    const { container } = renderCard()
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('WriteScopeNotice — a withheld write explains itself (FR-018)', () => {
  it('names the network to switch to when the wallet is elsewhere', () => {
    render(<WriteScopeNotice scopeChainId={A} walletChainId={B} signer={{}} canWrite />)
    expect(screen.getByText(new RegExp(`switch your wallet to it`, 'i'))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(NETWORKS[A].name))).toBeInTheDocument()
  })

  it('says reading is unaffected — the scope is not broken, only signing is', () => {
    render(<WriteScopeNotice scopeChainId={A} walletChainId={B} signer={{}} canWrite />)
    expect(screen.getByText(/Reading is unaffected/i)).toBeInTheDocument()
  })

  it('asks for a wallet when there is none, without implying a permissions problem', () => {
    render(<WriteScopeNotice scopeChainId={A} walletChainId={A} signer={null} canWrite />)
    expect(screen.getByText(/readable without one/i)).toBeInTheDocument()
  })

  it('says nothing when the wallet is on the scoped network', () => {
    const { container } = render(<WriteScopeNotice scopeChainId={A} walletChainId={A} signer={{}} canWrite />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('the write gate distinguishes four different situations', () => {
  const base = { deployed: true, onWalletChain: true, held: true, readable: true, scopeChainId: A }

  it('allows a write when everything lines up', () => {
    expect(writeAllowed(base)).toBe(true)
    expect(writeGateReason(base)).toBeNull()
  })

  it('withholds and says so when the contract is not deployed there', () => {
    const g = { ...base, deployed: false }
    expect(writeAllowed(g)).toBe(false)
    expect(writeGateReason(g)).toMatch(/Not deployed on/)
  })

  it('withholds and names the network when the wallet is elsewhere', () => {
    const g = { ...base, onWalletChain: false }
    expect(writeAllowed(g)).toBe(false)
    expect(writeGateReason(g)).toMatch(new RegExp(`Switch your wallet to ${NETWORKS[A].name}`))
  })

  it('withholds on a definite "role not held", and says switching will not help', () => {
    const g = { ...base, held: false }
    expect(writeAllowed(g)).toBe(false)
    expect(writeGateReason(g)).toMatch(/do not hold this role/)
  })

  it('KEEPS the control offered when authority could not be read, and says it is unconfirmed', () => {
    // The spec-067 FR-044 rule: an RPC timeout must not look like "there is no killswitch".
    const g = { ...base, readable: false, held: false }
    expect(writeAllowed(g)).toBe(true)
    expect(writeGateReason(g)).toMatch(/could not be confirmed/)
    expect(writeGateReason(g)).toMatch(/contract will still refuse/)
  })

  it('reports not-deployed ahead of a wrong network — the more fundamental answer wins', () => {
    const g = { ...base, deployed: false, onWalletChain: false }
    expect(writeGateReason(g)).toMatch(/Not deployed/)
  })
})

describe('WriteGate renders the gate and its reason together', () => {
  it('passes the verdict to the control and shows the reason beside it', () => {
    render(
      <WriteGate deployed onWalletChain={false} held readable scopeChainId={A}>
        {({ allowed }) => (
          <button type="button" disabled={!allowed}>
            Do the thing
          </button>
        )}
      </WriteGate>,
    )
    expect(screen.getByRole('button', { name: 'Do the thing' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/Switch your wallet/)
  })

  it('renders no reason when the write is allowed', () => {
    render(
      <WriteGate deployed onWalletChain held readable scopeChainId={A}>
        {({ allowed }) => <button type="button" disabled={!allowed}>Go</button>}
      </WriteGate>,
    )
    expect(screen.getByRole('button', { name: 'Go' })).toBeEnabled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
