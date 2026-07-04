import { describe, it, expect } from 'vitest'
import { buildWagerVm } from '../components/fairwins/wagerVm'

const ME = '0x1234567890123456789012345678901234567890'
const OPP = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

const ctx = {
  account: ME,
  getStatusClass: () => 'status-active',
  getStatusLabel: (s) => s,
  getTimeRemaining: () => '2d',
  formatDate: () => 'Jun 1',
}

const market = (over = {}) => ({
  id: '7', marketType: 'friend', creator: ME, participants: [ME, OPP],
  status: 'active', computedStatus: 'active', stakeAmount: '5', stakeTokenSymbol: 'USDC', ...over,
})

describe('buildWagerVm draw descriptor (spec 040 US2)', () => {
  it('is null when there is no draw', () => {
    expect(buildWagerVm(market(), ctx).draw).toBeNull()
  })

  it('marks "you proposed · awaiting opponent" when the connected wallet proposed', () => {
    const vm = buildWagerVm(market({ drawProposedBy: ME }), ctx)
    expect(vm.draw.phase).toBe('proposed')
    expect(vm.draw.mySubmitted).toBe(true)
    expect(vm.draw.opponentSubmitted).toBe(false)
    expect(vm.draw.label).toMatch(/you proposed/i)
  })

  it('marks "opponent proposed · your turn" when the counterparty proposed', () => {
    const vm = buildWagerVm(market({ drawProposedBy: OPP }), ctx)
    expect(vm.draw.phase).toBe('proposed')
    expect(vm.draw.mySubmitted).toBe(false)
    expect(vm.draw.opponentSubmitted).toBe(true)
    expect(vm.draw.label).toMatch(/opponent proposed/i)
  })

  it('marks a settled draw with both stakes returned', () => {
    const vm = buildWagerVm(market({ status: 'draw', computedStatus: 'draw' }), ctx)
    expect(vm.draw.phase).toBe('settled')
    expect(vm.draw.mySubmitted).toBe(true)
    expect(vm.draw.opponentSubmitted).toBe(true)
    expect(vm.draw.label).toMatch(/both agreed/i)
  })
})
