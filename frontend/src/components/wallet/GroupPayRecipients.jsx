import { useCallback, useEffect, useRef } from 'react'
import { isAddress } from 'ethers'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import { MAX_GROUP_RECIPIENTS, makeRecipient } from '../../lib/payments/groupPay'
import './GroupPay.css'

/**
 * GroupPayRecipients (release 1.14.0) — rows 2..N of a group payment, shared by Home ▸ Pay and
 * Transfer ▸ Send.
 *
 * The list is deliberately ADDITIVE: row 1 stays the form's own To/amount fields, untouched, and
 * this component only exists once a member presses "Add another recipient". A member sending to
 * one person therefore sees, and signs, exactly what they did before — one new button is the
 * entire difference.
 *
 * Address entry is the platform's ordinary `AddressInput`, so every row keeps the spec-054
 * resolution priority (address book > callsign > ENS > raw) and the address book picker. A row
 * carries BOTH what was typed (`raw`, so an ENS name stays visible) and what it resolved to
 * (`address`, which is what gets paid) — never one standing in for the other.
 */
export default function GroupPayRecipients({
  recipients = [],
  onChange,
  issuesFor = () => [],
  chainId,
  symbol = '',
  disabled = false,
  idPrefix = 'gp',
  startIndex = 2,
}) {
  // The cap counts the form's own recipient too — "up to N recipients" means N payments.
  const atCap = recipients.length + 1 >= MAX_GROUP_RECIPIENTS

  // AddressInput reports a change and its RESOLUTION as two separate callbacks, and both can fire
  // before React re-renders — so an update built from the `recipients` prop would silently discard
  // the first of the pair (which is how a pasted Bitcoin address arrived here as an empty row).
  // `latest` is re-seeded from props on every render and carries edits within a single tick.
  const latest = useRef(recipients)
  // Re-seeded after every commit, which is exactly what makes the in-tick composition safe: two
  // handler calls happen before React re-renders, so they build on each other here; once the
  // parent has applied them this effect resyncs from props.
  useEffect(() => { latest.current = recipients }, [recipients])

  const commit = useCallback((next) => {
    latest.current = next
    onChange(next)
  }, [onChange])

  const patch = useCallback((id, changes) => {
    commit(latest.current.map((r) => (r.id === id ? { ...r, ...changes } : r)))
  }, [commit])

  const add = useCallback(() => commit([...latest.current, makeRecipient()]), [commit])
  const remove = useCallback((id) => commit(latest.current.filter((r) => r.id !== id)), [commit])

  return (
    <div className="gp-list">
      {recipients.map((r, i) => {
        const n = i + startIndex
        const addrId = `${idPrefix}-gp-addr-${r.id}`
        const amtId = `${idPrefix}-gp-amt-${r.id}`
        const issues = issuesFor(r.id) || []
        return (
          <div className="gp-row" data-testid="group-pay-row" key={r.id}>
            <div className="gp-row-fields">
              <div className="gp-row-address">
                <label className="sr-only" htmlFor={addrId}>{`Recipient ${n} address`}</label>
                <AddressInput
                  id={addrId}
                  value={r.raw}
                  onChange={(e) => {
                    const v = e.target.value
                    // A typed 0x address is its own resolution; anything else waits for
                    // onResolvedChange (address book / callsign / ENS) before it is payable.
                    patch(r.id, { raw: v, address: isAddress(v.trim()) ? v.trim() : '' })
                  }}
                  onResolvedChange={(addr) =>
                    patch(r.id, { address: addr || (isAddress(String(r.raw).trim()) ? String(r.raw).trim() : '') })
                  }
                  chainId={chainId}
                  placeholder="0x…, %callsign, or ENS name"
                  disabled={disabled}
                />
              </div>
              <AddressBookButton
                disabled={disabled}
                onSelect={(entry) => patch(r.id, { raw: entry.address, address: entry.address })}
              />
              <label className="sr-only" htmlFor={amtId}>{`Recipient ${n} amount`}</label>
              <input
                id={amtId}
                className="gp-amount-input"
                inputMode="decimal"
                type="text"
                value={r.amount}
                placeholder="0.00"
                disabled={disabled}
                onChange={(e) => patch(r.id, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
              />
              <span className="gp-amount-sym" aria-hidden="true">{symbol}</span>
              <button
                type="button"
                className="gp-remove"
                aria-label={`Remove recipient ${n}`}
                disabled={disabled}
                onClick={() => remove(r.id)}
              >
                ×
              </button>
            </div>
            {issues.map((issue) => (
              <div
                key={issue.code}
                className={issue.blocking ? 'gp-row-error' : 'gp-row-note'}
                {...(issue.blocking ? { role: 'alert' } : {})}
              >
                {issue.message}
              </div>
            ))}
          </div>
        )
      })}

      <button
        type="button"
        className="gp-add"
        data-testid="group-pay-add"
        onClick={add}
        disabled={disabled || atCap}
      >
        + Add another recipient
      </button>
      {atCap && (
        <span className="gp-cap" data-testid="group-pay-cap">
          {`Up to ${MAX_GROUP_RECIPIENTS} recipients in one payment.`}
        </span>
      )}
    </div>
  )
}
