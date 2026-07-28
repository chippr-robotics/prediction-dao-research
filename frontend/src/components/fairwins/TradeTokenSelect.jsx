import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import AssetLogo from '../wallet/AssetLogo'
import { matchesAssetQuery } from '../../lib/assets/assetSearch'
import './TradeTokenSelect.css'

/**
 * TradeTokenSelect — the Trade ticket's pair-leg picker, now MULTI-NETWORK.
 *
 * A thin, trade-panel-flavored sibling of UniversalAssetSelect: same AssetLogo
 * artwork (glyph + network sub-badge) and listbox interaction, sized to sit inline
 * as a pill next to the amount input. It stays a separate component because the
 * ticket needs a compact pill, not UniversalAssetSelect's wide balance-bearing
 * trigger — but the two now share the search rule (`lib/assets/assetSearch.js`)
 * so both narrow on exactly the fields a member can see.
 *
 * Options span every swap-capable network, so:
 *   - each option names its NETWORK, and the accessible name is
 *     "SYMBOL on Network" — with WETH on four chains in one list, the symbol
 *     alone is ambiguous to a screen reader and to a sighted member alike;
 *   - options are grouped under a network heading whenever more than one network
 *     is present (a single-network list is unchanged);
 *   - a search field narrows by symbol, asset name, or network name — the whole
 *     point of listing ~40 legs instead of ~8.
 *
 * Purely presentational: eligibility is the CALLER's (TradePanel pins the
 * counterpart's network via `lib/assets/networkPin.js#samePair`). This component
 * renders what it is handed and never derives which pairs are possible.
 */
export default function TradeTokenSelect({
  options = [],
  value,
  onChange,
  ariaLabel,
  emptyLabel = 'Select',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const baseId = useId()
  const listId = `${baseId}-list`

  const selected = useMemo(() => options.find((o) => o.key === value) || null, [options, value])
  const visible = useMemo(
    () => options.filter((o) => matchesAssetQuery(o, query)),
    [options, query],
  )
  // Group headings only earn their space once the list actually spans networks.
  const multiNetwork = useMemo(
    () => new Set(options.map((o) => o.chainId)).size > 1,
    [options],
  )

  // Every close resets the query so reopening starts from the full list rather
  // than whatever the member last typed.
  const closeList = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) closeList()
    }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      closeList()
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, closeList])

  const handleSelect = useCallback(
    (option) => {
      onChange?.(option)
      closeList()
    },
    [onChange, closeList],
  )

  const focusOptionAt = useCallback((index) => {
    const items = Array.from(listRef.current?.querySelectorAll('[role="option"]') || [])
    if (!items.length) return
    items[Math.max(0, Math.min(index, items.length - 1))].focus()
  }, [])

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusOptionAt(0)
    } else if (e.key === 'Enter') {
      // Never let a stray Enter submit a surrounding form — commit the top match.
      e.preventDefault()
      if (visible.length > 0) handleSelect(visible[0])
    }
  }

  const handleListKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(listRef.current?.querySelectorAll('[role="option"]') || [])
    const at = items.indexOf(document.activeElement)
    if (e.key === 'ArrowUp' && at <= 0) {
      wrapRef.current?.querySelector('.trade-token-search')?.focus()
      return
    }
    focusOptionAt(at < 0 ? 0 : at + (e.key === 'ArrowDown' ? 1 : -1))
  }

  // Rendered in caller order (connected network first), with a heading emitted
  // each time the network changes — the ordering carries the grouping, so no
  // second pass can disagree with the list the caller built.
  const renderOption = (option, index) => {
    const previous = visible[index - 1]
    const startsNetwork = multiNetwork && (!previous || previous.chainId !== option.chainId)
    return (
      <Fragment key={option.key}>
        {startsNetwork && (
          <li className="trade-token-group" role="presentation">
            {option.networkName}
            {option.isTestnet && <span className="trade-token-testnet"> testnet</span>}
          </li>
        )}
        <li className="trade-token-li" role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={option.key === value}
            aria-label={`${option.symbol} on ${option.networkName}`}
            className={`trade-token-option ${option.key === value ? 'active' : ''}`}
            onClick={() => handleSelect(option)}
          >
            <AssetLogo symbol={option.symbol} chainId={option.chainId} showBadge size={24} />
            <span className="trade-token-option-body">
              <span className="trade-token-option-sym">{option.symbol}</span>
              <span className="trade-token-option-net">{option.networkName}</span>
            </span>
          </button>
        </li>
      </Fragment>
    )
  }

  return (
    <div className="trade-token-picker" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="trade-token-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={options.length === 0}
        onClick={() => (open ? closeList() : setOpen(true))}
      >
        {selected ? (
          <>
            <AssetLogo symbol={selected.symbol} chainId={selected.chainId} showBadge size={20} />
            <span className="trade-token-select-sym">{selected.symbol}</span>
          </>
        ) : (
          <span className="trade-token-select-sym">{emptyLabel}</span>
        )}
        <span className="trade-token-select-chevron" aria-hidden="true">▾</span>
      </button>

      {open && options.length > 0 && (
        <div className="trade-token-popover">
          <input
            type="search"
            className="trade-token-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search token or network"
            aria-label="Search tokens"
            aria-controls={visible.length > 0 ? listId : undefined}
            autoFocus
          />
          {/* Announces the narrowing to a screen reader, which can't see it. */}
          <p className="sr-only" role="status">
            {`${visible.length} of ${options.length} tokens shown`}
          </p>

          {visible.length > 0 ? (
            <ul
              className="trade-token-list"
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              ref={listRef}
              onKeyDown={handleListKeyDown}
            >
              {visible.map(renderOption)}
            </ul>
          ) : (
            <p className="trade-token-no-match" role="note">
              No token matches “{query.trim()}”. Try a symbol, a token name, or a network name.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
