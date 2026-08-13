/**
 * Protect ▸ Verify — check that an address really signed a message.
 *
 * The verdict has THREE outcomes, not two, and the third is the reason this component exists in
 * the shape it does. "Valid" and "does not match" are claims about the signature; "couldn't check"
 * is a claim about US — an unreachable node, a chain we were never told. Rendering the third as
 * the second would tell a member their counterparty forged a signature when in fact nobody looked,
 * so each gets its own styling, its own icon and its own wording, and only the definite negative
 * is coloured as a failure.
 *
 * Paste handling: dropping a whole signed-message document into the signature box fills every
 * field from it and says so. That is the common case (the other side hands you the document), and
 * asking a member to hand-copy four fields out of JSON is how a wrong chain id ends up attached to
 * a good signature.
 */

import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import CustodyAddressField from './CustodyAddressField'
import { parseSignedMessage, looksLikeSignedMessage, SIGN_SCHEMES } from '../../lib/verify/signedMessage'
import { VERIFY_STATUS } from '../../lib/verify/verifyMessage'
import { cohortChainIds, getNetwork } from '../../config/networks'

/** How the verdict was reached — a footnote, phrased as a whole sentence. */
const METHOD_NOTE = {
  [SIGN_SCHEMES.EIP191]: 'Checked as a wallet signature (EIP-191) — no network was needed.',
  [SIGN_SCHEMES.ERC1271]: 'Checked by asking the account contract on that network (ERC-1271).',
}

const VERDICT = {
  [VERIFY_STATUS.VALID]: { tone: 'ok', icon: '✓', title: 'Signature is valid' },
  [VERIFY_STATUS.INVALID]: { tone: 'bad', icon: '✕', title: 'Signature does not match' },
  [VERIFY_STATUS.UNVERIFIABLE]: { tone: 'unknown', icon: '?', title: 'Could not be checked' },
}

/**
 * The document's `signedAt` is an ISO instant — correct to store, unreadable to show. Rendered in
 * the member's own locale and time zone, since "when did they sign this" is the question being
 * asked. An unparseable value is shown as-is rather than dropped: it is what the document says.
 */
function readableTime(iso) {
  if (!iso) return null
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString()
}

