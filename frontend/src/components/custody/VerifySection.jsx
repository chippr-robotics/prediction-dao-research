/**
 * Protect ▸ Verify — the message signing / signature checking area.
 *
 * Both tasks are long forms, and Protect is already a long page: inline (or even in an accordion)
 * they pushed the vault sections far below the fold and made the tab unscannable. So the area
 * itself is just two entry rows — a title, a one-line current state, one button each — and the
 * work happens in the shared `ActionSheet` (a bottom sheet on mobile, a centred card on desktop,
 * the same component the account-security actions use). The page stays short, and the form gets a
 * focused surface with nothing else competing for attention.
 *
 * Two consequences worth stating, because both are deliberate:
 *
 * - **The sheet is not disposable state.** Closing it keeps the last signed document and the last
 *   verdict, so reopening shows them again — a member who signed, closed, and then went looking
 *   for the document has not lost it.
 * - **The row's summary is the honest state**, not decoration: it carries the verdict tone and the
 *   refusal reason, so the answer is visible without opening anything.
 *
 * Checking comes first. It is the task a member arrives with (someone handed them a proof), and it
 * is the half that can never cost them anything.
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import ActionSheet from '../account/ActionSheet'
import { useMessageSigning } from '../../hooks/useMessageSigning'
import { VERIFY_STATUS } from '../../lib/verify/verifyMessage'
import SignMessageForm from './SignMessageForm'
import VerifyMessageForm from './VerifyMessageForm'
import './Verify.css'

const VERDICT_SUMMARY = {
  [VERIFY_STATUS.VALID]: { tone: 'ok', text: 'Last check: signature is valid' },
  [VERIFY_STATUS.INVALID]: { tone: 'bad', text: 'Last check: signature does not match' },
  [VERIFY_STATUS.UNVERIFIABLE]: { tone: 'unknown', text: 'Last check: could not be checked' },
}

/** One entry row: what it does, where it currently stands, and the control that opens it. */
function VerifyEntry({ title, summary, tone, action, actionLabel, onOpen, disabled = false }) {
  return (
    <div className="verify-entry" data-tone={tone || 'none'}>
      <div className="verify-entry__text">
        <h4 className="verify-entry__title">{title}</h4>
        <p className="verify-entry__summary">{summary}</p>
      </div>
      {/* Visible text is the verb alone — repeating the row's own heading on the button beside it
          reads as a duplication bug. The full phrase stays the ACCESSIBLE name, because a screen
          reader tabbing to controls hears them out of the rows' context, where a bare "Check"
          says nothing. */}
      <button
        type="button"
        className="verify-entry__action"
        onClick={onOpen}
        disabled={disabled}
        aria-label={actionLabel}
      >
        {action}
      </button>
    </div>
  )
}

VerifyEntry.propTypes = {
  title: PropTypes.string.isRequired,
  summary: PropTypes.node.isRequired,
  /** Colours the row's state marker: 'ok' | 'bad' | 'unknown' | undefined. */
  tone: PropTypes.string,
  action: PropTypes.string.isRequired,
  /** Accessible name — the full phrase the short visible label abbreviates. */
  actionLabel: PropTypes.string.isRequired,
  onOpen: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
}

export default function VerifySection({ deps }) {
  const {
    address,
    chainId,
    capability,
    signing,
    document: signedDocument,
    signError,
    sign,
    clearSigned,
    verifying,
    verdict,
    verify,
    checkOnChain,
    clearVerdict,
  } = useMessageSigning({ deps })

  const [openSheet, setOpenSheet] = useState(null) // null | 'check' | 'sign'
  const close = () => setOpenSheet(null)

  // Both drafts live here rather than in the forms, because ActionSheet unmounts its children when
  // closed. Without this, closing the sheet would silently discard a half-typed message — and, on
  // the signing side, would leave the returning member looking at a document with no message under
  // it (the form only shows a document that still matches the text on screen).
  const [signText, setSignText] = useState('')
  // The network starts UNSPECIFIED, deliberately — not pre-filled with whatever the member happens
  // to be connected to. Pre-filling reads as a stated fact the member never stated, and it has
  // teeth: a contract-account signature checked against an assumed chain finds no code there and
  // returns a definite "does not match", when the honest answer is "you haven't said which network
  // this account is on". A convenience default would have quietly reintroduced the confidently
  // wrong accusation this whole surface is built to avoid. Pasting a record still fills it in,
  // because the record actually says. Caught in review on #1165.
  const [checkDraft, setCheckDraft] = useState({
    message: '',
    signature: '',
    address: '',
    chainId: '',
  })

  const checkSummary = verdict ? VERDICT_SUMMARY[verdict.status] : null

  return (
    <div className="verify-area">
      {/* Spec 085 (FR-010): no intro paragraph — the section's accordion summary carries the
          one-line state, and the full explanation lives in docs/developer-guide/message-signing.md.
          The entry rows below are self-describing. */}
      <VerifyEntry
        title="Check a signature"
        summary={checkSummary?.text || 'Confirm an address signed a message'}
        tone={checkSummary?.tone}
        action="Check"
        actionLabel="Check a signature"
        onOpen={() => setOpenSheet('check')}
      />

      <VerifyEntry
        title="Sign a message"
        // The refusal reason IS the summary when this account cannot sign: a member should not have
        // to open a sheet to find out that the control inside it is withdrawn.
        summary={
          capability.canSign
            ? signedDocument
              ? 'Signed — reopen to copy the document'
              : 'Prove you control this account'
            : capability.reason
        }
        tone={capability.canSign ? (signedDocument ? 'ok' : undefined) : 'unknown'}
        action={signedDocument ? 'View' : 'Sign'}
        actionLabel={signedDocument ? 'View signature' : 'Sign a message'}
        onOpen={() => setOpenSheet('sign')}
      />

      {/* `closeDisabled` while a check or a signing ceremony is in flight — a sheet dismissed out
          from under an in-progress wallet prompt leaves the member with no idea what happened. */}
      <ActionSheet
        open={openSheet === 'check'}
        onClose={close}
        title="Check a signature"
        closeDisabled={verifying}
        className="action-sheet--verify"
      >
        <VerifyMessageForm
          verifying={verifying}
          verdict={verdict}
          onVerify={verify}
          onCheckOnChain={checkOnChain}
          onClear={clearVerdict}
          draft={checkDraft}
          onDraftChange={setCheckDraft}
        />
      </ActionSheet>

      <ActionSheet
        open={openSheet === 'sign'}
        onClose={close}
        title="Sign a message"
        closeDisabled={signing}
        className="action-sheet--verify"
      >
        <SignMessageForm
          address={address}
          chainId={chainId}
          capability={capability}
          signing={signing}
          signedDocument={signedDocument}
          error={signError}
          onSign={sign}
          onClear={clearSigned}
          message={signText}
          onMessageChange={setSignText}
        />
      </ActionSheet>
    </div>
  )
}

VerifySection.propTypes = {
  /** Test seam forwarded to useMessageSigning (readSession / signer / verifier injection). */
  deps: PropTypes.object,
}
