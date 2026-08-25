/**
 * AssistantPreferencesPanel (spec 095) — the "Assistant" card of the Settings tab.
 *
 * The assistant is OFF until a member turns it on, and this card is the only place that happens.
 * Everything on it exists to make the trade legible before the switch is flipped, not after:
 *
 *   · The master switch. Off means the launcher does not render, no session is authorised, and no
 *     message leaves the device — so the summary line says "Off — nothing is sent", which is a
 *     statement of fact rather than a label.
 *   · Memory retention, with a LIVE COUNT beside the clear button. "Clear" that does not tell you
 *     what it cleared is a promise; a number the member watches go to zero is a fact.
 *   · A plain-language data-use disclosure. What leaves the device, where it goes, what stays here,
 *     and what happens while the assistant is off — with a link to the privacy policy that says the
 *     same thing in its own register.
 *
 * Both preferences are WALLET-SCOPED (consent belongs to an account, not a browser) and neither is
 * in the encrypted backup: restoring onto a new phone must not arrive with the assistant already on.
 */

import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '../../hooks/useWalletManagement'
import AccordionSection from './AccordionSection'
import NavIcon from '../nav/NavIcon'
import {
  isAssistantEnabled,
  isMemoryRetained,
  setAssistantEnabled,
  setMemoryRetained,
} from '../../lib/assistant/assistantPrefs'
import { clearMemory, memoryCount, subscribeAssistantMemory } from '../../lib/assistant/memoryStore'
import { clearSession } from '../../lib/assistant/assistantClient'
import { captureAssistantPreference } from '../../data/ledger/sources/accessLedgerSource'
import './AssistantPreferencesPanel.css'

export default function AssistantPreferencesPanel() {
  const { address: account, chainId, isConnected } = useWallet()

  const [revision, setRevision] = useState(0)
  const rerender = useCallback(() => setRevision((n) => n + 1), [])

  // The count is live because the panel is not the only thing that changes it — a conversation in
  // the assistant panel does too.
  useEffect(() => subscribeAssistantMemory(rerender), [rerender])

  const enabled = isConnected && account ? isAssistantEnabled(account) : false
  const retain = isConnected && account ? isMemoryRetained(account) : true
  const count = isConnected && account ? memoryCount(account) : 0
  // `revision` is read so the linter and a reader both see why this component re-renders.
  void revision

  const toggleEnabled = useCallback(() => {
    if (!account) return
    const next = !enabled
    setAssistantEnabled(account, next)
    if (!next) {
      // Switching off drops the in-memory session immediately: the member should not have to
      // reload for "off" to mean off.
      clearSession()
    }
    captureAssistantPreference(account, chainId, next)
    rerender()
  }, [account, chainId, enabled, rerender])

  const toggleRetain = useCallback(() => {
    if (!account) return
    const next = !retain
    setMemoryRetained(account, next)
    // Turning retention off empties what is already held — leaving it would mean "stop remembering"
    // silently kept the part it had already remembered.
    if (!next) clearMemory(account)
    rerender()
  }, [account, retain, rerender])

  const clearNow = useCallback(() => {
    if (!account) return
    clearMemory(account)
    rerender()
  }, [account, rerender])

  let summary = 'Off — nothing is sent'
  if (!isConnected || !account) summary = 'Connect a wallet'
  else if (enabled && retain) summary = `On — ${count} message${count === 1 ? '' : 's'} kept on this device`
  else if (enabled) summary = 'On — nothing kept on this device'

  return (
    <AccordionSection
      id="assistant-prefs"
      title="Assistant"
      summary={summary}
      icon={<NavIcon name="chat" size={18} />}
      className="assistant-prefs"
      data-testid="assistant-prefs-panel"
    >
      {!isConnected || !account ? (
        <p role="note">Connect your wallet to turn the assistant on.</p>
      ) : (
        <>
          <div className="assistant-prefs__row">
            <div className="assistant-prefs__text">
              <span className="assistant-prefs__label" id="assistant-prefs-enable-label">
                FairWins assistant
              </span>
              <span className="assistant-prefs__sub">
                {enabled
                  ? 'On — a button appears in the app, and what you type there is sent to the FairWins gateway and its model provider.'
                  : 'Off — the assistant does not appear anywhere, and nothing is sent.'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby="assistant-prefs-enable-label"
              className={`assistant-prefs__switch ${enabled ? 'on' : ''}`}
              onClick={toggleEnabled}
              data-testid="assistant-enable-switch"
            >
              <span className="sr-only">{enabled ? 'Assistant on' : 'Assistant off'}</span>
            </button>
          </div>

          <div className="assistant-prefs__row">
            <div className="assistant-prefs__text">
              <span className="assistant-prefs__label" id="assistant-prefs-memory-label">
                Remember conversations on this device
              </span>
              <span className="assistant-prefs__sub">
                {retain
                  ? 'On — the last few messages stay in this browser so the assistant remembers where you were. They are never backed up or synced.'
                  : 'Off — the conversation is forgotten as soon as you close the panel.'}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={retain}
              aria-labelledby="assistant-prefs-memory-label"
              className={`assistant-prefs__switch ${retain ? 'on' : ''}`}
              onClick={toggleRetain}
              data-testid="assistant-memory-switch"
            >
              <span className="sr-only">{retain ? 'Memory on' : 'Memory off'}</span>
            </button>
          </div>

          <div className="assistant-prefs__clear">
            <button type="button" className="btn" onClick={clearNow} disabled={count === 0}>
              Clear conversation memory
            </button>
            <span className="assistant-prefs__count" role="status" data-testid="assistant-memory-count">
              {count === 0
                ? 'Nothing stored on this device'
                : `${count} message${count === 1 ? '' : 's'} stored on this device`}
            </span>
          </div>

          <div className="assistant-prefs__disclosure">
            <h4>What happens to what you type</h4>
            <ul>
              <li>
                <strong>While the assistant is off, nothing is sent.</strong> No message, no account
                data, no page you are on.
              </li>
              <li>
                While it is on, your messages go to the FairWins gateway and on to its model
                provider, which answers them. They are not used to train models by us.
              </li>
              <li>
                The conversation itself stays on this device. It is not backed up, not synced between
                your devices, and you can clear it above.
              </li>
              <li>
                The assistant never signs and never submits anything. Every action still takes your
                own signature, on the screen that action belongs to.
              </li>
            </ul>
            <p>
              <a href="/privacy" className="assistant-prefs__link">
                Read the Privacy Policy
              </a>
            </p>
          </div>
        </>
      )}
    </AccordionSection>
  )
}
