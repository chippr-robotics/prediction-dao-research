import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import ClearPathPanel from '../components/clearpath/ClearPathPanel'

// Spec 030 (T057) — axe accessibility (WCAG 2.1 AA) over the ClearPath module surfaces. Picked up by the gating
// CI step `npm test -- --run accessibility.test`.

const cp = {
  isSupported: true,
  chainId: 63,
  reader: {},
  account: '0xabc',
  isConnected: true,
  listExternalDAOs: vi.fn(),
  registerExternalDAO: vi.fn(),
}
vi.mock('../components/clearpath/useClearPath', () => ({ useClearPath: () => cp }))
vi.mock('../components/clearpath/governorConnector', () => ({
  validateGovernor: vi.fn(),
  readGovernorSummary: vi.fn().mockResolvedValue({
    name: 'OlympiaGovernor', tokenAddr: '0x0000000000000000000000000000000000000111',
    tokenName: 'Olympia Member', tokenSymbol: 'OLYM', timelock: '0x0000000000000000000000000000000000000222',
    treasuryNative: 0n, votingDelay: '1', votingPeriod: '100', proposalThreshold: '0',
    countingMode: 'support=bravo', clockMode: 'mode=blocknumber',
  }),
}))
vi.mock('../config/networks', () => ({
  getNetwork: () => ({ name: 'Ethereum Classic Mordor', explorer: { name: 'Blockscout', baseUrl: 'https://etc-mordor.blockscout.com' }, nativeCurrency: { symbol: 'ETC' } }),
}))

describe('ClearPath accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cp.isSupported = true
    cp.listExternalDAOs.mockResolvedValue([
      { id: 1, dao: '0xB85dbc899472756470EF4033b9637ff8fa2FD23D', framework: 0, label: 'Olympia DAO', registrant: '0xabc', registeredAt: 1700000000 },
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
