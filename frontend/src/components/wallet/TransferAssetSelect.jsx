import { useCallback, useEffect, useRef, useState } from 'react'
import SensitiveValue from '../common/SensitiveValue'

/**
 * Asset picker for the Transfer form — a dropdown of every transferable asset in the connected account's
 * cross-network portfolio (spec: "the assets should be a dropdown of all assets from the portfolio").
 * Each row shows the symbol, its network, and the held balance; a ⚡ marks assets whose network is
 * configured for gasless sends. Purely presentational: eligibility + gasless truth are decided by the
 * caller (useTransfer) and passed in, so this component never re-derives routing.
 */
export default function TransferAssetSelect({
  options = [],
  value,
  onChange,
  isGasless = () => false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const selected = options.find((o) => o.key === value) || options[0] || null

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
    (option) => {
      onChange?.(option)
      setOpen(false)
    },
    [onChange],
  )

  const renderBalance = (option) =>
    option?.balance == null ? '…' : <SensitiveValue>{option.balance}</SensitiveValue>

  return (
    <div className="pt-select" ref={wrapRef}>
      <button
        type="button"
        className="pt-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Asset to send"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span className="pt-select-current">
            <span className="pt-select-sym">{selected.symbol}</span>
            <span className="pt-select-sub">
              {selected.networkName} · Balance: {renderBalance(selected)}
            </span>
          </span>
        ) : (
          <span className="pt-select-sub">No transferable assets</span>
        )}
        <span className="pt-select-chevron" aria-hidden="true">▾</span>
      </button>

      {open && options.length > 0 && (
        <ul className="pt-select-list" role="listbox" aria-label="Assets">
          {options.map((option) => (
            <li key={option.key} className="pt-select-li">
              <button
                type="button"
                role="option"
                aria-selected={option.key === selected?.key}
                className={`pt-select-option ${option.key === selected?.key ? 'active' : ''}`}
                onClick={() => handleSelect(option)}
              >
                <span className="pt-select-sym">{option.symbol}</span>
                <span className="pt-select-option-meta">
                  <span className="pt-select-network">{option.networkName}</span>
                  {isGasless(option) && (
                    <span className="pt-select-gasless" title="Gasless on this network">⚡</span>
                  )}
                </span>
                <span className="pt-select-bal">Balance: {renderBalance(option)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
