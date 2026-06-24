import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { ethers } from 'ethers'
import ProposalBuilder from '../ProposalBuilder'

// Spec 030 (US5, FR-023/024) — the rich proposal builder: compose a Governor proposal without hand-writing
// calldata, multi-action, asset-aware, with validation + the correct submitted payload.

const proposeAction = vi.fn()
vi.mock('../governorConnector', () => ({ proposeAction: (...a) => proposeAction(...a) }))

const USDC = '0x00000000000000000000000000000000000000dc'
const TO = '0x00000000000000000000000000000000000000a1'
const TRANSFER = new ethers.Interface(['function transfer(address to, uint256 amount)'])

const treasuries = [
  { label: 'Timelock', address: '0x0000000000000000000000000000000000000222', native: ethers.parseEther('100'), usdc: 1000000000n, usdcSymbol: 'cUSD', usdcDecimals: 6 },
]

function renderBuilder(extra = {}) {
  const run = vi.fn((label, makeTx) => makeTx())
  const onSubmitted = vi.fn()
  render(
    <ProposalBuilder
      record={{ dao: '0x00000000000000000000000000000000000000d0' }}
      signer={{}}
      reader={null}
      usdcAddress={USDC}
      nativeSymbol="ETC"
      treasuries={treasuries}
      run={run}
      busy={false}
      onSubmitted={onSubmitted}
      {...extra}
    />
  )
  return { run, onSubmitted }
}

describe('ProposalBuilder (spec 030 / US5)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('composes and submits a USDC transfer without hand-written calldata', async () => {
    proposeAction.mockResolvedValue({})
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    await user.type(screen.getByLabelText(/^title$/i), 'Fund dev')
    // default action type is "Send USDC / token"
    await user.type(screen.getByLabelText(/recipient/i), TO)
    await user.type(screen.getByLabelText(/amount/i), '100')
    const submit = screen.getByRole('button', { name: /submit proposal/i })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)
    await waitFor(() => expect(proposeAction).toHaveBeenCalled())
    const [, , payload] = proposeAction.mock.calls[0]
    expect(payload.targets).toEqual([USDC])
    expect(payload.values).toEqual([0n]) // ERC-20 transfer carries no native value
    expect(payload.description).toBe('# Fund dev')
    const [to, amount] = TRANSFER.decodeFunctionData('transfer', payload.calldatas[0])
    expect(to.toLowerCase()).toBe(TO)
    expect(amount).toBe(ethers.parseUnits('100', 6))
  })

  it('blocks submit until a title and a valid action are present', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    // no title, no recipient/amount → submit disabled
    expect(screen.getByRole('button', { name: /submit proposal/i })).toBeDisabled()
  })

  it('the expanded builder has no axe violations', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    const { container } = { container: document.body }
    expect(await axe(container)).toHaveNoViolations()
  })

  it('supports multiple actions in one proposal', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    expect(screen.getByText('1 action')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /\+ add action/i }))
    expect(screen.getByText('2 actions')).toBeInTheDocument()
  })

  it('warns (non-blocking) when an action exceeds the treasury balance', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    await user.type(screen.getByLabelText(/^title$/i), 'Big spend')
    await user.type(screen.getByLabelText(/recipient/i), TO)
    await user.type(screen.getByLabelText(/amount/i), '999999') // > 1000 cUSD held
    expect(await screen.findByText(/more cUSD than the treasury holds/i)).toBeInTheDocument()
    // still submittable (execution, not proposal, would revert)
    await waitFor(() => expect(screen.getByRole('button', { name: /submit proposal/i })).toBeEnabled())
  })
})
