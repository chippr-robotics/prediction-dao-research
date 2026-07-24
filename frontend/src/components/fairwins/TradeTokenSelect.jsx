import { useCallback, useEffect, useRef, useState } from 'react'
import AssetLogo from '../wallet/AssetLogo'
import './TradeTokenSelect.css'

/**
 * TradeTokenSelect — the Trade ticket's pair-leg token picker. A thin,
 * trade-panel-flavored sibling of UniversalAssetSelect: same AssetLogo
 * artwork and listbox interaction pattern, sized to sit inline as a pill
 * next to the amount input (FR: consistent asset iconography app-wide).
 *
 * Every option trades on the same active chain as the ticket, so `chainId`
 * is a single prop rather than per-option.
 */
export default function TradeTokenSelect({ assets = [], value, onChange, chainId, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const selected = assets.find((t) => t.address === value) || null

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

  const handleSelect = useCallback(
    (token) => {
      onChange?.(token.address)
      setOpen(false)
    },
    [onChange],
  )

  return (
    <div className="trade-token-picker" ref={wrapRef}>
      <button
        type="button"
        className="trade-token-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={assets.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <>
            <AssetLogo symbol={selected.symbol} chainId={chainId} showBadge size={20} />
            <span className="trade-token-select-sym">{selected.symbol}</span>
          </>
        ) : (
          <span className="trade-token-select-sym">Select</span>
        )}
        <span className="trade-token-select-chevron" aria-hidden="true">▾</span>
      </button>

      {open && assets.length > 0 && (
        <ul className="trade-token-list" role="listbox" aria-label={ariaLabel}>
          {assets.map((token) => (
            <li key={token.address} className="trade-token-li">
              <button
                type="button"
                role="option"
                aria-selected={token.address === value}
                className={`trade-token-option ${token.address === value ? 'active' : ''}`}
                onClick={() => handleSelect(token)}
              >
                <AssetLogo symbol={token.symbol} chainId={chainId} showBadge size={24} />
                <span className="trade-token-option-sym">{token.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
