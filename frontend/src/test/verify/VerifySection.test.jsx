/**
 * Protect ▸ Verify — the surface.
 *
 * Component-level assertions concentrate on the two things a screenshot can't prove: that the
 * three verdicts are visually and textually DISTINCT (an unreachable node must never read as a
 * forged signature), and that an identity which cannot sign never renders a button that would
 * fail on click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

// The address field pulls in ENS/callsign resolution and the QR scanner; neither is what this
// suite is about, and both want a provider. Reuse of the shared field is asserted by its own
// suite — here it is stubbed down to the input it wraps.
vi.mock('../../components/custody/CustodyAddressField', () => ({
  default: ({ id, label, value, onChange, hint }) => (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <span>{hint}</span>}
    </div>
  ),
}))

let walletCtx
vi.mock('../../hooks/useWalletManagement', () => ({ useWallet: () => walletCtx }))
vi.mock('../../connectors/passkey', () => ({ readSession: () => ({ credentialId: 'cred-1' }) }))
// No test may reach a real network. `readProvider` is null by default, which stands for "this
// chain has no route" — the honest unverifiable case — and a test that wants the on-chain leg to
// actually answer sets it to a stub.
let readProvider = null
vi.mock('../../utils/rpcProvider', () => ({ getReadProvider: () => readProvider }))

import { cohortChainIds } from '../../config/networks'
import VerifySection from '../../components/custody/VerifySection'
import { CustodyContext } from '../../contexts/CustodyContext'
import {
  MESSAGE,
  SIGNATURE,
  SIGNER_ADDRESS,
  OTHER_ADDRESS,
  EIP191_DOCUMENT_JSON,
  ERC1271_SIGNATURE,
  CONTRACT_ACCOUNT,
  stubProvider,
} from '../fixtures/signedMessages'

const signer = { signMessage: vi.fn(async () => SIGNATURE) }

// A chain this build actually serves. Taken from the cohort rather than hardcoded, so the suite
// does not silently depend on whether it was built as testnet or mainnet.
const COHORT_CHAIN = String(cohortChainIds()[0])

beforeEach(() => {
  signer.signMessage.mockClear()
  readProvider = null
  walletCtx = { address: SIGNER_ADDRESS, chainId: 137, loginMethod: 'injected', signer }
})

function renderSection(custody = { active: { mode: 'personal' }, legacySigner: null }) {
  return render(
    <CustodyContext.Provider value={custody}>
      <VerifySection />
    </CustodyContext.Provider>,
  )
}

/**
 * Open one of the two entry rows' sheets. The area itself is only rows and buttons — every form
 * lives in an ActionSheet, so a test that wants a field has to open the sheet first.
 */
async function openSheet(user, name) {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }))
  return screen.findByRole('dialog')
}

