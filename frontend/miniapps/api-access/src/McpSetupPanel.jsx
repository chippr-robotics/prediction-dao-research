import { useMemo } from 'react'
import { useMiniAppHost } from '@fairwins/miniapp-sdk'

import { mcpConfigSnippet, TOKEN_PLACEHOLDER } from './mcpConfig'
import useClipboard from './useClipboard'

/**
 * Connect an AI client to this account (spec 095).
 *
 * The snippet is generated from the gateway address and a PLACEHOLDER — never the token this
 * console is holding. See `mcpConfig.js` for why that is not a convenience worth having.
 */
export default function McpSetupPanel({ baseUrl }) {
  const host = useMiniAppHost()
  const { copied, error, copy } = useClipboard()
  const snippet = useMemo(() => mcpConfigSnippet(baseUrl), [baseUrl])

  const onCopy = async () => {
    const ok = await copy(snippet)
    if (ok) host.toast.show('MCP config copied.', 'success')
  }

  return (
    <section className="aa-card">
      <h2 className="aa-card-title">Connect an AI client</h2>
      <p className="aa-help">
        The FairWins MCP server exposes these same reads as tools an AI client can call. It signs
        nothing and creates no keys — it presents the token you give it, and nothing more.
      </p>

      {/* No `aria-label`: a <pre> maps to role `generic`, where naming attributes are prohibited.
          The card heading is what names this block. `tabIndex` keeps the scroll box reachable. */}
      <pre className="aa-json" tabIndex={0}>{snippet}</pre>

      <div className="aa-row">
        <button type="button" className="aa-btn aa-btn-primary" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy config'}
        </button>
      </div>
      {error && <p className="aa-error" role="alert">{error}</p>}

      <ul className="aa-notes">
        <li>
          <strong>The token slot is a placeholder</strong> — <code>{TOKEN_PLACEHOLDER}</code>. Replace
          it in the file yourself. This console never writes a real token into anything you copy,
          because a config file gets pasted into places a credential should not go.
        </li>
        <li>
          Correct the path in <code>args</code> to wherever you installed the server.
        </li>
        <li>
          Treat the finished file as a credential: anyone holding it can read what your key’s scopes
          allow, for as long as the key is valid.
        </li>
      </ul>
    </section>
  )
}
