// Spec 049 (US2, FR-005/FR-006/FR-013) — PolicyPanel read states: managed rules + live window
// state + allowlist + window disclosure, foreign-guard notice, unsupported-network notice, and the
// non-owner (view-only) rule that no management actions render. The policy lib is mocked — the
// panel's rendering logic is the unit under test (chain reads are covered by policy.test.js).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'

const getPolicyStatus = vi.fn()
const readPolicy = vi.fn()
const describeRules = vi.fn()

vi.mock('../../lib/custody/policy', () => ({
  getPolicyStatus: (...a) => getPolicyStatus(...a),
  readPolicy: (...a) => readPolicy(...a),
  describeRules: (...a) => describeRules(...a),
  validatePolicyConfig: vi.fn(),
  buildPolicyChangeTx: vi.fn(),
  buildSetGuardTx: vi.fn(),
  NATIVE_ASSET: '0x0000000000000000000000000000000000000000',
  shortAddress: (a) => String(a),
}))

import PolicyPanel from '../../components/custody/PolicyPanel'

const NATIVE = '0x0000000000000000000000000000000000000000'
const VAULT = '0x2222222222222222222222222222222222222222'
const R1 = '0x1111111111111111111111111111111111111111'
const R2 = '0x3333333333333333333333333333333333333333'

const ONE = 10n ** 18n

const managedPolicy = {
  hasRules: true,
  allowlistEnabled: true,
  allowlistCount: 2,
  cooldown: 3600,
  nextAllowedAt: Math.floor(Date.now() / 1000) + 1800, // 30 min in the future
  allowlist: [R1, R2],
  assetRules: [
    {
      asset: NATIVE,
      perTxLimit: ONE,
      windowLimit: 5n * ONE,
      spentInWindow: 2n * ONE,
      windowStart: 0,
      remainingInWindow: 3n * ONE,
    },
  ],
}

const vault = (overrides = {}) => ({
  isSafe: true,
  address: VAULT,
  chainId: 1337,
  owners: [R1],
  threshold: 2,
  owner: false,
  ...overrides,
})

beforeEach(() => {
  getPolicyStatus.mockReset()
  readPolicy.mockReset()
  describeRules.mockReset()
  describeRules.mockReturnValue([
    'Max 1.0 ETC per transaction',
    'Max 5.0 ETC per 24-hour window (the window opens with the first spend and resets 24 hours later)',
    'Recipients limited to 2 approved addresses',
    'At least 1 hour between outgoing transactions',
  ])
})

describe('PolicyPanel — managed vault (read-only)', () => {
  it('renders every rule in plain language plus live window state, next-allowed time, and allowlist', async () => {
    getPolicyStatus.mockResolvedValue('managed')
    readPolicy.mockResolvedValue(managedPolicy)
    render(<PolicyPanel vault={vault()} />)

    expect(await screen.findByText(/max 1\.0 etc per transaction/i)).toBeInTheDocument()
    expect(screen.getByText(/max 5\.0 etc per 24-hour window/i)).toBeInTheDocument()

    // Live window consumption (FR-006 / US2-AS3)
    expect(screen.getByText(/2\.0 \(native coin\) of 5\.0 \(native coin\) used/i)).toBeInTheDocument()
    expect(screen.getByText(/3\.0 \(native coin\) remaining/i)).toBeInTheDocument()

    // Cooldown live state (next-allowed in the future)
    expect(screen.getByText(/next transaction allowed at/i)).toBeInTheDocument()

    // Allowlist entries
    expect(screen.getByText(R1)).toBeInTheDocument()
    expect(screen.getByText(R2)).toBeInTheDocument()

    // 24h-window semantics disclosure (FR-002)
    expect(screen.getByText(/window opens with the first counted spend/i)).toBeInTheDocument()
  })

  it('offers no management actions to a non-owner (view-only) member', async () => {
    getPolicyStatus.mockResolvedValue('managed')
    readPolicy.mockResolvedValue(managedPolicy)
    render(<PolicyPanel vault={vault({ owner: false })} onPropose={vi.fn()} />)
    await screen.findByText(/max 1\.0 etc per transaction/i)
    expect(screen.queryByRole('button', { name: /propose change/i })).not.toBeInTheDocument()
  })

  it('offers the change flow to an owner with a proposal path', async () => {
    getPolicyStatus.mockResolvedValue('managed')
    readPolicy.mockResolvedValue(managedPolicy)
    render(<PolicyPanel vault={vault({ owner: true })} onPropose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /propose change/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    getPolicyStatus.mockResolvedValue('managed')
    readPolicy.mockResolvedValue(managedPolicy)
    const { container } = render(<PolicyPanel vault={vault({ owner: true })} onPropose={vi.fn()} />)
    await screen.findByText(/max 1\.0 etc per transaction/i)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('PolicyPanel — other statuses', () => {
  it('shows the foreign-guard notice, read-only, with no actions even for owners', async () => {
    getPolicyStatus.mockResolvedValue('foreign')
    render(<PolicyPanel vault={vault({ owner: true })} onPropose={vi.fn()} />)
    expect(await screen.findByText(/rules set by another interface/i)).toBeInTheDocument()
    expect(screen.getByText(/manage them with the interface that created them/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(readPolicy).not.toHaveBeenCalled()
  })

  it('shows the unsupported-network notice (custody keeps working)', async () => {
    getPolicyStatus.mockResolvedValue('unsupported')
    render(<PolicyPanel vault={vault({ owner: true })} onPropose={vi.fn()} />)
    expect(await screen.findByText(/aren.t supported on this network/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows "no policy" for a bare vault; the attach action is owner-only', async () => {
    getPolicyStatus.mockResolvedValue('none')
    const { unmount } = render(<PolicyPanel vault={vault({ owner: false })} onPropose={vi.fn()} />)
    expect(await screen.findByText(/no policy/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /attach a policy/i })).not.toBeInTheDocument()
    unmount()

    getPolicyStatus.mockResolvedValue('none')
    render(<PolicyPanel vault={vault({ owner: true })} onPropose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /attach a policy/i })).toBeInTheDocument()
  })

  it('surfaces a read failure without crashing', async () => {
    getPolicyStatus.mockRejectedValue(new Error('rpc down'))
    render(<PolicyPanel vault={vault()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/rpc down/i)
  })

  it('has no axe violations across notice states', async () => {
    getPolicyStatus.mockResolvedValue('foreign')
    const { container } = render(<PolicyPanel vault={vault()} />)
    await waitFor(() => expect(screen.getByText(/another interface/i)).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
