/**
 * ScreeningInfoButton (Spec 021 iteration 2) — an info (ⓘ) button that explains
 * how address screening works: it is an advisory pre-check, the on-chain guard
 * is the real enforcement, results fail closed, and they are network-scoped.
 * Links to the detailed user-guide doc.
 */

import { useState, useRef, useEffect } from 'react'
import './ScreeningInfo.css'

export default function ScreeningInfoButton({ className = '' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className={`ab-info-wrap ${className}`} ref={wrapRef}>
      <button
        type="button"
        className="ab-info-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="How address screening works"
        title="How screening works"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      {open && (
        <div className="ab-info-popover" role="dialog" aria-label="How address screening works">
          <h4>How address screening works</h4>
          <ul>
            <li>
              <strong>Advisory only.</strong> The warning tags are a convenience pre-check. They
              do <em>not</em> block anything by themselves.
            </li>
            <li>
              <strong>On-chain guard enforces.</strong> The smart contracts independently screen
              every participant, so a restricted address is blocked on-chain even if the app shows
              no warning.
            </li>
            <li>
              <strong>Fails closed.</strong> If an address can&apos;t be screened (the guard isn&apos;t
              configured on the network, or the check fails), it shows as
              <em> Unscreened</em> — never as clear.
            </li>
            <li>
              <strong>Network-scoped.</strong> A result applies only to the network it was checked
              on; the same address may screen differently on another network.
            </li>
          </ul>
          <p className="ab-info-doc">
            See the{' '}
            <a
              href="https://chippr-robotics.github.io/prediction-dao-research/user-guide/address-book/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Address Book &amp; screening guide
            </a>{' '}
            for full details.
          </p>
        </div>
      )}
    </span>
  )
}
