/**
 * usePerpsPositions (spec 082, US2) — the connected account's open perp positions per venue,
 * read-only through the gateway.
 *
 * Conventions carried over from useEarnPositions:
 *   - 60s poll aligned with the portfolio cadence; a request id guards stale responses;
 *   - account change hard-resets state before paint (effect keyed on the account) so one
 *     account's positions can never render for another (US2 acceptance 3);
 *   - per-venue isolation arrives from the gateway as `sources` and is passed through, so one
 *     venue's outage never blanks the rest (FR-004/FR-007).
 *
 * GMX positions are honestly absent this release (the venue is missing from `sources`); the
 * component discloses "view on GMX" instead of pretending an empty read.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPerpPositions } from '../lib/perps/perpsClient'
import { perpsAvailable } from '../config/perps'

const POLL_MS = 60_000

export function usePerpsPositions(account, { deps } = {}) {
  const io = { fetchPositions: fetchPerpPositions, available: perpsAvailable, ...deps }
  const supported = io.available() && Boolean(account)

  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'unavailable'
  const [positions, setPositions] = useState([])
  const [sources, setSources] = useState({})
  const reqIdRef = useRef(0)
  const ioRef = useRef(io)
  useEffect(() => {
    ioRef.current = io
  })

  const load = useCallback(async (addr) => {
    if (!addr || !ioRef.current.available()) {
      setStatus('idle')
      return
    }
    const reqId = ++reqIdRef.current
    try {
      const body = await ioRef.current.fetchPositions(addr)
      if (reqIdRef.current !== reqId) return // a newer request (or another account) owns the state
      setPositions(Array.isArray(body?.positions) ? body.positions : [])
      setSources(body?.sources ?? {})
      setStatus('ready')
    } catch {
      if (reqIdRef.current !== reqId) return
      setPositions([])
      setSources({})
      setStatus('unavailable')
    }
  }, [])

  // Account change (or connect/disconnect): hard reset BEFORE paint so another account's
  // positions never render, then start this account's cycle.
  useEffect(() => {
    reqIdRef.current += 1
    setPositions([])
    setSources({})
    if (!supported) {
      setStatus('idle')
      return undefined
    }
    setStatus('loading')
    load(account)
    const timer = setInterval(() => load(account), POLL_MS)
    return () => clearInterval(timer)
  }, [supported, account, load])

  const unreadableVenues = Object.entries(sources)
    .filter(([, s]) => s?.status === 'degraded')
    .map(([venue]) => venue)

  return { status, supported, positions, sources, unreadableVenues, refresh: () => load(account) }
}
