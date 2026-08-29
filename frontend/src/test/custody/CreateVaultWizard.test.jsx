// Spec 043 (US1) — create wizard: validation (FR-005), address preview, and create delegation.
// Spec 049 (US1) — the optional policy step: skipped ⇒ payload/initializer unchanged (FR-010);
// configured ⇒ policySetup threads through and the initializer's setup() decodes with
// setupTo = the chain's PolicyGuardSetup.
// Spec 068 (US1/US5) — owner rows now use the shared CustodyAddressField, and the flow states the
// deployment chain (FR-001). The field's own address-book/QR wiring is covered by
// CustodyAddressField.test.jsx; here the platform inputs are stubbed (repo convention) so this
// suite stays a unit test of the wizard.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Interface, getAddress } from 'ethers'

vi.mock('../../components/ui/AddressInput', () => ({
  default: ({ id, value, onChange, placeholder, disabled }) => (
    <input id={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
  ),
}))
vi.mock('../../components/ui/AddressBookButton', () => ({
  default: ({ onSelect }) => (
    <button type="button" onClick={() => onSelect?.({ address: '0x3333333333333333333333333333333333333333' })}>
      Address book
    </button>
  ),
}))
vi.mock('../../components/ui/QRScanner', () => ({ default: () => null }))

import CreateVaultWizard from '../../components/custody/CreateVaultWizard'
import { buildCreateVaultCalldata } from '../../lib/custody/safeVault'
import { getContractAddressForChain } from '../../config/contracts'
import { SAFE_SETUP_ABI } from '../../abis/SafeProxyFactory'
import { setupIface } from '../../lib/custody/policy'

const OWNER = '0x1111111111111111111111111111111111111111'
const OWNER2 = '0x2222222222222222222222222222222222222222'
const OWNER3 = '0x4444444444444444444444444444444444444444'
const OWNER4 = '0x5555555555555555555555555555555555555555'

// Chain 1337 carries the synced spec 049 policy engine addresses (Safe custody itself is mocked
// out of these component tests — encoding checks reuse chain 63's Safe deployment).
const POLICY_CHAIN = 1337

/** Add a second owner row and fill it — the shape most of these tests need. */
function addSecondOwner(address = OWNER2) {
  fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
  const inputs = screen.getAllByPlaceholderText(/^0x…/)
  fireEvent.change(inputs[1], { target: { value: address } })
}

/** Every live alert as one string — several can be up at once (policy + configuration). */
function alertText() {
  return screen.getAllByRole('alert').map((el) => el.textContent).join(' ')
}

/** Switch the release-1.14.0 protection selector (starter | custom | none). */
function choosePolicyMode(mode) {
  fireEvent.click(screen.getByLabelText(new RegExp(`^${mode}`, 'i')))
}

describe('CreateVaultWizard', () => {
  it('blocks create when threshold exceeds owner count (FR-005)', () => {
    render(<CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: '2' } }) // 1 owner, threshold 2
    expect(screen.getByRole('alert')).toHaveTextContent(/exceed/i)
    expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
  })

  it('previews the predicted address for a valid config', async () => {
    const onPreview = vi.fn().mockResolvedValue('0xABCdef0000000000000000000000000000000123')
    render(<CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={onPreview} />)
    fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
    const inputs = screen.getAllByPlaceholderText(/^0x…/)
    fireEvent.change(inputs[1], { target: { value: OWNER2 } })
    fireEvent.change(screen.getByLabelText(/threshold/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: /preview address/i }))
    await waitFor(() => expect(screen.getByText(/0xABCdef/i)).toBeInTheDocument())
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ owners: [OWNER, OWNER2], threshold: 2 }),
    )
  })

  it('calls onCreate then onDone with the same salt used for preview', async () => {
    const onPreview = vi.fn().mockResolvedValue('0xabc')
    const onCreate = vi.fn().mockResolvedValue({ address: '0xabc' })
    const onDone = vi.fn()
    render(
      <CreateVaultWizard connectedAddress={OWNER} onCreate={onCreate} onPreview={onPreview} onDone={onDone} />,
    )
    // Two owners: a 1-of-1 with no policy is refused outright (release 1.14.0), and with no chain
    // named there is no policy engine to attach one on.
    addSecondOwner()
    fireEvent.click(screen.getByRole('button', { name: /preview address/i }))
    await waitFor(() => expect(onPreview).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /create vault/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const previewSalt = onPreview.mock.calls[0][0].saltNonce
    const createSalt = onCreate.mock.calls[0][0].saltNonce
    expect(createSalt).toBe(previewSalt)
    expect(onDone).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = render(
      <CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={vi.fn()} />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('passes no policySetup when the policy step is skipped, keeping the initializer unchanged (FR-010)', async () => {
    const onCreate = vi.fn().mockResolvedValue({ address: '0xabc' })
    render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={onCreate} onPreview={vi.fn()} />)
    // "No policy" is now a deliberate choice, and a 1-of-1 may not make it — so this vault has two
    // owners. The initializer it produces is still the byte-identical spec-043 one.
    addSecondOwner()
    choosePolicyMode('No policy')
    expect(screen.getByLabelText(/^no policy$/i)).toBeChecked()
    expect(screen.getByText(/no policy — the vault will have no spending rules/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create vault/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())
    const payload = onCreate.mock.calls[0][0]
    expect(payload.policySetup).toBeUndefined()
    // The skipped path builds the exact same initializer as before spec 049.
    const withPayload = buildCreateVaultCalldata({ chainId: 63, owners: [OWNER], threshold: 1, saltNonce: 1, policySetup: payload.policySetup })
    const legacy = buildCreateVaultCalldata({ chainId: 63, owners: [OWNER], threshold: 1, saltNonce: 1 })
    expect(withPayload.initializer).toBe(legacy.initializer)
  })

  it('threads a configured policy through creation: setup() decodes with setupTo = PolicyGuardSetup (US1)', async () => {
    const onCreate = vi.fn().mockResolvedValue({ address: '0xabc' })
    render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={onCreate} onPreview={vi.fn()} />)
    choosePolicyMode('Custom')
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(ETH\)/i), { target: { value: '1' } })
    expect(screen.getByText(/^Policy: Max 1\.0 ETH per transaction/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /create vault/i }))
    await waitFor(() => expect(onCreate).toHaveBeenCalled())

    const { policySetup } = onCreate.mock.calls[0][0]
    const guardSetupAddr = getAddress(getContractAddressForChain('policyGuardSetup', POLICY_CHAIN))
    expect(policySetup.setupTo).toBe(guardSetupAddr)
    expect(() => setupIface.decodeFunctionData('enablePolicy', policySetup.setupData)).not.toThrow()

    // The initializer built from this payload commits the policy: setup()'s `to`/`data` carry it.
    const tx = buildCreateVaultCalldata({ chainId: 63, owners: [OWNER], threshold: 1, saltNonce: 1, policySetup })
    const decoded = new Interface(SAFE_SETUP_ABI).decodeFunctionData('setup', tx.initializer)
    expect(getAddress(decoded[2])).toBe(guardSetupAddr)
    expect(decoded[3]).toBe(policySetup.setupData)
  })

  it('blocks preview/create while the policy is invalid (FR-015)', () => {
    render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
    choosePolicyMode('Custom')
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    fireEvent.click(screen.getByLabelText(/only allow transfers to approved recipients/i))
    expect(alertText()).toMatch(/at least one recipient/i)
    expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /preview address/i })).toBeDisabled()
  })

  it('clears a previewed address when the policy changes (the initializer/address commitment moved)', async () => {
    const onPreview = vi.fn().mockResolvedValue('0xABCdef0000000000000000000000000000000123')
    render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={onPreview} />)
    fireEvent.click(screen.getByRole('button', { name: /preview address/i }))
    await waitFor(() => expect(screen.getByText(/0xABCdef/i)).toBeInTheDocument())
    choosePolicyMode('Custom')
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(ETH\)/i), { target: { value: '1' } })
    expect(screen.queryByText(/0xABCdef/i)).not.toBeInTheDocument()
  })

  it('has no axe violations with the policy step enabled', async () => {
    const { container } = render(
      <CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />,
    )
    choosePolicyMode('Custom')
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    expect(await axe(container)).toHaveNoViolations()
  })
  // -------------------------------------------------------------- release 1.14.0
  // The vault ActionSheet's create step is this wizard. Three defaults changed, and each exists
  // because the old default produced a vault that was worse than it looked.

  describe('release 1.14.0 defaults', () => {
    it('suggests a simple-majority threshold and follows the owner list until the member sets one', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
      const field = screen.getByLabelText(/threshold/i)
      expect(field).toHaveValue(1) // 1 owner
      addSecondOwner()
      expect(field).toHaveValue(1) // ceil(2/2)
      fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
      fireEvent.change(screen.getAllByPlaceholderText(/^0x…/)[2], { target: { value: OWNER3 } })
      expect(field).toHaveValue(2) // ceil(3/2)
      expect(screen.getByText(/suggested: 2 of 3 owners/i)).toBeInTheDocument()

      // Once the member states a number, the suggestion never moves it again.
      fireEvent.change(field, { target: { value: '3' } })
      fireEvent.click(screen.getByRole('button', { name: /add owner/i }))
      fireEvent.change(screen.getAllByPlaceholderText(/^0x…/)[3], { target: { value: OWNER4 } })
      expect(field).toHaveValue(3)
      expect(screen.queryByText(/suggested:/i)).not.toBeInTheDocument()
    })

    it('preselects the starter policy and shows what it will enforce', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
      expect(screen.getByLabelText(/^starter policy/i)).toBeChecked()
      expect(screen.getByLabelText(/^no policy$/i)).not.toBeChecked()
      // The summary is rendered from the encoded rules, so it cannot drift from what is deployed.
      expect(screen.getByText(/these rules will be active from the first transaction/i)).toBeInTheDocument()
      // Both the rule list and the one-line review say it — the review line concatenates the same
      // encoded summary, so a member sees it whether or not the list is in view.
      expect(screen.getAllByText(/must pass between fund movements/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/^Policy: /)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create vault/i })).toBeEnabled()
    })

    it('threads the starter policy into creation as an ordered-engine setup', async () => {
      const onCreate = vi.fn().mockResolvedValue({ address: '0xabc' })
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={onCreate} onPreview={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /create vault/i }))
      await waitFor(() => expect(onCreate).toHaveBeenCalled())
      const { policySetup } = onCreate.mock.calls[0][0]
      expect(policySetup.setupTo).toBe(getAddress(getContractAddressForChain('policyGuardSetup', POLICY_CHAIN)))
      expect(policySetup.setupData).toMatch(/^0x[0-9a-f]+$/i)
    })

    it('refuses a 1-of-1 vault with no policy, and says why', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
      choosePolicyMode('No policy')
      expect(alertText()).toMatch(/not safer than an ordinary account/i)
      expect(alertText()).toMatch(/add a second owner, or keep a policy/i)
      expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /preview address/i })).toBeDisabled()
    })

    it('lifts the refusal when a second owner is added', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
      choosePolicyMode('No policy')
      expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
      addSecondOwner()
      expect(screen.queryByText(/not safer than an ordinary account/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create vault/i })).toBeEnabled()
    })

    it('lifts the refusal when the starter policy is kept instead', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
      choosePolicyMode('No policy')
      expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
      choosePolicyMode('Starter')
      expect(screen.getByRole('button', { name: /create vault/i })).toBeEnabled()
    })

    it('refuses a single-owner vault on a chain with no policy engine — there is nothing to protect it with', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} onCreate={vi.fn()} onPreview={vi.fn()} />)
      expect(screen.queryByLabelText(/^starter policy/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
    })

    it('blocks creation when the starter amount cannot be parsed, rather than quietly dropping it', () => {
      render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />)
      fireEvent.change(screen.getByLabelText(/24-hour limit/i), { target: { value: 'lots' } })
      expect(alertText()).toMatch(/plain number/i)
      expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
    })

    it('has no axe violations with the starter policy selected', async () => {
      const { container } = render(
        <CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />,
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
