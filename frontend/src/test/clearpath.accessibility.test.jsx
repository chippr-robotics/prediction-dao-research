import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import ClearPathPanel from '../components/clearpath/ClearPathPanel'

// Spec 030 (T057) — axe accessibility (WCAG 2.1 AA) over the ClearPath module surfaces. Picked up by the gating
// CI step `npm test -- --run accessibility.test`.

const STABLE_READER = {} // must be referentially stable across renders — see useClearPath's cachedReadProvider
const cp = {
  isSupported: true,
  chainId: 63,
  chainIds: [63],
  hasRegistryFor: () => true,
  reader: STABLE_READER,
  readerFor: () => STABLE_READER,
  signer: {},
  account: '0xabc',
  isConnected: true,
  readRoute: 'public',
  setReadRoute: vi.fn(),
  listExternalDAOs: vi.fn(),
  registerExternalDAO: vi.fn(),
  trackDAO: vi.fn(),
  untrackDAO: vi.fn(),
}
vi.mock('../components/clearpath/useClearPath', () => ({ useClearPath: () => cp }))
vi.mock('../hooks/useUI', () => ({ useNotification: () => ({ showNotification: vi.fn() }) }))
vi.mock('../components/clearpath/governorConnector', () => ({
  validateGovernor: vi.fn(),
  readGovernorSummary: vi.fn().mockResolvedValue({
    name: 'OlympiaGovernor', tokenAddr: '0x0000000000000000000000000000000000000111',
    tokenName: 'Olympia Member', tokenSymbol: 'OLYM', timelock: '0x0000000000000000000000000000000000000222',
    treasuryNative: 0n, votingDelay: '1', votingPeriod: '100', proposalThreshold: '0',
    countingMode: 'support=bravo', clockMode: 'mode=blocknumber',
  }),
  extraTreasuries: () => [],
  readTreasuries: vi.fn().mockResolvedValue([]),
  fetchGovernorProposals: vi.fn().mockResolvedValue({ ok: true, proposals: [], scannedFrom: 0, scannedTo: 1, partial: false }),
  castVote: vi.fn(),
  queueProposal: vi.fn(),
  executeProposal: vi.fn(),
  proposeAction: vi.fn(),
}))
vi.mock('../config/networks', () => ({
  getNetwork: () => ({ name: 'Ethereum Classic Mordor', explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' }, nativeCurrency: { symbol: 'ETC' } }),
}))
// CpAddressField → AddressBookButton → useWallet would throw without a WalletProvider if a register/tracking
// view mounts; stub the wallet-scoped hooks so the address fields render under axe.
vi.mock('../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn() }) }))

describe('ClearPath accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cp.isSupported = true
    cp.listExternalDAOs.mockResolvedValue([
      { id: 1, dao: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', framework: 0, label: 'Olympia DAO', registrant: '0xabc', registeredAt: 1700000000, chainId: 63, networkName: 'Ethereum Classic Mordor' },
    ])
  })

  it('the DAO list has no axe violations', async () => {
    const { container } = render(<ClearPathPanel />)
    await screen.findByText('Olympia DAO')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('the disabled (unsupported network) state has no axe violations', async () => {
    cp.isSupported = false
    const { container } = render(<ClearPathPanel />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
