// Spec 043 (US1) — vault detail renders live on-chain facts and the unreadable-vault state.
// Spec 049 — VaultDetail hosts the Policy section (PolicyPanel); the policy lib is mocked here
// (tests run on a network without the engine) — PolicyPanel behavior has its own suites.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'

// Protect-accordion-refresh — VaultList now embeds VaultProposalsPanel inline for the open vault,
// so opening a card in these unit tests reaches useWallet() even without a proposals prop.
vi.mock('../../hooks', () => ({ useWallet: () => ({ chainId: 63, address: undefined, switchNetwork: vi.fn() }) }))

vi.mock('../../lib/custody/policy', () => ({
  getPolicyStatus: vi.fn(async () => 'unsupported'),
  readPolicy: vi.fn(async () => null),
  describeRules: () => [],
  validatePolicyConfig: () => {},
  buildPolicyChangeTx: vi.fn(),
  buildSetGuardTx: vi.fn(),
  NATIVE_ASSET: '0x0000000000000000000000000000000000000000',
  shortAddress: (a) => String(a),
}))
// Spec 068 — VaultDetail picks the policy panel by whether the ordered engine is DEPLOYED on the
// vault's chain. Pin that here so this suite tests VaultDetail rather than the live deployment
// state: a real deploy to any test chain must never flip a component unit test. The routing itself
// is covered by CustodyPanel/PolicyPanelV2's suites.
vi.mock('../../lib/custody/policyV2', () => ({ isPolicyV2Supported: () => false }))

import VaultDetail from '../../components/custody/VaultDetail'
import VaultList from '../../components/custody/VaultList'

const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'

