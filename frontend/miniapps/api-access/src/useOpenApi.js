import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiUrl, OPENAPI_PATH, requestJson } from './apiClient'

/**
 * Fetch the gateway's OpenAPI document once per base URL (spec 095).
 *
 * Lifted above the explorer because the "try it" panel needs the same document — two fetches of a
 * description that cannot differ between them would be two chances to disagree, and one of them
 * would be showing the member a list of endpoints the other could not call.
 *
 * State is one of:
 *   { status: 'idle' }                        no base URL yet — nothing has been asked
 *   { status: 'loading' }
 *   { status: 'read', doc }
 *   { status: 'unavailable', error?, reason? } the gateway said no, or nothing answered
 *
 * `unavailable` carries `error` when the GATEWAY answered with a code (`member_api_unconfigured`
 * is the common one) and `reason` when nothing answered at all. Both render as an alert and
 * neither renders a list: an endpoint roster that could not be read is not an empty API.
 */
export function useOpenApi(baseUrl) {
  const [state, setState] = useState({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!baseUrl) {
      setState({ status: 'idle' })
      return undefined
    }

    const controller = new AbortController()
    let cancelled = false
    setState({ status: 'loading' })

    requestJson(apiUrl(baseUrl, OPENAPI_PATH), { signal: controller.signal })
      .then((result) => {
        if (cancelled) return
        if (result.state === 'ok') setState({ status: 'read', doc: result.body })
        else if (result.state === 'error') setState({ status: 'unavailable', error: result.error, httpStatus: result.status })
        else setState({ status: 'unavailable', reason: result.reason })
      })
      .catch((err) => {
        if (cancelled || (err && err.name === 'AbortError')) return
        setState({ status: 'unavailable', reason: String((err && err.message) || err) })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [baseUrl, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  /*
   * MEMOISED, because consumers key work on this object's identity. `TryItPanel` derives its
   * endpoint picker from it inside a `useMemo` and reconciles the selection in an effect; a fresh
   * object every render would re-run both on every render forever. This is the same instability
   * that made the host's `readProvider` spin effects before it was cached per provider.
   */
  return useMemo(() => ({ ...state, reload }), [state, reload])
}

export default useOpenApi
