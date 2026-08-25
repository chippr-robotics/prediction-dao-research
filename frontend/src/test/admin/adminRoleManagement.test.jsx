/**
 * Admin role management — three verified gaps in the "screens to add and
 * remove roles from users" (specs 071 + 093):
 *
 *  1. ROLE_MANAGER's home contract is the reference-chain MembershipManager,
 *     so a grant signed on the SCOPED chain lands on an address with no code
 *     and "succeeds" as a no-op. The write must require the wallet on
 *     `membershipChainId()`, be withheld in words otherwise, and name the
 *     membership chain in its confirmation.
 *  2. FEE_ADMIN_ROLE (spec 060, FeeRouter) gates the whole Fees tab but was
 *     absent from the picker — no in-app way to grant it. It must appear with
 *     the FeeRouter as its home contract, resolved per scoped chain.
 *  3. The MembershipManager is role-keyed and pools (spec 034) gate on
 *     POOL_PARTICIPANT_ROLE, which a WAGER_PARTICIPANT membership does not
 *     satisfy. The tier/grant/revoke forms carry a role selector that
 *     DEFAULTS to Wager Participant (existing behaviour unchanged) and passes
 *     the selected role hash through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ethers as realEthers } from 'ethers'
import { membershipChainId, cohortChainIds } from '../../config/networks'
import { networkName } from '../../lib/chains/estate'

const m = vi.hoisted(() => ({
  chainId: 137,
  deployed: {},
  contractCalls: [],
  notify: null, // assigned in beforeEach
  runTx: null,
}))

vi.mock('../../hooks/useRoles', () => ({
  useRoles: () => ({
    hasRole: () => true,
    hasAnyRole: () => true,
    estateRead: { read: [137], unreadable: [], swept: true },
    chainsForRole: () => [],
    loadRoles: vi.fn(),
  }),
}))
vi.mock('../../hooks/useWeb3', () => ({
  useWeb3: () => ({ account: '0xabc', signer: {}, provider: null, chainId: m.chainId }),
}))
vi.mock('../../hooks/useUI', () => ({ useNotification: () => ({ showNotification: m.notify }) }))
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false, useMediaQuery: () => false, useIsTablet: () => false, useIsExtraSmall: () => false,
}))
vi.mock('../../hooks/useEnsResolution', () => ({
  useEnsResolution: () => ({ resolvedAddress: '', isEns: false, isLoading: false }),
}))
vi.mock('../../utils/blockchainService', () => ({ getProvider: () => null }))
vi.mock('../../lib/miniapps/registryAuthority', () => ({
  readCuratorAuthority: () => Promise.resolve({ held: false, outcome: 'not-held' }),
}))
vi.mock('../../hooks/useFeeEstate', () => ({
  useFeeEstate: () => ({ accrued: [], received: [], accruedTotals: null, receivedTotals: null, refresh: vi.fn() }),
}))
vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { name: 'Test', blockExplorer: 'https://x' },
  DEPLOYED_CONTRACTS: {},
  getContractAddressForChain: (key, chainId) => m.deployed[`${key}:${Number(chainId)}`] || '',
}))
// Reads in these apps are not under test; a null provider keeps effects inert.
vi.mock('../../lib/chains/estate', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, readProviderFor: () => null }
})
// Heavy re-hosted views are not under test here.
vi.mock('../../components/admin/MembershipTreasuryOverview', () => ({ default: () => <div data-testid="mto" /> }))
vi.mock('../../components/admin/ChainStateTable', () => ({ default: () => <table data-testid="chain-state" /> }))
vi.mock('../../components/admin/FeesTab', () => ({ default: () => <div /> }))
vi.mock('../../components/admin/PerpsFeesPanel', () => ({ default: () => <div /> }))

// The write runner: invokes the tx factory so the recording Contract below
// captures the address + calldata the view would actually sign.
vi.mock('../../components/admin/useAdminTx', () => ({
  useAdminTx: () => ({ runTx: m.runTx, pendingTx: false }),
}))

// Every ethers.Contract the views construct records its address and calls.
vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal()
  class RecordingContract {
    constructor(address) {
      this.__address = address
      const record = (method) => (...args) => {
        m.contractCalls.push({ address, method, args })
        return Promise.resolve({ wait: async () => ({}) })
      }
      for (const method of ['grantRole', 'revokeRole', 'setTier', 'grantMembership', 'revokeMembership', 'withdrawFees']) {
        this[method] = record(method)
      }
      // View reads reject so state stays in its honest "could not read" shape.
      this.accruedFees = () => Promise.reject(new Error('not under test'))
      this.treasury = () => Promise.reject(new Error('not under test'))
    }
  }
  return { ...actual, ethers: { ...actual.ethers, Contract: RecordingContract } }
})

import AccessControlApp from '../../components/admin/apps/AccessControlApp'
import MembershipRevenueApp from '../../components/admin/apps/MembershipRevenueApp'

const MEMBERSHIP = Number(membershipChainId())
// A cohort chain that is NOT the membership home — where the scope picker can
// legitimately sit while ROLE_MANAGER must still refuse to sign.
const OTHER = cohortChainIds().map(Number).find((id) => id !== MEMBERSHIP)
const membershipName = networkName(MEMBERSHIP)
const otherName = networkName(OTHER)

const ADDRS = {
  membershipManager: `0x${'aa'.repeat(20)}`,
  feeRouter: `0x${'bb'.repeat(20)}`,
  wagerRegistry: `0x${'cc'.repeat(20)}`,
}
const TARGET = `0x${'22'.repeat(20)}`

const keccakRole = (name) => realEthers.keccak256(realEthers.toUtf8Bytes(name))

const mount = (El, path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <El />
    </MemoryRouter>,
  )

beforeEach(() => {
  m.chainId = OTHER
  m.contractCalls = []
  m.notify = vi.fn()
  m.runTx = vi.fn(async (fn) => {
    await fn()
    return true
  })
  m.deployed = {
    [`membershipManager:${MEMBERSHIP}`]: ADDRS.membershipManager,
    [`feeRouter:${OTHER}`]: ADDRS.feeRouter,
    [`wagerRegistry:${OTHER}`]: ADDRS.wagerRegistry,
    [`wagerRegistry:${MEMBERSHIP}`]: ADDRS.wagerRegistry,
  }
})

// ── Finding 1: ROLE_MANAGER signs on the membership chain, never the scope ──
describe('AccessControlApp: ROLE_MANAGER is pinned to the membership chain', () => {
  const openRolesView = () => mount(AccessControlApp, '/admin/access-control?view=admin-roles')

  it('withholds the write IN WORDS when the wallet is off the membership chain', async () => {
    m.chainId = OTHER // wallet and scope both sit on a non-membership cohort chain
    openRolesView()

    fireEvent.change(await screen.findByLabelText(/^Role/), { target: { value: 'ROLE_MANAGER' } })

    // The header names the chain the transaction will actually land on —
    // never the scoped chain the write does not touch.
    expect(
      await screen.findByRole('heading', { name: `Grant / Revoke Admin Roles on ${membershipName}` }),
    ).toBeInTheDocument()
    // The scope/sign divergence is spelled out…
    expect(screen.getByText(new RegExp(`This view is scoped to ${otherName}, but Role Manager`)))
      .toBeInTheDocument()
    // …the reason the write is withheld is stated, naming the signing chain…
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(/Role Manager lives on the MembershipManager/i)
    expect(notice).toHaveTextContent(membershipName)
    // …and the buttons are disabled with words, not silently dead.
    expect(
      screen.getByRole('button', { name: new RegExp(`Switch to ${membershipName} to grant`) }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: new RegExp(`Switch to ${membershipName} to revoke`) }),
    ).toBeDisabled()
    expect(m.runTx).not.toHaveBeenCalled()
  })

  it('other roles keep the scoped-chain gate: on-scope wallet leaves them offered', async () => {
    m.chainId = OTHER
    openRolesView()
    // GUARDIAN (default) signs on the scoped chain, where the wallet is —
    // and the header says so.
    expect(
      await screen.findByRole('heading', { name: `Grant / Revoke Admin Roles on ${otherName}` }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grant Role' })).toBeEnabled()
    expect(screen.queryByText(/This grant is signed on/)).toBeNull()
    expect(screen.queryByText(/Role Manager lives on the MembershipManager/)).toBeNull()
    expect(screen.queryByText(/This view is scoped to/)).toBeNull()
  })

  it('a ROLE_MANAGER grant targets the MembershipManager and NAMES the membership chain, even scoped elsewhere', async () => {
    m.chainId = MEMBERSHIP // wallet where the grant actually signs
    openRolesView()

    // Scope the view AWAY from the membership chain: the pin, not the scope,
    // must decide both the target contract and the named chain.
    fireEvent.change(await screen.findByLabelText(/^Network/), { target: { value: String(OTHER) } })
    fireEvent.change(screen.getByLabelText(/^Role/), { target: { value: 'ROLE_MANAGER' } })
    // The header follows the SIGNING chain, not the scope.
    expect(
      screen.getByRole('heading', { name: `Grant / Revoke Admin Roles on ${membershipName}` }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Account \(address or ENS\)/), { target: { value: TARGET } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant Role' }))

    await waitFor(() => expect(m.runTx).toHaveBeenCalled())
    // Signed against the membership chain's MembershipManager…
    expect(m.contractCalls).toEqual([
      {
        address: ADDRS.membershipManager,
        method: 'grantRole',
        args: [keccakRole('ROLE_MANAGER_ROLE'), TARGET],
      },
    ])
    // …and the success message names the membership chain, not the scope.
    const message = m.runTx.mock.calls[0][1]
    expect(message).toContain(membershipName)
    expect(message).not.toContain(otherName)
  })

  it('re-checks the wallet chain at the call site, not only in the disabled button', async () => {
    // A stale render cannot be constructed from a render test (React refuses
    // to dispatch onClick on a disabled fiber), so the guard is asserted where
    // it lives — the same precedent as adminViewScope.test.jsx.
    const src = (await import('../../components/admin/apps/AccessControlApp.jsx?raw')).default
    const grantBody = src.slice(src.indexOf('const handleGrantAdminRole'), src.indexOf('const handleRevokeAdminRole'))
    const revokeBody = src.slice(src.indexOf('const handleRevokeAdminRole'), src.indexOf('// Dashboard:'))
    expect(grantBody).toMatch(/if \(!requireRoleWriteChain\(adminRoleForm\.role\)\) return false/)
    expect(revokeBody).toMatch(/if \(!requireRoleWriteChain\(adminRoleForm\.role\)\) return false/)
    // And the required chain for ROLE_MANAGER is the membership chain.
    expect(src).toMatch(/role === 'ROLE_MANAGER' \? Number\(membershipChainId\(\)\) : Number\(roleChainId\)/)
  })
})

// ── Finding 2: FEE_ADMIN_ROLE is grantable, homed on the FeeRouter ──────────
describe('AccessControlApp: FEE_ADMIN_ROLE on the FeeRouter', () => {
  it('appears in the role picker', async () => {
    mount(AccessControlApp, '/admin/access-control?view=admin-roles')
    const picker = await screen.findByLabelText(/^Role/)
    expect(
      within(picker).getByRole('option', { name: /Fee Administrator — service fee rates \(FeeRouter\)/ }),
    ).toBeInTheDocument()
  })

  it('lists the FeeRouter as its home contract on the scoped network dashboard', async () => {
    mount(AccessControlApp, '/admin/access-control')
    const row = (await screen.findByText('Fee Administrator (FeeRouter)')).closest('tr')
    expect(within(row).getByTitle(ADDRS.feeRouter)).toBeInTheDocument()
  })

  it('grants keccak(FEE_ADMIN_ROLE) against the scoped chain FeeRouter', async () => {
    m.chainId = OTHER
    mount(AccessControlApp, '/admin/access-control?view=admin-roles')

    fireEvent.change(await screen.findByLabelText(/^Role/), { target: { value: 'FEE_ADMIN' } })
    fireEvent.change(screen.getByLabelText(/Account \(address or ENS\)/), { target: { value: TARGET } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant Role' }))

    await waitFor(() => expect(m.runTx).toHaveBeenCalled())
    expect(m.contractCalls).toEqual([
      {
        address: ADDRS.feeRouter,
        method: 'grantRole',
        // Matches contracts/fees/FeeRouter.sol: keccak256("FEE_ADMIN_ROLE").
        args: [keccakRole('FEE_ADMIN_ROLE'), TARGET],
      },
    ])
    expect(m.runTx.mock.calls[0][1]).toContain(otherName)
  })

  it('refuses honestly where no FeeRouter is deployed', async () => {
    delete m.deployed[`feeRouter:${OTHER}`]
    m.chainId = OTHER
    mount(AccessControlApp, '/admin/access-control?view=admin-roles')

    fireEvent.change(await screen.findByLabelText(/^Role/), { target: { value: 'FEE_ADMIN' } })
    fireEvent.change(screen.getByLabelText(/Account \(address or ENS\)/), { target: { value: TARGET } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant Role' }))

    await waitFor(() =>
      expect(m.notify).toHaveBeenCalledWith('Role contract not deployed on this network', 'error'),
    )
    expect(m.runTx).not.toHaveBeenCalled()
  })
})

// ── Finding 3: membership forms are role-keyed, defaulting to wager ─────────
describe('MembershipRevenueApp: membership role selector', () => {
  const WAGER_HASH = keccakRole('WAGER_PARTICIPANT_ROLE')
  const POOL_HASH = keccakRole('POOL_PARTICIPANT_ROLE')

  const openMembers = () => mount(MembershipRevenueApp, '/admin/membership-revenue?view=members')

  it('defaults every selector to Wager Participant, keeping existing behaviour', async () => {
    m.chainId = MEMBERSHIP
    openMembers()

    const selectors = await screen.findAllByLabelText(/^Membership role/)
    expect(selectors).toHaveLength(2) // grant + revoke forms
    for (const sel of selectors) expect(sel).toHaveValue('WAGER_PARTICIPANT')

    // Driving the grant form WITHOUT touching the selector still grants
    // WAGER_PARTICIPANT_ROLE — the pre-selector behaviour, byte for byte.
    fireEvent.change(screen.getByLabelText(/Recipient/), { target: { value: TARGET } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant Membership' }))
    await waitFor(() => expect(m.runTx).toHaveBeenCalled())
    expect(m.contractCalls).toEqual([
      {
        address: ADDRS.membershipManager,
        method: 'grantMembership',
        args: [TARGET, WAGER_HASH, 1, 30],
      },
    ])
  })

  it('switching to Pool Participant passes POOL_PARTICIPANT_ROLE to grant, and says so', async () => {
    m.chainId = MEMBERSHIP
    openMembers()

    const [grantRoleSel] = await screen.findAllByLabelText(/^Membership role/)
    fireEvent.change(grantRoleSel, { target: { value: 'POOL_PARTICIPANT' } })
    fireEvent.change(screen.getByLabelText(/Recipient/), { target: { value: TARGET } })
    fireEvent.click(screen.getByRole('button', { name: 'Grant Membership' }))

    await waitFor(() => expect(m.runTx).toHaveBeenCalled())
    expect(m.contractCalls[0].method).toBe('grantMembership')
    expect(m.contractCalls[0].args[1]).toBe(POOL_HASH)
    expect(m.runTx.mock.calls[0][1]).toContain('Pool Participant')
  })

  it('revoke passes the selected role hash — a pool revocation never touches the wager role', async () => {
    m.chainId = MEMBERSHIP
    openMembers()

    const selectors = await screen.findAllByLabelText(/^Membership role/)
    fireEvent.change(selectors[1], { target: { value: 'POOL_PARTICIPANT' } })
    fireEvent.change(screen.getByLabelText(/^Account$/), { target: { value: TARGET } })
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Membership' }))

    await waitFor(() => expect(m.runTx).toHaveBeenCalled())
    expect(m.contractCalls).toEqual([
      {
        address: ADDRS.membershipManager,
        method: 'revokeMembership',
        args: [TARGET, POOL_HASH],
      },
    ])
    expect(m.runTx.mock.calls[0][1]).toContain('Pool Participant')
  })

  it('the tier form configures the selected role and defaults to the wager ladder', async () => {
    m.chainId = MEMBERSHIP
    mount(MembershipRevenueApp, '/admin/membership-revenue?view=tiers')

    // Default: the heading and the write both speak Wager Participant.
    expect(await screen.findByRole('heading', { name: new RegExp(`Configure Tier: Wager Participant on ${membershipName}`) }))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save Tier Config' }))
    await waitFor(() => expect(m.runTx).toHaveBeenCalledTimes(1))
    expect(m.contractCalls[0].method).toBe('setTier')
    expect(m.contractCalls[0].args[0]).toBe(WAGER_HASH)

    // Switched: the same form drives the pool ladder.
    fireEvent.change(screen.getByLabelText(/^Membership role/), { target: { value: 'POOL_PARTICIPANT' } })
    expect(screen.getByRole('heading', { name: new RegExp(`Configure Tier: Pool Participant on ${membershipName}`) }))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save Tier Config' }))
    await waitFor(() => expect(m.runTx).toHaveBeenCalledTimes(2))
    expect(m.contractCalls[1].method).toBe('setTier')
    expect(m.contractCalls[1].args[0]).toBe(POOL_HASH)
  })

  it('the reference-chain pin is untouched: off the membership chain the write refuses in words', async () => {
    m.chainId = OTHER
    openMembers()

    fireEvent.change(await screen.findByLabelText(/Recipient/), { target: { value: TARGET } })
    // The button is disabled; the call-site guard is the same requireMembershipChain
    // the app always had, so assert the stated reason via the standing warning.
    expect(screen.getByRole('button', { name: 'Grant Membership' })).toBeDisabled()
    expect(
      screen.getAllByText(new RegExp(`Memberships live on ${membershipName}`, 'i')).length,
    ).toBeGreaterThan(0)
    expect(m.runTx).not.toHaveBeenCalled()
  })
})
