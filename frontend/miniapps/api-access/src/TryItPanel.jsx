import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { apiUrl, requestJson } from './apiClient'
import { prettyJson } from './format'
import { queryParameterNames, tryableOperations } from './openapiModel'

/**
 * Send one GET, and show exactly what came back (spec 095).
 *
 * GET ONLY. A POST from here would be this console acting for the member, and the one POST worth
 * having — `/v1/member/keys/revoke` — needs a signature no mini-app can produce. The picker is
 * built from the loaded document rather than a list in this file, so it can never offer an endpoint
 * this gateway does not serve.
 *
 * AN ERROR IS A RESULT. A `403 insufficient_scope` answers the member's question precisely: the key
 * works and lacks a scope. Rendering that as "request failed" would throw away the only useful part
 * of the response, so the status line, the error code and the gateway's own reason are all shown,
 * along with the raw body.
 */
export default function TryItPanel({ baseUrl, token, spec }) {
  const operations = useMemo(() => (spec.status === 'read' ? tryableOperations(spec.doc) : []), [spec])
  const [selectedKey, setSelectedKey] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState({ status: 'idle' })
  const abortRef = useRef(null)

  // Keep the selection valid across a reload of the description — an operation that vanished must
  // not stay selected and quietly send to a path the gateway no longer documents.
  useEffect(() => {
    if (operations.length === 0) {
      setSelectedKey('')
      return
    }
    setSelectedKey((current) => (operations.some((op) => op.key === current) ? current : operations[0].key))
  }, [operations])

  useEffect(() => () => abortRef.current?.abort(), [])

  const selected = operations.find((op) => op.key === selectedKey) || null
  const declaredQuery = selected ? queryParameterNames(selected) : []

  const send = useCallback(async () => {
    if (!baseUrl || !selected) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'loading' })

    const trimmed = query.trim().replace(/^\?/, '')
    const url = apiUrl(baseUrl, selected.path) + (trimmed ? `?${trimmed}` : '')

    try {
      const result = await requestJson(url, { token: token || undefined, signal: controller.signal })
      if (controller.signal.aborted) return
      if (result.state === 'ok') setState({ status: 'read', httpStatus: result.status, body: result.body })
      else if (result.state === 'error') {
        setState({ status: 'refused', httpStatus: result.status, error: result.error, body: result.body, retryAfter: result.retryAfter })
      } else setState({ status: 'unavailable', reason: result.reason })
    } catch (err) {
      if (err && err.name === 'AbortError') return
      setState({ status: 'unavailable', reason: String((err && err.message) || err) })
    }
  }, [baseUrl, selected, query, token])

  return (
    <section className="aa-card">
      <h2 className="aa-card-title">Try a read</h2>

      {spec.status !== 'read' ? (
        <p className="aa-notice" role="status">
          The endpoint list comes from the API description above. Load it to try a request.
        </p>
      ) : operations.length === 0 ? (
        <p className="aa-notice" role="status">
          This gateway documents no GET endpoints that can be called from here.
        </p>
      ) : (
        <>
          <div className="aa-field">
            <label className="aa-label" htmlFor="aa-tryit-op">Endpoint</label>
            <select
              id="aa-tryit-op"
              className="aa-input aa-select"
              value={selectedKey}
              onChange={(e) => { setSelectedKey(e.target.value); setQuery('') }}
            >
              {operations.map((op) => (
                <option key={op.key} value={op.key}>{op.method} {op.path}</option>
              ))}
            </select>
            {selected?.summary && <p className="aa-help">{selected.summary}</p>}
            <p className="aa-help">
              {selected?.scope
                ? <>Requires scope <code>{selected.scope}</code> — a token without it gets an honest <code>insufficient_scope</code>.</>
                : <>No scope required.</>}
            </p>
          </div>

          <div className="aa-field">
            <label className="aa-label" htmlFor="aa-tryit-query">Query string</label>
            <input
              id="aa-tryit-query"
              className="aa-input aa-mono"
              type="text"
              autoComplete="off"
              spellCheck="false"
              placeholder="chainId=137"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-describedby="aa-tryit-query-help"
            />
            <p id="aa-tryit-query-help" className="aa-help">
              Optional.{declaredQuery.length > 0 ? ` This endpoint accepts: ${declaredQuery.join(', ')}.` : ''}
            </p>
          </div>

          {!token && selected?.scope && (
            <p className="aa-notice" role="status">
              This endpoint needs a token. Paste one in the connection card to send it.
            </p>
          )}

          <button
            type="button"
            className="aa-btn aa-btn-primary"
            onClick={send}
            disabled={!baseUrl || !selected || state.status === 'loading'}
          >
            {state.status === 'loading' ? 'Sending…' : 'Send'}
          </button>

          <ResponseView state={state} />
        </>
      )}
    </section>
  )
}

function ResponseView({ state }) {
  if (state.status === 'idle') return null
  if (state.status === 'loading') return <p className="aa-notice" role="status">Sending…</p>

  if (state.status === 'unavailable') {
    return (
      <div className="aa-error" role="alert">
        <p className="aa-error-title">No answer.</p>
        <p>{state.reason}</p>
      </div>
    )
  }

  if (state.status === 'refused') {
    return (
      <div className="aa-response">
        {/* The status line IS the answer here — an error body is a result, not a failure to read. */}
        <p className="aa-error" role="alert">
          <strong>{state.httpStatus}</strong> <code>{state.error.code}</code>
          {state.error.reason ? ` — ${state.error.reason}` : ''}
          {state.retryAfter ? ` (retry after ${state.retryAfter}s)` : ''}
        </p>
        {state.body != null && (
          // No `aria-label`: a <pre> maps to role `generic`, where naming attributes are
          // prohibited. The paragraph above it is the label a screen reader actually reaches.
          <pre className="aa-json" tabIndex={0}>{prettyJson(state.body)}</pre>
        )}
      </div>
    )
  }

  return (
    <div className="aa-response" role="status">
      <p className="aa-response-status"><strong>{state.httpStatus}</strong> OK</p>
      <pre className="aa-json" tabIndex={0}>{prettyJson(state.body)}</pre>
    </div>
  )
}
