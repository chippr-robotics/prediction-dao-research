import { useCallback, useEffect, useRef, useState } from 'react'
import AssetLogo from '../wallet/AssetLogo'
import SensitiveValue from '../common/SensitiveValue'
import './UniversalAssetSelect.css'

/**
 * UniversalAssetSelect (spec 064) — one reusable asset dropdown for the home
 * Pay/Request/Wager surfaces AND the wallet Transfer ("trade") view. Each option
 * carries the Earn-page NESTED asset logo (the asset glyph + its network sub-badge,
 * via the shared AssetLogo artwork) so a member can tell at a glance WHAT the asset
 * is and WHICH chain it lives on — the core of this feature (FR-003).
 *
 * Purely presentational (FR-001): it renders whatever activity-scoped `options` the
 * caller passes (built by useSelectableAssets) and never derives eligibility, the
 * asset list, or routing. Gasless truth is passed in via `isGasless` so this
 * component never re-derives it (FR-005).
 *
 * Accessible (FR-015): listbox/option roles, keyboard operable, and the decorative
 * logo is aria-hidden — the symbol + network text always carry the meaning.
 */

/** AssetLogo only badges numeric EVM chains; a Bitcoin option (string id) renders its glyph alone. */
const evmBadgeChainId = (chainId) => (typeof chainId === 'number' ? chainId : null)

export default function UniversalAssetSelect({
  options = [],
  value,
  onChange,
  isGasless = () => false,
  disabled = false,
  label = 'Asset',
  size = 28,
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
    option?.balance == null ? (
      <span className="uas-pending" aria-label="balance loading">…</span>
    ) : (
      <SensitiveValue>{option.balance}</SensitiveValue>
    )

  return (
    <div className="uas-select" ref={wrapRef}>
      <button
        type="button"
        className="uas-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span className="uas-current">
            <AssetLogo
              symbol={selected.symbol}
              chainId={evmBadgeChainId(selected.chainId)}
              showBadge
              size={size}
            />
            <span className="uas-current-text">
              <span className="uas-sym">{selected.symbol}</span>
              <span className="uas-sub">
                {selected.networkName} · Balance: {renderBalance(selected)}
              </span>
            </span>
          </span>
        ) : (
          <span className="uas-sub">No assets available</span>
        )}
        <span className="uas-chevron" aria-hidden="true">▾</span>
      </button>

      {open && options.length > 0 && (
        <ul className="uas-list" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.key} className="uas-li">
              <button
                type="button"
                role="option"
                aria-selected={option.key === selected?.key}
                className={`uas-option ${option.key === selected?.key ? 'active' : ''}`}
                onClick={() => handleSelect(option)}
              >
                <AssetLogo
                  symbol={option.symbol}
                  chainId={evmBadgeChainId(option.chainId)}
                  showBadge
                  size={size}
                />
                <span className="uas-option-body">
                  <span className="uas-option-top">
                    <span className="uas-sym">{option.symbol}</span>
                    {isGasless(option) && (
                      <span className="uas-gasless" title="Gasless on this network" aria-label="gasless">⚡</span>
                    )}
                  </span>
                  <span className="uas-option-sub">
                    <span className="uas-network">{option.networkName}</span>
                    <span className="uas-bal">Balance: {renderBalance(option)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