export default function VerifyMessageForm({ verifying, verdict, onVerify, onClear, draft, onDraftChange }) {
  // The draft lives ABOVE this component (VerifySection), because the sheet it renders in unmounts
  // when closed — a member who closes the sheet to go re-read the message they were sent must not
  // come back to an empty form sitting beneath a verdict about text that is no longer there.
  const { message, signature, address, chainId } = draft
  const set = (patch) => onDraftChange({ ...draft, ...patch })
  const [imported, setImported] = useState(null)
  const [parseError, setParseError] = useState(null)
  const messageRef = useRef(null)
  const signatureRef = useRef(null)
  const resultRef = useRef(null)

  // The form is taller than the sheet, so a verdict arrives BELOW the fold — the member presses
  // Check and, as far as they can see, nothing happens. Bring the answer into view when it lands.
  useEffect(() => {
    // Feature-detected: jsdom (and some embedded webviews) do not implement scrollIntoView, and a
    // convenience must never take the surface down with it.
    if (verdict && typeof resultRef.current?.scrollIntoView === 'function') {
      resultRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [verdict])

  const chains = cohortChainIds()

  const reset = () => {
    setImported(null)
    setParseError(null)
    onClear()
  }

  /**
   * Accept a pasted document anywhere the member happens to drop it. Text that is not a document
   * is left alone — a bare signature pasted into the signature box must keep working.
   */
  const absorb = (text, field) => {
    if (!looksLikeSignedMessage(text)) {
      set({ [field]: text })
      reset()
      return
    }
    const { ok, doc, error } = parseSignedMessage(text)
    if (!ok) {
      set({ [field]: text })
      setImported(null)
      setParseError(error)
      onClear()
      return
    }
    set({
      message: doc.message,
      signature: doc.signature,
      ...(doc.address ? { address: doc.address } : {}),
      ...(doc.chainId != null ? { chainId: String(doc.chainId) } : {}),
    })
    setParseError(null)
    setImported({ address: doc.address, signedAt: readableTime(doc.signedAt) })
    // A paste leaves the caret — and so the scroll — at the END of the box. After importing a
    // document that is exactly wrong: the member is being asked to confirm the message is the one
    // they expected, and what they need to read is its first line.
    if (messageRef.current) messageRef.current.scrollTop = 0
    if (signatureRef.current) signatureRef.current.scrollTop = 0
    onClear()
  }

  const canSubmit = message.length > 0 && signature.trim().length > 0 && !verifying
  const shown = verdict ? VERDICT[verdict.status] : null

  return (
    <form
      className="verify-form"
      aria-label="Check a signature"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        onVerify({
          message,
          signature: signature.trim(),
          address: address.trim() || null,
          chainId: chainId === '' ? null : Number(chainId),
        })
      }}
    >
      {/* No lede: the sheet's own title already says what this is, and inside a scrolling sheet
          every line of preamble pushes the answer further out of view. */}
      {/* Above the fields, not below them: this reports that the fields BELOW were filled in from a
          document, and an explanation that trails what it explains reads as an afterthought. */}
      {imported && (
        <p className="verify-notice" role="status">
          Read a signed-message document{imported.address ? ` from ${imported.address}` : ''}
          {imported.signedAt ? `, signed ${imported.signedAt}` : ''}. Check the message below is the one
          you expected before trusting it.
        </p>
      )}
      {parseError && (
        <p className="verify-error" role="alert">
          {parseError}
        </p>
      )}

      <div className="verify-field">
        <label className="verify-label" htmlFor="verify-check-message">
          Message
        </label>
        <textarea
          id="verify-check-message"
          ref={messageRef}
          className="verify-textarea"
          rows={3}
          value={message}
          onChange={(e) => absorb(e.target.value, 'message')}
          placeholder="The exact message that was signed — or paste the whole document here"
        />
      </div>

      <div className="verify-field">
        <label className="verify-label" htmlFor="verify-check-signature">
          Signature
        </label>
        <textarea
          id="verify-check-signature"
          ref={signatureRef}
          className="verify-textarea verify-textarea--mono"
          rows={2}
          value={signature}
          onChange={(e) => absorb(e.target.value, 'signature')}
          placeholder="0x… or paste the whole signed-message document"
        />
      </div>

      <CustodyAddressField
        id="verify-check-address"
        label="Address that claims to have signed"
        value={address}
        onChange={(v) => {
          set({ address: v })
          reset()
        }}
        chainId={chainId === '' ? undefined : Number(chainId)}
        hint="Leave empty to ask who signed it instead."
      />

      <div className="verify-field">
        <label className="verify-label" htmlFor="verify-check-chain">
          Network
        </label>
        <select
          id="verify-check-chain"
          className="verify-select"
          value={chainId}
          onChange={(e) => {
            set({ chainId: e.target.value })
            reset()
          }}
          aria-describedby="verify-check-chain-hint"
        >
          <option value="">Not specified</option>
          {chains.map((id) => (
            <option key={id} value={String(id)}>
              {getNetwork(id)?.name || `Chain ${id}`}
            </option>
          ))}
        </select>
        <p className="verify-hint" id="verify-check-chain-hint">
          Only needed for accounts that sign through a contract — passkey accounts and vaults.
        </p>
      </div>

      <div className="verify-actions">
        <button type="submit" className="verify-primary" disabled={!canSubmit}>
          {verifying ? 'Checking…' : 'Check signature'}
        </button>
      </div>

      {shown && (
        <section
          ref={resultRef}
          className={`verify-result verify-result--${shown.tone}`}
          aria-label="Verification result"
          data-testid="verify-result"
          data-status={verdict.status}
        >
          <h4 className="verify-result-title">
            <span className="verify-result-icon" aria-hidden="true">
              {shown.icon}
            </span>
            {shown.title}
          </h4>
          {verdict.status === VERIFY_STATUS.VALID && (
            <p>
              {address.trim()
                ? `${address.trim()} signed this message.`
                : `This message was signed by ${verdict.signer}.`}
            </p>
          )}
          {verdict.reason && <p>{verdict.reason}</p>}
          {/* Its own line, not a grey tail on the sentence above — mid-paragraph a colour change
              reads as a rendering fault rather than as a footnote.
              Only on a VALID verdict: `method` on a negative records which leg produced it, and
              "no network was needed" is simply untrue of the no-code path, which reached the chain
              to learn that the address holds no contract. */}
          {verdict.status === VERIFY_STATUS.VALID && METHOD_NOTE[verdict.method] && (
            <p className="verify-hint">{METHOD_NOTE[verdict.method]}</p>
          )}
          {verdict.status === VERIFY_STATUS.UNVERIFIABLE && (
            <p className="verify-hint">
              This is not a failed check — nothing here says the signature is bad.
            </p>
          )}
        </section>
      )}
    </form>
  )
}

VerifyMessageForm.propTypes = {
  verifying: PropTypes.bool,
  verdict: PropTypes.shape({
    status: PropTypes.string,
    method: PropTypes.string,
    signer: PropTypes.string,
    reason: PropTypes.string,
  }),
  onVerify: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  /** Owned by VerifySection so it survives the sheet closing. */
  draft: PropTypes.shape({
    message: PropTypes.string,
    signature: PropTypes.string,
    address: PropTypes.string,
    chainId: PropTypes.string,
  }).isRequired,
  onDraftChange: PropTypes.func.isRequired,
}