describe('VerifySection — checking a signature', () => {
  it('confirms a valid signature and names the method', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(SIGNATURE)
    await user.click(screen.getByLabelText(/claims to have signed/i))
    await user.paste(SIGNER_ADDRESS)
    await user.click(screen.getByRole('button', { name: /check signature/i }))

    const result = await screen.findByTestId('verify-result')
    expect(result).toHaveAttribute('data-status', 'valid')
    expect(within(result).getByText(/signature is valid/i)).toBeInTheDocument()
  })

  it('does not call a mismatching recovery a forgery when the chain cannot be read', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(SIGNATURE)
    await user.click(screen.getByLabelText(/claims to have signed/i))
    await user.paste(OTHER_ADDRESS)
    await user.click(screen.getByRole('button', { name: /check signature/i }))

    const result = await screen.findByTestId('verify-result')
    // ECDSA recovered a different address, and the provider factory is stubbed to throw, so the
    // on-chain leg could not run. The honest answer is "couldn't check" — the claimed address may
    // be a contract account whose owner key is exactly what recovered. The tempting bug is to
    // render this as a forgery; that is what this asserts against.
    expect(result).toHaveAttribute('data-status', 'unverifiable')
    expect(within(result).getByText(new RegExp(SIGNER_ADDRESS, 'i'))).toBeInTheDocument()
    expect(within(result).getByText(/not a failed check/i)).toBeInTheDocument()
  })

  it('reports a definite negative once the chain confirms the address holds no contract', async () => {
    readProvider = stubProvider({ code: '0x' }) // a plain account on the stated network
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(SIGNATURE)
    await user.click(screen.getByLabelText(/claims to have signed/i))
    await user.paste(OTHER_ADDRESS)
    // The member states the network — which since #1165 is the only way the on-chain leg runs.
    await user.selectOptions(screen.getByLabelText(/^Network$/i), COHORT_CHAIN)
    await user.click(screen.getByRole('button', { name: /check signature/i }))

    const result = await screen.findByTestId('verify-result')
    expect(result).toHaveAttribute('data-status', 'invalid')
    expect(within(result).getByText(/does not match/i)).toBeInTheDocument()
    expect(within(result).getByText(new RegExp(SIGNER_ADDRESS, 'i'))).toBeInTheDocument()
  })

  // Regression, review on #1165: the network used to be pre-filled from the connected chain. A
  // contract-account signature then got checked against a chain the member never named, found no
  // code there, and came back as a DEFINITE "does not match" — a confidently wrong accusation
  // built on an assumption. Unspecified is the honest default.
  it('does not assume a network the member never chose', async () => {
    readProvider = stubProvider({ code: '0x' }) // the connected chain holds no code at that address
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    expect(screen.getByLabelText(/^Network$/i)).toHaveValue('')

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(ERC1271_SIGNATURE) // not recoverable — needs the on-chain leg
    await user.click(screen.getByLabelText(/claims to have signed/i))
    await user.paste(CONTRACT_ACCOUNT)
    await user.click(screen.getByRole('button', { name: /check signature/i }))

    const result = await screen.findByTestId('verify-result')
    expect(result).toHaveAttribute('data-status', 'unverifiable')
    expect(within(result).getByText(/which network/i)).toBeInTheDocument()
  })

  it('still takes the network from a record that names one this build serves', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(JSON.stringify({ ...JSON.parse(EIP191_DOCUMENT_JSON), chainId: Number(COHORT_CHAIN) }))
    expect(screen.getByLabelText(/^Network$/i)).toHaveValue(COHORT_CHAIN)
  })

  // Found while fixing the pre-filled-network bug: a record naming a chain outside this build's
  // cohort left the select blank, and the check then said "the document does not say which
  // network" — which is false. It does say; we are the ones who cannot go there. Constitution III
  // still forbids the cross-cohort read, so the chain is not adopted — but it is named.
  it('names a chain it cannot serve instead of pretending the record was silent', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(EIP191_DOCUMENT_JSON) // names Polygon 137; this build is a testnet cohort

    expect(screen.getByLabelText(/^Network$/i)).toHaveValue('')
    expect(await screen.findByText(/does not serve/i)).toBeInTheDocument()
    // …and the wallet signature in it is still checkable, because recovery needs no chain.
    await user.click(screen.getByRole('button', { name: /check signature/i }))
    expect(await screen.findByTestId('verify-result')).toHaveAttribute('data-status', 'valid')
  })

  it('fills every field from a pasted signed-message document', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(EIP191_DOCUMENT_JSON)

    expect(screen.getByLabelText(/^Message$/i)).toHaveValue(MESSAGE)
    expect(screen.getByLabelText(/claims to have signed/i)).toHaveValue(SIGNER_ADDRESS)
    expect(await screen.findByText(/read a signed-message document/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /check signature/i }))
    expect(await screen.findByTestId('verify-result')).toHaveAttribute('data-status', 'valid')
  })

  it('explains a document it cannot read instead of checking a half-filled form', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(JSON.stringify({ format: 'fairwins-signed-message/1', message: 'x' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no signature/i)
    expect(screen.getByRole('button', { name: /check signature/i })).toBeDisabled()
  })

  // Regression, review on #1163: with the other fields already filled, a broken document left Check
  // pressable — and submitting the raw JSON as a signature reports "does not match" for what is
  // really "your document is unreadable".
  it('refuses to check a broken document pasted over an already-filled form', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(SIGNATURE)
    expect(screen.getByRole('button', { name: /check signature/i })).toBeEnabled()

    await user.clear(screen.getByLabelText(/^Signature$/i))
    await user.paste(JSON.stringify({ format: 'fairwins-signed-message/1', message: 'x' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no signature/i)
    expect(screen.getByRole('button', { name: /check signature/i })).toBeDisabled()
    expect(screen.queryByTestId('verify-result')).not.toBeInTheDocument()
  })

  // THE CLASS, not the two inputs that exposed it (#1163). The verify seam had `try/finally` with
  // no `catch`, so anything that threw beneath it vanished: no verdict, no error, nothing. Two
  // separate malformed inputs reached that path in one review, which is the signal that guarding
  // inputs one at a time is the wrong fix. A throw must surface as the honest third state.
  it('turns an unexpected failure into an honest unverifiable verdict, never silence', async () => {
    const user = userEvent.setup()
    render(
      <CustodyContext.Provider value={{ active: { mode: 'personal' }, legacySigner: null }}>
        <VerifySection
          deps={{
            verifyMessage: () => {
              throw new Error('something nobody anticipated')
            },
          }}
        />
      </CustodyContext.Provider>,
    )
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(SIGNATURE)
    await user.click(screen.getByRole('button', { name: /check signature/i }))

    const result = await screen.findByTestId('verify-result')
    expect(result).toHaveAttribute('data-status', 'unverifiable')
    expect(within(result).getByText(/something went wrong/i)).toBeInTheDocument()
    // …and specifically NOT a claim about the signature.
    expect(within(result).queryByText(/does not match/i)).not.toBeInTheDocument()
  })

  // A parse error belongs to the text in ONE field. Clearing it form-wide meant editing an
  // unrelated field re-enabled Check over signature text that still could not be read.
  it('keeps Check disabled when an unrelated field is edited after a bad paste', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Check a signature')

    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(JSON.stringify({ format: 'fairwins-signed-message/1', message: 'x' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no signature/i)

    await user.click(screen.getByLabelText(/^Message$/i))
    await user.paste(MESSAGE)

    expect(screen.getByRole('button', { name: /check signature/i })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(/no signature/i)

    // Editing the field that actually holds the bad text clears it.
    await user.clear(screen.getByLabelText(/^Signature$/i))
    await user.paste(SIGNATURE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /check signature/i })).toBeEnabled()
  })
})

