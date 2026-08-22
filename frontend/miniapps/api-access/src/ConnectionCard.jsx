import { useState } from 'react'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'

import { DEFAULT_BASE_URL, normalizeBaseUrl } from './apiClient'

/**
 * Where the console gets its two inputs (spec 095).
 *
 * The two are treated very differently, and the card says why:
 *   - the GATEWAY ADDRESS is configuration. A package can read none of the host's own config, so
 *     the member supplies it and it is remembered in the app's store.
 *   - the TOKEN is a credential. It is held in React state for the life of this mount and written
 *     nowhere — not the store, not the URL, not an audit line. That is stated on screen rather than
 *     left to be assumed, because a member who assumes the wrong one of those either loses their
 *     token every visit or leaves it somewhere they did not intend.
 */
export default function ConnectionCard({ baseUrl, savedBaseUrl, onSaveBaseUrl, token, onTokenChange }) {
  const host = useMiniAppHost()
  const [draft, setDraft] = useState(baseUrl || '')
  const [problem, setProblem] = useState(null)

  const save = (event) => {
    event.preventDefault()
    const parsed = normalizeBaseUrl(draft)
    if (!parsed.ok) {
      setProblem(parsed.reason)
      return
    }
    setProblem(null)
    setDraft(parsed.baseUrl)
    const persisted = onSaveBaseUrl(parsed.baseUrl)
    host.toast.show(
      persisted ? 'Gateway address saved.' : 'Using this gateway — it could not be saved for next time.',
      persisted ? 'success' : 'warning',
    )
  }

  return (
    <section className="aa-card">
      <h2 className="aa-card-title">Connection</h2>

      <form className="aa-form" onSubmit={save}>
        <div className="aa-field">
          <label className="aa-label" htmlFor="aa-base-url">Gateway address</label>
          <div className="aa-row">
            <input
              id="aa-base-url"
              className="aa-input"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck="false"
              placeholder={DEFAULT_BASE_URL}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-describedby="aa-base-url-help"
            />
            <button type="submit" className="aa-btn aa-btn-primary">Save</button>
          </div>
          <p id="aa-base-url-help" className="aa-help">
            The FairWins gateway this console talks to. Saved to this app’s own storage, so it is
            here next time. Currently in use: <code>{baseUrl || 'nothing yet'}</code>
            {savedBaseUrl && savedBaseUrl !== baseUrl ? ` (saved: ${savedBaseUrl})` : ''}
          </p>
          {problem && <p className="aa-error" role="alert">{problem}</p>}
        </div>

        <div className="aa-field">
          <label className="aa-label" htmlFor="aa-token">API token</label>
          <div className="aa-row">
            <input
              id="aa-token"
              className="aa-input aa-mono"
              type="password"
              autoComplete="off"
              spellCheck="false"
              placeholder="fw1.…"
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              aria-describedby="aa-token-help"
            />
            <button
              type="button"
              className="aa-btn"
              onClick={() => onTokenChange('')}
              disabled={!token}
            >
              Clear
            </button>
          </div>
          <p id="aa-token-help" className="aa-help">
            <strong>Held in memory only, and cleared when you leave this app.</strong> It is never
            written to storage, never put in a link, and never included in anything this console
            generates for you to copy. Paste it again next visit — or clear it now if you are done.
          </p>
        </div>
      </form>
    </section>
  )
}