describe('VaultDetail', () => {
  it('renders threshold, role, and owners for a loaded Safe', async () => {
    const vault = { isSafe: true, address: A, chainId: 63, owners: [A, B], threshold: 2, owner: true, label: 'Coop', version: '1.4.1' }
    const { container } = render(<VaultDetail vault={vault} />)
    expect(screen.getByText(/2 of 2 owners/i)).toBeInTheDocument()
    expect(screen.getByText(/can propose & approve/i)).toBeInTheDocument()
    // Spec 049 — the Policy section is mounted (here in its unsupported-network state).
    expect(screen.getByRole('heading', { name: /^policy$/i })).toBeInTheDocument()
    expect(await screen.findByText(/aren.t supported on this network/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an unreadable state for a non-Safe reference', () => {
    render(<VaultDetail vault={{ isSafe: false, address: A, label: 'x' }} onForget={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/could not read a safe/i)
  })

  // ---------------------------------------------------------------- spec 068 (US1)

  it('names the chain a vault lives on rather than showing a bare id (FR-002)', () => {
    const vault = {
      isSafe: true, address: A, chainId: 63, chainName: 'Ethereum Classic Mordor', isTestnet: true,
      owners: [A], threshold: 1, owner: true, onVaultChain: true,
    }
    render(<VaultDetail vault={vault} />)
    expect(screen.getByText(/Ethereum Classic Mordor \(63\)/)).toBeInTheDocument()
    expect(screen.getByText(/testnet/i)).toBeInTheDocument()
  })

  it('renders a vault on another chain read-only with a switch prompt (FR-004)', () => {
    const onSwitchNetwork = vi.fn()
    const vault = {
      isSafe: true, address: A, chainId: 63, chainName: 'Mordor', owners: [A], threshold: 1,
      owner: true, onVaultChain: false,
    }
    render(
      <VaultDetail
        vault={vault}
        onOperateAs={vi.fn()}
        onProposePolicy={vi.fn()}
        onSwitchNetwork={onSwitchNetwork}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/shown read-only/i)
    // No state-changing action may be offered for a vault the wallet cannot act on.
    expect(screen.queryByRole('button', { name: /operate as this vault/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /switch to mordor/i }))
    expect(onSwitchNetwork).toHaveBeenCalledWith(63)
  })

  // A vault is switched to from the account menu, like a recovered account — not from a
  // vault-only button here. This asserts the button is GONE and the member is told where to go,
  // so the two ways of becoming a vault cannot silently come back.
  it('points at the account switcher instead of offering its own operate-as button', () => {
    const vault = {
      isSafe: true, address: A, chainId: 63, chainName: 'Mordor', owners: [A], threshold: 1,
      owner: true, onVaultChain: true,
    }
    render(<VaultDetail vault={vault} />)
    expect(screen.queryByRole('button', { name: /operate as this vault/i })).not.toBeInTheDocument()
    expect(screen.getByText(/account menu next to your avatar/i)).toBeInTheDocument()
    expect(screen.queryByText(/shown read-only/i)).not.toBeInTheDocument()
  })

  it('says so when the vault is already the acting account', () => {
    const vault = {
      isSafe: true, address: A, chainId: 63, chainName: 'Mordor', owners: [A], threshold: 1,
      owner: true, onVaultChain: true,
    }
    render(<VaultDetail vault={vault} isActiveIdentity />)
    expect(screen.getByText(/you are acting as this vault/i)).toBeInTheDocument()
  })

  it('explains an unreachable chain without implying the vault changed', () => {
    const vault = { address: A, chainId: 63, chainName: 'Mordor', reachable: false, label: 'Team' }
    render(<VaultDetail vault={vault} onForget={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/could not reach mordor/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/nothing about the vault has changed/i)
  })

  it('passes the vault chain to onForget so cross-chain references resolve', () => {
    const onForget = vi.fn()
    const vault = { isSafe: true, address: A, chainId: 63, chainName: 'Mordor', owners: [A], threshold: 1, onVaultChain: true }
    render(<VaultDetail vault={vault} onForget={onForget} />)
    fireEvent.click(screen.getByRole('button', { name: /remove from list/i }))
    expect(onForget).toHaveBeenCalledWith(A, 63)
  })
})

describe('VaultList', () => {
  // Protect-accordion-refresh — the active vault's card is the one expanded (AccordionSection's
  // aria-expanded), and re-clicking its trigger collapses it by selecting nothing, matching the
  // Recovery tab's exclusive open-one-at-a-time accordion behavior.
  it('expands the active vault as an accordion card and toggles via onSelect', () => {
    const onSelect = vi.fn()
    const vaults = [{ chainId: 63, address: A, label: 'One', isSafe: true, owners: [A], threshold: 1, owner: true }]
    render(<VaultList vaults={vaults} activeAddress={A} onSelect={onSelect} />)
    const trigger = screen.getByRole('button', { name: /One/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(trigger)
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('renders an empty state with no vaults', () => {
    render(<VaultList vaults={[]} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent(/no vaults yet/i)
  })

  // ---------------------------------------------------------------- spec 068 (US1)

  it('badges every row with its chain, across chains, in one list (FR-002/FR-003)', () => {
    const vaults = [
      { chainId: 63, address: A, label: 'Team', isSafe: true, owners: [A], threshold: 1, owner: true, chainName: 'Mordor', isTestnet: true },
      { chainId: 137, address: B, label: 'Family', isSafe: true, owners: [B], threshold: 1, owner: true, chainName: 'Polygon' },
    ]
    render(<VaultList vaults={vaults} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByText(/Mordor · testnet/)).toBeInTheDocument()
    expect(screen.getByText('Polygon')).toBeInTheDocument()
  })

  it('states which chain is unreachable instead of dropping the row', () => {
    const vaults = [{ chainId: 63, address: A, label: 'Team', chainName: 'Mordor', reachable: false }]
    render(<VaultList vaults={vaults} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByText(/Mordor unreachable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Team/ })).toBeInTheDocument()
  })

  it('falls back to the numeric chain id when the network is unknown', () => {
    const vaults = [{ chainId: 424242, address: A, label: 'Mystery', isSafe: true, owners: [A], threshold: 1 }]
    render(<VaultList vaults={vaults} activeAddress={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Chain 424242')).toBeInTheDocument()
  })
})
