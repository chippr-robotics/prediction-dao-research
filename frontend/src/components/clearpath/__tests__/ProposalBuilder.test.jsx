import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { ethers } from 'ethers'
import ProposalBuilder from '../ProposalBuilder'
import { ACTION_TYPE, newAction, assemble, predictProposalId } from '../proposalEncoding'

// Spec 030 (US5, FR-023/024) — the rich proposal builder: compose a Governor proposal without hand-writing
// calldata, multi-action, asset-aware, with validation + the correct submitted payload.

const proposeAction = vi.fn()
vi.mock('../governorConnector', () => ({ proposeAction: (...a) => proposeAction(...a) }))

// CpAddressField (recipient/target inputs) pulls in AddressBookButton → useWallet, which throws without a
// WalletProvider. Stub the wallet-scoped hooks so the builder renders with the real fields in tests.
vi.mock('../../../hooks/useAddressBook', () => ({ useAddressBook: () => ({ search: () => [] }) }))
vi.mock('../../../hooks/useAddressScreening', () => ({ useAddressScreening: () => ({ getStatus: () => 'clear', screen: vi.fn() }) }))

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

  it('detects a duplicate proposal and blocks submit (FR-025)', async () => {
    // Compute the id the builder will derive for a 100-USDC transfer to TO titled "Fund dev"…
    const A = assemble({
      title: 'Fund dev', body: '',
      actions: [{ ...newAction(ACTION_TYPE.TOKEN), tokenTo: TO, tokenAmount: '100' }],
      usdcAddress: USDC, meta: () => ({ decimals: 6, symbol: 'cUSD' }),
    })
    const dupId = predictProposalId(A.targets, A.values, A.calldatas, A.descriptionHash)
    const user = userEvent.setup()
    renderBuilder({ proposals: [{ id: dupId }] }) // …and feed it as an already-existing proposal
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    await user.type(screen.getByLabelText(/^title$/i), 'Fund dev')
    await user.type(screen.getByLabelText(/recipient/i), TO)
    await user.type(screen.getByLabelText(/amount/i), '100')
    expect(await screen.findByText(/this exact proposal already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /submit proposal/i })).toBeDisabled()
  })

  it('exposes address-book + QR-scan affordances on the recipient field', async () => {
    const user = userEvent.setup()
    renderBuilder()
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    // default action is "Send USDC / token" → its recipient is a CpAddressField
    expect(screen.getByLabelText(/recipient/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose from address book/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan qr code/i })).toBeInTheDocument()
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

  // Regression: a Governor whose Timelock holds ~0 but whose funds live in a separate vault must NOT
  // false-warn on a spend the DAO can actually cover. The over-treasury guard measures total holdings
  // across ALL treasuries (timelock + vaults), not just the (commonly empty) timelock.
  it('does not false-warn when the timelock is empty but a vault holds the funds', async () => {
    const splitTreasuries = [
      { label: 'Timelock', address: '0x0000000000000000000000000000000000000222', native: 0n, usdc: 0n, usdcSymbol: 'cUSD', usdcDecimals: 6 },
      { label: 'Olympia Treasury', address: '0x0000000000000000000000000000000000000333', native: ethers.parseEther('2'), usdc: 50_000000n, usdcSymbol: 'cUSD', usdcDecimals: 6 },
    ]
    const user = userEvent.setup()
    renderBuilder({ treasuries: splitTreasuries })
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    await user.type(screen.getByLabelText(/^title$/i), 'Small spend')
    await user.type(screen.getByLabelText(/recipient/i), TO)
    await user.type(screen.getByLabelText(/amount/i), '1') // 1 cUSD ≤ 50 cUSD held in the vault
    const submit = screen.getByRole('button', { name: /submit proposal/i })
    await waitFor(() => expect(submit).toBeEnabled())
    expect(screen.queryByText(/than the treasury holds/i)).not.toBeInTheDocument()
    // but a spend beyond the DAO's total holdings still warns
    await user.clear(screen.getByLabelText(/amount/i))
    await user.type(screen.getByLabelText(/amount/i), '51') // > 50 cUSD total
    expect(await screen.findByText(/more cUSD than the treasury holds/i)).toBeInTheDocument()
  })

  it('fills the recipient with the connected wallet via the Self button', async () => {
    const user = userEvent.setup()
    renderBuilder({ account: TO }) // TO doubles as the connected address here
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    await user.click(screen.getByRole('button', { name: /^self$/i }))
    expect(screen.getByLabelText(/recipient/i)).toHaveValue(TO)
  })

  it('opens the builder in a bottom-sheet dialog and keeps the trigger visible', async () => {
    const user = userEvent.setup()
    renderBuilder()
    // the trigger is always present (it sits above the proposal list)
    const trigger = screen.getByRole('button', { name: /\+ new proposal/i })
    expect(trigger).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: /new proposal/i })).toBeInTheDocument()
  })

  it('builds an executeTreasury proposal via the "Fund from treasury" action (executor-gated DAO)', async () => {
    const EXECUTOR = '0x00000000000000000000000000000000000000e1'
    const EXEC_IFACE = new ethers.Interface(['function executeTreasury(address recipient, uint256 amount)'])
    proposeAction.mockResolvedValue({})
    const user = userEvent.setup()
    // a governable funding source → opening pre-selects "Fund from treasury" (the correct path for this DAO)
    renderBuilder({ fundingSources: [{ executor: EXECUTOR, label: 'Olympia Treasury', address: '0x0000000000000000000000000000000000000333', native: ethers.parseEther('2') }] })
    await user.click(screen.getByRole('button', { name: /\+ new proposal/i }))
    expect(screen.getByText(/spends from its treasury via an on-chain executor/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^title$/i), 'Dev grant')
    await user.type(screen.getByLabelText(/recipient/i), TO)
    await user.type(screen.getByLabelText(/amount/i), '1')
    const submit = screen.getByRole('button', { name: /submit proposal/i })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)
    await waitFor(() => expect(proposeAction).toHaveBeenCalled())
    const [, , payload] = proposeAction.mock.calls[0]
    expect(payload.targets).toEqual([EXECUTOR]) // targets the executor, not the recipient
    expect(payload.values).toEqual([0n])
    const [to, amount] = EXEC_IFACE.decodeFunctionData('executeTreasury', payload.calldatas[0])
    expect(to.toLowerCase()).toBe(TO)
    expect(amount).toBe(ethers.parseEther('1'))
  })
})
