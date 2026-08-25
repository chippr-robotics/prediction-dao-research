/**
 * AssistantPanel (spec 095) — the chat surface behind the floating launcher.
 *
 * Built on `ActionSheet` rather than beside it: that component already owns the dialog role, the
 * focus trap, the Escape/backdrop close, the background scroll lock, the z-1500 backdrop that sits
 * above the fixed bottom nav, and the mobile safe-area padding. A second implementation of those
 * would be a second set of bugs.
 *
 * FOUR THINGS THIS PANEL WILL NOT DO:
 *
 * 1. **It never invents a reply.** Every failure has its own honest sentence and a retry — an
 *    unreachable gateway reads as unreachable, a disabled assistant reads as disabled. The one
 *    unacceptable behaviour for an assistant is answering when its backend did not.
 * 2. **It never signs or submits**, and every reply says so in its own footer rather than once at
 *    the top where it scrolls away.
 * 3. **It never asks for a session silently.** The first open explains, in advance, what the
 *    signature is for, what it authorises, how long it lasts and that the token never leaves this
 *    tab — then asks.
 * 4. **Its live region is `polite`.** A reply is not an error, and `assertive` interrupts whatever
 *    a screen-reader user was doing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'
import ActionSheet from '../account/ActionSheet'
import { useWallet } from '../../hooks/useWalletManagement'
import { resolveGrantSigner } from '../../lib/apiAccess/grantSigner'
import {
  ASSISTANT_SESSION_SCOPES,
  authorizeSession,
  hasSession,
  sendChat,
} from '../../lib/assistant/assistantClient'
import { isMemoryRetained } from '../../lib/assistant/assistantPrefs'
import { clearMemory, loadMemory, saveMemory } from '../../lib/assistant/memoryStore'
import { extractInAppLinks } from '../../lib/assistant/replyLinks'
import './AssistantPanel.css'

/** The gateway accepts at most 20 turns per request; send the most recent window. */
const MAX_TURNS_SENT = 20

/** Repeated under every reply — not once at the top, where it scrolls out of view. */
export const REPLY_DISCLAIMER = 'AI-generated — verify before acting. The assistant never signs or submits.'

/**
 * One turn. A reply carries its own disclaimer — repeated per bubble rather than stated once at the
 * top, where it scrolls away — and any in-app paths it mentioned become shortcuts. A path the app
 * does not route stays plain text inside the bubble (see `lib/assistant/replyLinks.js`).
 */
function Message({ message, onNavigate }) {
  const links = message.role === 'assistant' ? extractInAppLinks(message.content) : []
  return (
    <div className={`assistant-panel__message assistant-panel__message--${message.role}`}>
      <p className="assistant-panel__bubble">{message.content}</p>
      {message.role === 'assistant' && (
        <>
          {links.length > 0 && (
            <nav className="assistant-panel__links" aria-label="Places in the app">
              {links.map((link) => (
                <Link key={link.path} to={link.path} className="assistant-panel__link" onClick={onNavigate}>
                  {link.path}
                </Link>
              ))}
            </nav>
          )}
          <p className="assistant-panel__disclaimer">{REPLY_DISCLAIMER}</p>
        </>
      )}
    </div>
  )
}

Message.propTypes = {
  message: PropTypes.shape({ role: PropTypes.string, content: PropTypes.string }).isRequired,
  onNavigate: PropTypes.func,
}

