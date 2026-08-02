import { useCallback, useEffect, useRef, useState } from 'react'

const COPIED_RESET_MS = 2000

/**
 * Shared copy-to-clipboard hook (spec 011, contract H1–H3).
 *
 * Unlike the older inline handlers (which only console.error on failure),
 * this hook surfaces failures as state so surfaces can show a visible error
 * message (FR-004): `copied` flips true for 2 s after a successful write;
 * `error` is set when the Clipboard API is missing or the write fails.
 * `copy()` resolves a boolean and never throws.
 *
 * @returns {{ copied: boolean, error: string|null, copy: (text: string) => Promise<boolean> }}
 */
export function useClipboard() {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const copy = useCallback(async (text) => {
    clearTimeout(timerRef.current)
    setCopied(false)
    setError(null)

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setError("Couldn't copy — your browser doesn't allow it. Select the address text to copy manually.")
      return false
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
      return true
    } catch (err) {
      console.warn('Clipboard write failed:', err)
      setError("Couldn't copy — select the address text to copy manually.")
      return false
    }
  }, [])

  return { copied, error, copy }
}

export default useClipboard