describe('VerifySection — signing', () => {
  // Regression, review on #1165: this used `getNetwork()`, which falls back to the build's default
  // network — so a member on an unsupported chain was told they were signing on "Polygon".
  // CLAUDE.md requires strict NETWORKS[chainId] lookups in custody code for exactly this reason.
  it('never names a network the member is not actually on', async () => {
    walletCtx = { ...walletCtx, chainId: 999999 }
    const user = userEvent.setup()
    renderSection()
    const sheet = await openSheet(user, 'Sign a message')

    expect(within(sheet).getByText('Chain 999999')).toBeInTheDocument()
    expect(within(sheet).queryByText(/polygon/i)).not.toBeInTheDocument()
  })

  it('signs the message and shows a copyable document', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Sign a message')

    await user.click(screen.getByLabelText(/message to sign/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByRole('button', { name: /^sign message$/i }))

    await waitFor(() => expect(signer.signMessage).toHaveBeenCalledWith(MESSAGE))
    const doc = await screen.findByTestId('signed-document')
    expect(doc).toHaveTextContent(SIGNER_ADDRESS)
    expect(screen.getByRole('button', { name: /copy document/i })).toBeInTheDocument()
  })

  it('retires the document as soon as the message is edited', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Sign a message')

    await user.click(screen.getByLabelText(/message to sign/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByRole('button', { name: /^sign message$/i }))
    expect(await screen.findByTestId('signed-document')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/message to sign/i), '!')
    await waitFor(() => expect(screen.queryByTestId('signed-document')).not.toBeInTheDocument())
  })

  // The refusal has to be legible from the row, without opening anything: a member should not have
  // to walk into a sheet to discover the control inside it is withdrawn.
  it('states the vault refusal on the row itself, and offers no signing control inside', async () => {
    const user = userEvent.setup()
    renderSection({
      active: { mode: 'vault', vaultAddress: '0x1111111111111111111111111111111111111111', chainId: 137 },
      legacySigner: null,
    })
    expect(screen.getByText(/threshold of its owners/i)).toBeInTheDocument()

    const sheet = await openSheet(user, 'Sign a message')
    expect(within(sheet).queryByRole('button', { name: /^sign message$/i })).not.toBeInTheDocument()
    expect(within(sheet).getByText(/threshold of its owners/i)).toBeInTheDocument()
  })

  it('tells a locked recovered account to unlock rather than failing on click', async () => {
    const user = userEvent.setup()
    renderSection({ active: { mode: 'legacy', address: OTHER_ADDRESS, chainId: 137 }, legacySigner: null })
    expect(screen.getByText(/unlock this recovered account/i)).toBeInTheDocument()

    const sheet = await openSheet(user, 'Sign a message')
    expect(within(sheet).queryByRole('button', { name: /^sign message$/i })).not.toBeInTheDocument()
  })

  // The sheet unmounts on close, so the draft and the document have to live above it.
  it('keeps the message and its document when the sheet is closed and reopened', async () => {
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Sign a message')
    await user.click(screen.getByLabelText(/message to sign/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByRole('button', { name: /^sign message$/i }))
    await screen.findByTestId('signed-document')

    await user.click(screen.getByRole('button', { name: /^close$/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // …and the row says so, rather than looking untouched.
    expect(screen.getByText(/reopen to copy the document/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^view signature$/i }))
    expect(screen.getByLabelText(/message to sign/i)).toHaveValue(MESSAGE)
    expect(await screen.findByTestId('signed-document')).toBeInTheDocument()
  })

  it('reports a cancelled signature as cancelled, not as a failure', async () => {
    signer.signMessage.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 4001 }))
    const user = userEvent.setup()
    renderSection()
    await openSheet(user, 'Sign a message')

    await user.click(screen.getByLabelText(/message to sign/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByRole('button', { name: /^sign message$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/i)
    expect(screen.queryByTestId('signed-document')).not.toBeInTheDocument()
  })
})

describe('VerifySection — accessibility', () => {
  it('has no axe violations on arrival', async () => {
    const { container } = renderSection()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in the check sheet with a verdict on screen', async () => {
    const user = userEvent.setup()
    const { container } = renderSection()
    await openSheet(user, 'Check a signature')
    await user.click(screen.getByLabelText(/^Signature$/i))
    await user.paste(EIP191_DOCUMENT_JSON)
    await user.click(screen.getByRole('button', { name: /check signature/i }))
    await screen.findByTestId('verify-result')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in the sign sheet with a document on screen', async () => {
    const user = userEvent.setup()
    const { container } = renderSection()
    await openSheet(user, 'Sign a message')
    await user.click(screen.getByLabelText(/message to sign/i))
    await user.paste(MESSAGE)
    await user.click(screen.getByRole('button', { name: /^sign message$/i }))
    await screen.findByTestId('signed-document')
    expect(await axe(container)).toHaveNoViolations()
  })
})
