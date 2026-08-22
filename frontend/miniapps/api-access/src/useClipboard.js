import { useCallback, useEffect, useRef, useState } from 'react'

const COPIED_RESET_MS = 2000

/**
 * Copy-to-clipboard, with failure as visible state rather than a console line.
 *
 * A copy of the same hook Token Mint carries, and safe to copy for the same reason: it is pure
 * logic with no host state, no React context identity and no singleton requirement. A package
 * cannot import it from `frontend/src/` — a package is built separately and frozen at an immutable
 * CID, so a shared import would be a build error, not a shortcut.
 *
 * `copy()` resolves a boolean and never throws; `copied` flips true for two seconds after a
 * successful write; `error` carries a sentence the member can act on when the browser refuses.
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
      setError("Couldn't copy — your browser doesn't allow it. Select the text to copy it manually.")
      return false
    }

    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
      return true
    } catch (err) {
      console.warn('Clipboard write failed:', err)
      setError("Couldn't copy — select the text to copy it manually.")
      return false
    }
  }, [])

  return { copied, error, copy }
}

export default useClipboard