export default function AssistantPanel({ open, onClose, surface = null }) {
  const { address: account, signer, loginMethod } = useWallet()

  const retain = account ? isMemoryRetained(account) : false
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null) // { state, message, retryAfterSeconds }
  const [authorizing, setAuthorizing] = useState(false)
  const [authorized, setAuthorized] = useState(() => hasSession(account))
  const threadRef = useRef(null)

  const grantSigner = useMemo(
    () => resolveGrantSigner({ loginMethod, signer, address: account }),
    [loginMethod, signer, account]
  )

  // Restore the remembered conversation once per opening. Retention off means there is nothing to
  // restore, which is the whole point of the preference.
  useEffect(() => {
    if (!open || !account) return
    setAuthorized(hasSession(account))
    setMessages(retain ? loadMemory(account) : [])
    setError(null)
  }, [open, account, retain])

  // Keep the newest turn in view.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending, error])

  const persist = useCallback(
    (next) => {
      setMessages(next)
      if (account && retain) saveMemory(account, next)
    },
    [account, retain]
  )

  const authorize = useCallback(async () => {
    setError(null)
    if (!grantSigner.canSign) {
      setError({ state: 'unauthorized', message: grantSigner.reason || 'This account cannot authorize a session.' })
      return
    }
    setAuthorizing(true)
    try {
      await authorizeSession({ account, sign: grantSigner.sign })
      setAuthorized(true)
    } catch (e) {
      const rejected =
        e?.code === 'ACTION_REJECTED' ||
        e?.name === 'CeremonyCancelled' ||
        /reject|denied|cancel/i.test(e?.message || '')
      setError({
        state: 'unauthorized',
        message: rejected
          ? 'Signature was cancelled — the assistant was not authorized.'
          : e?.message || 'The assistant session could not be authorized.',
      })
    } finally {
      setAuthorizing(false)
    }
  }, [account, grantSigner])

  const send = useCallback(
    async (thread) => {
      setSending(true)
      setError(null)
      try {
        const payload = thread.slice(-MAX_TURNS_SENT).map((m) => ({ role: m.role, content: m.content }))
        const result = await sendChat({ account, messages: payload, surface })
        persist([...thread, { role: 'assistant', content: result.reply, at: Date.now() }])
      } catch (e) {
        if (e?.state === 'unauthorized') setAuthorized(false)
        setError({
          state: e?.state || 'rejected',
          message: e?.message || 'The assistant could not answer.',
          retryAfterSeconds: e?.retryAfterSeconds ?? null,
        })
      } finally {
        setSending(false)
      }
    },
    [account, persist, surface]
  )

  const submit = useCallback(
    (e) => {
      e?.preventDefault?.()
      const text = draft.trim()
      if (!text || sending) return
      const next = [...messages, { role: 'user', content: text, at: Date.now() }]
      persist(next)
      setDraft('')
      send(next)
    },
    [draft, messages, persist, send, sending]
  )

  const retry = useCallback(() => {
    // Resend the thread as it stands: the member's last question is still the last turn, so this
    // never duplicates it.
    if (messages.length > 0) send(messages)
  }, [messages, send])

  const forget = useCallback(() => {
    if (account) clearMemory(account)
    setMessages([])
    setError(null)
  }, [account])

  const lastReply = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'assistant') return messages[i].content
    }
    return ''
  }, [messages])

  return (
    <ActionSheet open={open} onClose={onClose} title="FairWins assistant" className="assistant-sheet">
      {!authorized ? (
        <div className="assistant-panel__authorize" data-testid="assistant-authorize">
          <p className="assistant-panel__lead">
            The assistant needs a short-lived key of your own before it can answer. You will be asked
            to sign one message — <strong>no transaction, no fee, nothing moves</strong>.
          </p>
          <ul className="assistant-panel__list">
            <li>
              It authorises reading your own data and talking to the assistant
              (<code>{ASSISTANT_SESSION_SCOPES.join(', ')}</code>). It cannot move funds.
            </li>
            <li>It lasts 24 hours and is kept in this tab only — never saved, never backed up.</li>
            <li>Closing the tab or switching accounts ends it.</li>
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            onClick={authorize}
            disabled={authorizing}
            data-testid="assistant-authorize-button"
          >
            {authorizing ? 'Waiting for your signature…' : 'Sign to start'}
          </button>
        </div>
      ) : (
        <>
          <div className="assistant-panel__thread" ref={threadRef} data-testid="assistant-thread">
            {messages.length === 0 && !sending && (
              <p className="assistant-panel__empty">
                Ask about anything in the app — a screen, a fee, what a wager is waiting on. The
                assistant explains and points you at the right place; it never acts for you.
              </p>
            )}
            {messages.map((message, index) => (
              <Message
                key={`${message.role}-${index}-${message.at ?? index}`}
                message={message}
                onNavigate={onClose}
              />
            ))}
            {sending && <p className="assistant-panel__pending">Thinking…</p>}
          </div>

          {/* Replies are announced POLITELY — a reply is not an alert (area7 constraint 8). */}
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {sending ? 'The assistant is thinking.' : lastReply}
          </div>

          {error && (
            <div className="assistant-panel__error" role="alert" data-testid="assistant-error">
              <p>{error.message}</p>
              {error.state === 'quota' && error.retryAfterSeconds ? (
                <p className="assistant-panel__hint">Try again in about {error.retryAfterSeconds} seconds.</p>
              ) : null}
              {/* The two TERMINAL states offer no retry, because retrying cannot change them. A bare
                  sentence over a still-live composer reads as "try again anyway", so say what this
                  is instead: nothing on this member's side is wrong, and nothing they do here will
                  fix it. */}
              {error.state === 'unset' || error.state === 'unconfigured' ? (
                <p className="assistant-panel__hint">
                  Nothing is wrong with your account or your key — the assistant is switched off for
                  this app right now, so sending again will get the same answer. Everything else in
                  the app works as usual.
                </p>
              ) : null}
              {error.state === 'unauthorized' ? (
                <button type="button" className="btn" onClick={authorize} disabled={authorizing}>
                  Authorize again
                </button>
              ) : error.state === 'unset' || error.state === 'unconfigured' ? null : (
                <button type="button" className="btn" onClick={retry} disabled={sending}>
                  Try again
                </button>
              )}
            </div>
          )}

          <form className="assistant-panel__composer" onSubmit={submit}>
            <label htmlFor="assistant-input" className="sr-only">
              Message the assistant
            </label>
            <textarea
              id="assistant-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
              placeholder="Ask about anything in the app"
              rows={2}
              disabled={sending}
            />
            <div className="assistant-panel__composer-actions">
              <button type="button" className="btn" onClick={forget} disabled={messages.length === 0 || sending}>
                Clear
              </button>
              <button type="submit" className="btn btn-primary" disabled={sending || draft.trim() === ''}>
                Send
              </button>
            </div>
          </form>
        </>
      )}
    </ActionSheet>
  )
}

AssistantPanel.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func.isRequired,
  /** Where the member opened it from, forwarded to the gateway so answers can be contextual. */
  surface: PropTypes.string,
}
