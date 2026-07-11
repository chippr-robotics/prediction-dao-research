// Spec 043 (US1) — create wizard: validation (FR-005), address preview, and create delegation.
// Spec 049 (US1) — the optional policy step: skipped ⇒ payload/initializer unchanged (FR-010);
// configured ⇒ policySetup threads through and the initializer's setup() decodes with
// setupTo = the chain's PolicyGuardSetup.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { Interface, getAddress } from 'ethers'
import CreateVaultWizard from '../../components/custody/CreateVaultWizard'
import { buildCreateVaultCalldata } from '../../lib/custody/safeVault'
import { getContractAddressForChain } from '../../config/contracts'
import { SAFE_SETUP_ABI } from '../../abis/SafeProxyFactory'
import { setupIface } from '../../lib/custody/policy'

const OWNER = '0x1111111111111111111111111111111111111111'
const OWNER2 = '0x2222222222222222222222222222222222222222'

// Chain 1337 carries the synced spec 049 policy engine addresses (Safe custody itself is mocked
// out of these component tests — encoding checks reuse chain 63's Safe deployment).
const POLICY_CHAIN = 1337

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
    const inputs = screen.getAllByPlaceholderText('0x…')
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
    expect(screen.getByLabelText(/no policy \(skip\)/i)).toBeChecked()
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
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    fireEvent.click(screen.getByLabelText(/only allow transfers to approved recipients/i))
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one recipient/i)
    expect(screen.getByRole('button', { name: /create vault/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /preview address/i })).toBeDisabled()
  })

  it('clears a previewed address when the policy changes (the initializer/address commitment moved)', async () => {
    const onPreview = vi.fn().mockResolvedValue('0xABCdef0000000000000000000000000000000123')
    render(<CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={onPreview} />)
    fireEvent.click(screen.getByRole('button', { name: /preview address/i }))
    await waitFor(() => expect(screen.getByText(/0xABCdef/i)).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    fireEvent.change(screen.getByLabelText(/per-transaction limit \(ETH\)/i), { target: { value: '1' } })
    expect(screen.queryByText(/0xABCdef/i)).not.toBeInTheDocument()
  })

  it('has no axe violations with the policy step enabled', async () => {
    const { container } = render(
      <CreateVaultWizard connectedAddress={OWNER} chainId={POLICY_CHAIN} onCreate={vi.fn()} onPreview={vi.fn()} />,
    )
    fireEvent.click(screen.getByLabelText(/set spending rules/i))
    expect(await axe(container)).toHaveNoViolations()
  })
})
