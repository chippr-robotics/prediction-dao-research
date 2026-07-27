// Spec 068 (US2/US4, T022+T031) — the ordered-policy surface: status routing, staging a change,
// the before/after review, the single-pending-change rule (FR-019), and the two-step adopt flow.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { ZeroAddress } from 'ethers'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const VAULT = '0x9999999999999999999999999999999999999999'
const GUARD = '0xc01E5F3EAFd2C0138e98382A3F54B6CeB3dc05cf'

let status = 'none'
let policyV2 = { rules: [], cooldown: 0, accounting: [] }
let pendingClassification = null

const buildRulesChangeTx = vi.fn(() => ({ to: GUARD, value: 0n, data: '0xaaaa' }))
const buildAdoptV2Txs = vi.fn(() => [
  { to: GUARD, value: 0n, data: '0xaaaa' },
  { to: VAULT, value: 0n, data: '0xbbbb' },
])

vi.mock('../../lib/custody/policyV2', async () => {
  const actual = await vi.importActual('../../lib/custody/policyV2')
  return {
    ...actual,
    isPolicyV2Supported: () => true,
    getPolicyStatus: vi.fn(async () => status),
    readPolicyV2: vi.fn(async () => policyV2),
    buildRulesChangeTx: (...a) => buildRulesChangeTx(...a),
    buildAdoptV2Txs: (...a) => buildAdoptV2Txs(...a),
    classifyPolicyProposalV2: () => pendingClassification,
  }
})
vi.mock('../../lib/custody/policy', async (importOriginal) => ({
  ...(await importOriginal()),
  readPolicy: vi.fn(async () => ({
    cooldown: 3600,
    allowlistEnabled: true,
    allowlist: [BOB],
    assetRules: [{ asset: ZeroAddress, perTxLimit: 1000n, windowLimit: 0n }],
  })),
}))
vi.mock('../../components/ui/AddressInput', () => ({
  default: ({ id, value, onChange }) => <input id={id} value={value} onChange={onChange} />,
}))
vi.mock('../../components/ui/AddressBookButton', () => ({ default: () => <button type="button">Address book</button> }))
vi.mock('../../components/ui/QRScanner', () => ({ default: () => null }))

import PolicyPanelV2 from '../../components/custody/PolicyPanelV2'

const vault = (over = {}) => ({
  address: VAULT,
  chainId: 1337,
  owners: [ALICE, BOB],
  threshold: 2,
  owner: true,
  isSafe: true,
  ...over,
})

const rule = (over = {}) => ({
  asset: '0x0000000000000000000000000000000000000001',
  perTxLimit: 0n,
  windowLimit: 0n,
  approvalsRequired: 0,
  banded: false,
  approvers: [],
  targets: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  status = 'none'
  policyV2 = { rules: [], cooldown: 0, accounting: [] }
  pendingClassification = null
})

