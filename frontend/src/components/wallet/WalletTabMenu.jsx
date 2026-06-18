/**
 * WalletTabMenu — collapses the My Account section tabs into a single kebab
 * (overflow) menu. Replaces the horizontal tab bar, which overflowed on narrow
 * screens. The trigger shows the active section; the menu lists every section.
 *
 * Accessible: the trigger is a `aria-haspopup="menu"` button reflecting the
 * current section; the list uses `role="menu"` with `menuitemradio` items.
 * Closes on selection, outside click, or Escape.
 */

import { useState, useRef, useEffect } from 'react'

export default function WalletTabMenu({ tabs, activeTab, onChange }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const current = tabs.find((t) => t.id === activeTab) || tabs[0]

  useEffect(() => {
    if (!open) return undefined
    const onDocPointer = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (id) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className="wallet-tab-menu">
      <button
        ref={triggerRef}
        type="button"
        className="wallet-tab-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Wallet sections menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="wallet-tab-menu-current">{current?.label}</span>
        <span className="wallet-tab-menu-kebab" aria-hidden="true">⋮</span>
      </button>

      {open && (
        <ul className="wallet-tab-menu-list" role="menu" ref={menuRef}>
          {tabs.map((t) => (
            <li key={t.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={t.id === activeTab}
                className={`wallet-tab-menu-item ${t.id === activeTab ? 'active' : ''}`}
                onClick={() => select(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
