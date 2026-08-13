/**
 * Protect ▸ Verify — sign an arbitrary message to prove control of an account.
 *
 * Three things this form is careful about:
 *
 * 1. **The message is signed verbatim.** No trimming, no template, no appended nonce — the text
 *    in the box is the text that gets signed, because the member is usually answering a challenge
 *    somebody else wrote and one altered byte makes the proof worthless to them.
 * 2. **It says what the signature proves, before and after.** A signature proves control of the
 *    key at the moment it was made; it is not a password and it does not expire on its own. Both
 *    are stated, because a member who does not know that will happily sign anything.
 * 3. **It never offers a control it cannot honour.** When the identity cannot sign (a vault, a
 *    locked recovered account, a passkey session with no credential), the reason is shown in place
 *    of the button rather than the button failing on click.
 */

import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useClipboard } from '../../hooks/useClipboard'
import { SIGN_SCHEMES, serializeSignedMessage } from '../../lib/verify/signedMessage'
import { getNetwork } from '../../config/networks'

const SCHEME_NOTE = {
  [SIGN_SCHEMES.EIP191]:
    'Anyone can check this signature offline — no network needed.',
  [SIGN_SCHEMES.ERC1271]:
    'Your account signs through its contract, so checking this signature means asking that contract. Keep the network in the document — without it the signature cannot be checked.',
}

export default function SignMessageForm({
  address,
  chainId,
  capability,
  signing,
  signedDocument,
  error,
  onSign,
  onClear,
  message,
  onMessageChange,
}) {
  const { copied, error: copyError, copy } = useClipboard()
  const [copiedWhat, setCopiedWhat] = useState(null)
  const resultRef = useRef(null)

  // A proof must never sit under text it does not cover. Editing the box retires the document —
  // derived during render rather than cleared in an effect, so there is no frame in which the old
  // signature is shown against the new message.
  const current = signedDocument && signedDocument.message === message ? signedDocument : null

  // Same reason as the check form: inside a scrolling sheet the fresh document lands below the
  // fold, and a member who pressed Sign and approved a wallet prompt should not have to go hunting
  // for the result.
  useEffect(() => {
    // Feature-detected: jsdom (and some embedded webviews) do not implement scrollIntoView, and a
    // convenience must never take the surface down with it.
    if (current && typeof resultRef.current?.scrollIntoView === 'function') {
      resultRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [current])

  const network = chainId != null ? getNetwork(chainId) : null
  const canSubmit = capability.canSign && message.length > 0 && !signing

  const doCopy = async (what, text) => {
    setCopiedWhat(what)
    await copy(text)
  }

  return (
    <form
      className="verify-form"
      aria-label="Sign a message"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) onSign(message)
      }}
    >
      <p className="verify-lede">
        A signature proves you controlled this account when you made it. It is not a password, and
        it gives no one access to your funds.
      </p>

      <div className="verify-field">
        <label className="verify-label" htmlFor="verify-sign-message">
          Message to sign
        </label>
        <textarea
          id="verify-sign-message"
          className="verify-textarea"
          rows={4}
          value={message}
          onChange={(e) => {
            onMessageChange(e.target.value)
            onClear()
          }}
          disabled={!capability.canSign || signing}
          placeholder="Paste the exact text you were asked to sign"
          aria-describedby="verify-sign-message-hint"
        />
        <p className="verify-hint" id="verify-sign-message-hint">
          Signed exactly as written, spaces and line breaks included — paste a challenge unchanged.
        </p>
      </div>

      {capability.canSign ? (
        <>
          <dl className="verify-meta">
            <div>
              <dt>Signing as</dt>
              <dd className="verify-mono">{address}</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>{network?.name || (chainId != null ? `Chain ${chainId}` : 'Not connected')}</dd>
            </div>
          </dl>
          {SCHEME_NOTE[capability.scheme] && (
            <p className="verify-hint">{SCHEME_NOTE[capability.scheme]}</p>
          )}
          <div className="verify-actions">
            <button type="submit" className="verify-primary" disabled={!canSubmit}>
              {signing ? 'Waiting for your signature…' : 'Sign message'}
            </button>
          </div>
        </>
      ) : (
        <p className="verify-notice" role="status">
          {capability.reason}
        </p>
      )}

      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {current && (
        <section ref={resultRef} className="verify-result verify-result--ok" aria-label="Signed message">
          <h4 className="verify-result-title">Signed</h4>
          <p className="verify-hint">
            Send the whole document below — it carries the message, your address and the network, which
            is what the other side needs to check it.
          </p>
          <pre className="verify-doc" data-testid="signed-document">
            {serializeSignedMessage(current)}
          </pre>
          <div className="verify-actions">
            <button
              type="button"
              className="verify-primary"
              onClick={() => doCopy('document', serializeSignedMessage(current))}
            >
              {copied && copiedWhat === 'document' ? 'Copied' : 'Copy document'}
            </button>
            <button type="button" className="verify-secondary" onClick={() => doCopy('signature', current.signature)}>
              {copied && copiedWhat === 'signature' ? 'Copied' : 'Copy signature only'}
            </button>
          </div>
          {copyError && (
            <p className="verify-error" role="alert">
              {copyError}
            </p>
          )}
        </section>
      )}
    </form>
  )
}

SignMessageForm.propTypes = {
  address: PropTypes.string,
  chainId: PropTypes.number,
  /** resolveMessageSigner output — `canSign` plus either `scheme` or a member-facing `reason`. */
  capability: PropTypes.shape({
    canSign: PropTypes.bool,
    scheme: PropTypes.string,
    reason: PropTypes.string,
  }).isRequired,
  signing: PropTypes.bool,
  signedDocument: PropTypes.object,
  error: PropTypes.string,
  onSign: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  /** Owned by VerifySection so it survives the sheet closing (and keeps the document on screen). */
  message: PropTypes.string.isRequired,
  onMessageChange: PropTypes.func.isRequired,
}
