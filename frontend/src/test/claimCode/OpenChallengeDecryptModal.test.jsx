import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import OpenChallengeDecryptModal from '../../components/fairwins/OpenChallengeDecryptModal'
import { generateCode } from '../../utils/claimCode/wordlist.js'
import { deriveFromCode } from '../../utils/claimCode/deriveFromCode.js'
import { encryptEnvelopeCode } from '../../utils/crypto/envelopeEncryption.js'

// The dashboard re-read flow for open challenges (feature 024): code-keyed terms can't be opened with the
// wallet-key path, so this modal collects the four-word code and unlocks the envelope locally.
describe('OpenChallengeDecryptModal', () => {
  function sealedFor(code, terms) {
    const { symKey } = deriveFromCode(code)
    return encryptEnvelopeCode(terms, symKey)
  }

  it('renders nothing when closed', () => {
    const { container } = render(
      <OpenChallengeDecryptModal isOpen={false} onClose={() => {}} envelope={null} onDecrypted={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('unlocks the terms with the correct code and reports them', async () => {
    const code = generateCode()
    const terms = { description: 'Will it rain in Denver tomorrow?' }
    const envelope = sealedFor(code, terms)
    const onDecrypted = vi.fn()
    const onClose = vi.fn()

    render(<OpenChallengeDecryptModal isOpen onClose={onClose} envelope={envelope} onDecrypted={onDecrypted} />)

    const unlock = screen.getByRole('button', { name: /unlock terms/i })
    expect(unlock).toBeDisabled() // gated until a valid four-word code is entered
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: code } })
    expect(unlock).toBeEnabled()
    fireEvent.click(unlock)

    await waitFor(() => expect(onDecrypted).toHaveBeenCalledWith(terms))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error for a wrong code and does not report terms', async () => {
    const code = generateCode()
    let wrong = generateCode()
    while (wrong === code) wrong = generateCode()
    const envelope = sealedFor(code, { description: 'secret' })
    const onDecrypted = vi.fn()

    render(<OpenChallengeDecryptModal isOpen onClose={() => {}} envelope={envelope} onDecrypted={onDecrypted} />)
    fireEvent.change(screen.getByLabelText(/word code/i), { target: { value: wrong } })
    fireEvent.click(screen.getByRole('button', { name: /unlock terms/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't unlock/i)
    expect(onDecrypted).not.toHaveBeenCalled()
  })
})