describe('PolicyPanelV2', () => {
  it('says plainly when a vault has no policy at all', async () => {
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    expect(await screen.findByText(/any transaction its owners approve can execute/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add rules/i })).toBeInTheDocument()
  })

  it('renders live ordered rules with their numbers', async () => {
    status = 'managed-v2'
    policyV2 = { rules: [rule({ approvers: [ALICE, BOB], approvalsRequired: 2 }), rule()], cooldown: 0, accounting: [] }
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    expect(await screen.findByText('001')).toBeInTheDocument()
    expect(screen.getByText('002')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change rules/i })).toBeInTheDocument()
  })

  it('keeps legacy v1 rules visible, unnumbered, with an upgrade path (FR-020)', async () => {
    status = 'managed'
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    expect(await screen.findByText(/earlier, unordered rules/i)).toBeInTheDocument()
    expect(screen.getByText(/still enforced exactly as before/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upgrade to ordered rules/i })).toBeInTheDocument()
    expect(screen.queryByText('001')).not.toBeInTheDocument()
  })

  it('pre-populates the upgrade draft from the v1 policy rather than starting empty', async () => {
    status = 'managed'
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /upgrade to ordered rules/i }))
    // The v1 asset rule becomes rule 001 in the draft (shown in the editor AND the "after" column).
    await waitFor(() => expect(screen.getAllByText('001').length).toBeGreaterThan(0))
    // The v1 allowlist carries over as that rule's destinations, so the upgrade is not lossy
    // (addresses render shortened, as everywhere else in the app).
    expect(screen.getAllByText(/only to 0x2222/i).length).toBeGreaterThan(0)
  })

  it('does not manage policy for a view-only member', async () => {
    render(<PolicyPanelV2 vault={vault({ owner: false })} onPropose={vi.fn()} />)
    await screen.findByText(/any transaction its owners approve/i)
    expect(screen.queryByRole('button', { name: /add rules/i })).not.toBeInTheDocument()
  })

  it('blocks staging a second change while one is pending approval (FR-019)', async () => {
    status = 'managed-v2'
    pendingClassification = { kind: 'set-rules', rules: [] }
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} queue={[{ to: GUARD, data: '0x' }]} />)
    expect(await screen.findByText(/already waiting for approvals/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change rules/i })).not.toBeInTheDocument()
  })

  it('shows a before/after review including order, and warns that windows restart (FR-018)', async () => {
    status = 'managed-v2'
    policyV2 = { rules: [rule()], cooldown: 0, accounting: [] }
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /change rules/i }))
    expect(screen.getByRole('heading', { name: /^now$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /after approval/i })).toBeInTheDocument()
    expect(screen.getByText(/restarts their 24-hour windows/i)).toBeInTheDocument()
    expect(screen.getByText(/only after the vault’s owners approve/i)).toBeInTheDocument()
  })

  it('warns loudly when a draft would deny everything', async () => {
    status = 'managed-v2'
    policyV2 = { rules: [rule()], cooldown: 0, accounting: [] }
    render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /change rules/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove rule 001/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/denies every transaction/i)
  })

  it('reorders the staged rules and proposes ONE setRules change (FR-017/US4)', async () => {
    status = 'managed-v2'
    const a = rule({ perTxLimit: 1n })
    const b = rule({ perTxLimit: 2n })
    policyV2 = { rules: [a, b], cooldown: 0, accounting: [] }
    const onPropose = vi.fn(async () => ({ nonce: 7 }))
    render(<PolicyPanelV2 vault={vault()} onPropose={onPropose} />)

    fireEvent.click(await screen.findByRole('button', { name: /change rules/i }))
    fireEvent.click(screen.getAllByRole('button', { name: /move rule 002 up/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /propose policy change/i }))

    await waitFor(() => expect(onPropose).toHaveBeenCalledTimes(1))
    const [rules] = buildRulesChangeTx.mock.calls[0].slice(1)
    expect(rules[0].perTxLimit).toBe(2n) // the swap is what gets proposed
    expect(await screen.findByText(/takes effect once the vault’s owners approve/i)).toBeInTheDocument()
  })

  it('adopts the engine as two ordered proposals: rules first, then the guard', async () => {
    status = 'none'
    const onPropose = vi.fn(async () => ({ nonce: 4 }))
    render(<PolicyPanelV2 vault={vault()} onPropose={onPropose} />)
    fireEvent.click(await screen.findByRole('button', { name: /add rules/i }))
    fireEvent.click(screen.getByRole('button', { name: /propose policy change/i }))

    await waitFor(() => expect(onPropose).toHaveBeenCalledTimes(2))
    expect(onPropose.mock.calls[0][0].to).toBe(GUARD)
    expect(onPropose.mock.calls[1][0].to).toBe(VAULT)
    expect(onPropose.mock.calls[1][0].nonce).toBe(5) // consecutive, so the chain enforces order
  })

  it('surfaces a validation failure instead of proposing an invalid policy', async () => {
    status = 'managed-v2'
    policyV2 = { rules: [rule({ approvers: ['0x3333333333333333333333333333333333333333'], approvalsRequired: 1 })], cooldown: 0, accounting: [] }
    const onPropose = vi.fn()
    render(<PolicyPanelV2 vault={vault()} onPropose={onPropose} />)
    fireEvent.click(await screen.findByRole('button', { name: /change rules/i }))
    fireEvent.click(screen.getByRole('button', { name: /propose policy change/i }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(onPropose).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    status = 'managed-v2'
    policyV2 = { rules: [rule()], cooldown: 0, accounting: [] }
    const { container } = render(<PolicyPanelV2 vault={vault()} onPropose={vi.fn()} />)
    await screen.findByText('001')
    expect(await axe(container)).toHaveNoViolations()
  })
})
