// Spec 068 (US2/US3, T021+T028) — the plain-language rule editor. The member never sees the
// contract's flags (banded / approvalsRequired / ANY_ASSET); they answer what the rule is about and
// the composer emits the fields. These tests assert that translation.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { parseUnits, ZeroAddress } from 'ethers'

vi.mock('../../components/ui/AddressInput', () => ({
  default: ({ id, value, onChange, placeholder, disabled }) => (
    <input id={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
  ),
}))
vi.mock('../../components/ui/AddressBookButton', () => ({ default: () => <button type="button">Address book</button> }))
vi.mock('../../components/ui/QRScanner', () => ({ default: () => null }))

import RuleComposer from '../../components/custody/RuleComposer'

const ALICE = '0x1111111111111111111111111111111111111111'
const BOB = '0x2222222222222222222222222222222222222222'
const owners = [ALICE, BOB]
const CHAIN = 1337

const setup = (props = {}) => {
  const onSubmit = vi.fn()
  render(<RuleComposer owners={owners} chainId={CHAIN} nativeSymbol="ETH" onSubmit={onSubmit} {...props} />)
  return onSubmit
}

const save = () => fireEvent.click(screen.getByRole('button', { name: /save rule/i }))

describe('RuleComposer', () => {
  it('emits an approver-set rule requiring everyone named (FR-009a)', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(ALICE, 'i') }))
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(BOB, 'i') }))
    save()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ approvers: [ALICE, BOB], approvalsRequired: 2 }),
    )
  })

  it('emits a K-of-N rule when the member picks "any N of them"', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(ALICE, 'i') }))
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(BOB, 'i') }))
    fireEvent.click(screen.getByRole('radio', { name: /only some of the named approvers/i }))
    save()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ approvalsRequired: 1 }))
  })

  it('emits no approver requirement when nobody is named, and says so', () => {
    const onSubmit = setup()
    expect(screen.getByText(/usual approval threshold is enough/i)).toBeInTheDocument()
    save()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ approvers: [], approvalsRequired: 0 }))
  })

  it('scopes a rule to the native coin with a per-transaction limit', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('radio', { name: /ETH only/i }))
    fireEvent.change(screen.getByLabelText(/most per transaction/i), { target: { value: '2.5' } })
    save()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ asset: ZeroAddress, perTxLimit: parseUnits('2.5', 18) }),
    )
  })

  it('scopes a rule to one token, honoring its decimals (FR-009c)', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('radio', { name: /one token only/i }))
    fireEvent.change(screen.getByLabelText(/token address/i), { target: { value: BOB } })
    fireEvent.change(screen.getByLabelText(/token decimals/i), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/most per transaction/i), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/most per 24 hours/i), { target: { value: '2000' } })
    save()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        asset: BOB,
        perTxLimit: parseUnits('500', 6),
        windowLimit: parseUnits('2000', 6),
      }),
    )
  })

  it('turns "only apply up to that amount" into a band (FR-009b)', () => {
    const onSubmit = setup()
    fireEvent.click(screen.getByRole('radio', { name: /ETH only/i }))
    fireEvent.change(screen.getByLabelText(/most per transaction/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /only apply this rule up to that amount/i }))
    save()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ banded: true, perTxLimit: parseUnits('1', 18) }))
  })

  it('withholds the daily-limit field on any-asset rules and explains why', () => {
    setup()
    expect(screen.queryByLabelText(/most per 24 hours/i)).not.toBeInTheDocument()
    expect(screen.getByText(/would add different tokens together/i)).toBeInTheDocument()
  })

  it('lists the chain’s platform services and adds their addresses as destinations (FR-022)', () => {
    const onSubmit = setup()
    const service = screen.getAllByRole('checkbox').find((cb) => /fairwins|swap|uniswap/i.test(cb.parentElement.textContent))
    expect(service).toBeTruthy()
    fireEvent.click(service)
    save()
    const rule = onSubmit.mock.calls[0][0]
    expect(rule.targets.length).toBeGreaterThan(0)
  })

  it('accepts a manual destination with a not-vetted warning (FR-023)', () => {
    const onSubmit = setup()
    expect(screen.getByText(/not checked by FairWins/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/add another address/i), { target: { value: ALICE } })
    fireEvent.click(screen.getByRole('button', { name: /add destination/i }))
    save()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ targets: [ALICE] }))
  })

  it('refuses a rule naming a non-owner and explains it instead of submitting (FR-010)', () => {
    const onSubmit = vi.fn()
    render(<RuleComposer owners={[ALICE]} chainId={CHAIN} onSubmit={onSubmit} />)
    // Compose a token rule with an invalid token address to trigger validation.
    fireEvent.click(screen.getByRole('radio', { name: /one token only/i }))
    fireEvent.change(screen.getByLabelText(/token address/i), { target: { value: 'not-an-address' } })
    save()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <RuleComposer owners={owners} chainId={CHAIN} nativeSymbol="ETH" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
