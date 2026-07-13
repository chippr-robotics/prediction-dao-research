import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'

// Mock the address resolver + the metrics hook so we render the tab without a live registry.
vi.mock('../config/contracts', () => ({ getContractAddressForChain: vi.fn() }))
vi.mock('../hooks/useTagRegistryMetrics', () => ({
  useTagRegistryMetrics: vi.fn(),
  TagStatus: { NONE: 0, ACTIVE: 1, REPOINTING: 2, QUARANTINED: 3, SUSPENDED: 4, LAPSED_RECLAIMABLE: 5 },
}))

import { getContractAddressForChain } from '../config/contracts'
import { useTagRegistryMetrics } from '../hooks/useTagRegistryMetrics'
import TagRegistryAdmin from '../components/admin/TagRegistryAdmin'

const REGISTRY = '0x1111111111111111111111111111111111111111'
const OWNER = '0x' + 'a'.repeat(40)

const METRICS = {
  loading: false,
  error: null,
  truncated: false,
  refresh: vi.fn(),
  data: {
    counts: { registered: 5, changed: 1, released: 2, reclaimed: 0, repointRequested: 0, repointFinalized: 1, repointCancelled: 0, committed: 7 },
    netRegistrations: 3,
    suspended: [{ tagHash: '0x' + '2'.repeat(64), tag: 'baddie' }],
    verified: [{ tagHash: '0x' + '3'.repeat(64), tag: 'chipprbots' }],
    reserved: [],
    recent: [{ type: 'TagRegistered', tagHash: '0x' + '1'.repeat(64), tag: 'alpha', owner: OWNER, block: 100 }],
    truncated: false,
    totalEvents: 8,
  },
}

// Null provider → `reader` is null → loadConfig is a no-op (roles stay false), so the render is fully
// synchronous with no dangling contract-read promise. That models the "connected admin who holds no
// tag-registry operator role" render without leaving async work that would fire after teardown.
const signer = { provider: null }
const baseProps = { signer, account: OWNER, contracts: {}, chainId: 137, runTx: vi.fn(), pendingTx: false }

describe('TagRegistryAdmin (spec 054 operator screen)', () => {
  beforeEach(() => {
    getContractAddressForChain.mockReset()
    useTagRegistryMetrics.mockReset()
    useTagRegistryMetrics.mockReturnValue(METRICS)
  })

  it('shows a not-configured notice when the registry has no address on this network', () => {
    getContractAddressForChain.mockReturnValue('')
    render(<TagRegistryAdmin {...baseProps} />)
    expect(screen.getByText(/not deployed \/ configured on this network/i)).toBeInTheDocument()
    // metrics/moderation cards are not rendered without an address
    expect(screen.queryByText(/Metrics/)).not.toBeInTheDocument()
  })

  it('renders metrics + moderation and gates operator actions when the wallet holds no role', async () => {
    getContractAddressForChain.mockReturnValue(REGISTRY)
    render(<TagRegistryAdmin {...baseProps} />)

    // Registry address + no-role disclosure
    expect(screen.getByText(/hold no operator role on this registry/i)).toBeInTheDocument()

    // Metric tiles from the mocked scan
    expect(screen.getByText('Active tags')).toBeInTheDocument()
    expect(screen.getByText('Registrations')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // netRegistrations
    expect(screen.getByText(/Currently suspended \(1\)/)).toBeInTheDocument()
    expect(screen.getByText('%chipprbots')).toBeInTheDocument() // verified chip label

    // Moderation section present with a Refresh + Look up affordance
    expect(screen.getByRole('button', { name: /look up/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^refresh$/i })).toBeInTheDocument()

    // No policy/roles cards without the admin role
    expect(screen.queryByText(/Policy parameters/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Operator roles/)).not.toBeInTheDocument()
  })

  it('has no axe violations in the configured view', async () => {
    getContractAddressForChain.mockReturnValue(REGISTRY)
    const { container } = render(<TagRegistryAdmin {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
