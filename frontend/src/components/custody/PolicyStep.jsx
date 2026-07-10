// Spec 049 (US1) — optional policy step for the vault creation wizard. Skippable by default
// (FR-010: "No policy" keeps the creation flow byte-identical to spec 043); when enabled it
// collects the four v1 rule types (per-transaction limit, 24-hour-window limit, recipient
// allowlist, transaction delay), validates at entry (FR-015), and shows a plain-language live
// summary — including the window-semantics disclosure — before anything is deployed (US1-AS1).
//
// Controlled contract: `onChange(configOrNull)`:
//   - null                      → step skipped or unsupported network (no policy)
//   - { invalid:true, error }   → rules enabled but not yet valid (parent must block create)
//   - config                    → validated `configureRules` config (extra `summary` strings are
//                                 ignored by encodeConfigureRules and reused by the review step)

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseUnits } from 'ethers'
import {
  NATIVE_ASSET,
  formatDuration,
  isPolicySupported,
  validatePolicyConfig,
} from '../../lib/custody/policy'
import { summarizePolicyConfig } from '../../lib/custody/policySummary'
import { getContractAddressForChain } from '../../config/contracts'
import { getNetwork } from '../../config/networks'

const COOLDOWN_CHOICES = [
  { value: 'none', label: 'None' },
  { value: '3600', label: '1 hour' },
  { value: '21600', label: '6 hours' },
  { value: '86400', label: '24 hours' },
  { value: '259200', label: '72 hours' },
  { value: 'custom', label: 'Custom…' },
]

const NATIVE_DECIMALS = 18
const THIRTY_DAYS = 30 * 24 * 3600

function parseAmount(fieldLabel, raw, decimals) {
  const value = (raw || '').trim()
  if (!value) return 0n
  let parsed
  try {
    parsed = parseUnits(value, decimals)
  } catch {
    throw new Error(`Enter a valid amount for "${fieldLabel}" (got "${raw}")`)
  }
  if (parsed < 0n) throw new Error(`"${fieldLabel}" must be positive`)
  return parsed
}

export default function PolicyStep({ chainId, value, onChange }) {
  const supported = isPolicySupported(chainId)
  const network = getNetwork(chainId)
  const nativeSymbol = network?.nativeCurrency?.symbol || 'native coin'
  const stableAddress = getContractAddressForChain('paymentToken', chainId) || null
  const stableSymbol = network?.stablecoin?.symbol || 'stable token'
  const stableDecimals = network?.stablecoin?.decimals ?? 6

  const [enabled, setEnabled] = useState(Boolean(value))
  const [nativePerTx, setNativePerTx] = useState('')
  const [nativeWindow, setNativeWindow] = useState('')
  const [stablePerTx, setStablePerTx] = useState('')
  const [stableWindow, setStableWindow] = useState('')
  const [allowlistOn, setAllowlistOn] = useState(false)
  const [recipients, setRecipients] = useState([''])
  const [cooldownChoice, setCooldownChoice] = useState('none')
  const [customCooldown, setCustomCooldown] = useState('')

  const assetMeta = useMemo(() => {
    const meta = { [NATIVE_ASSET]: { symbol: nativeSymbol, decimals: NATIVE_DECIMALS } }
    if (stableAddress) meta[stableAddress] = { symbol: stableSymbol, decimals: stableDecimals }
    return meta
  }, [nativeSymbol, stableAddress, stableSymbol, stableDecimals])

  const cooldownSeconds = useMemo(() => {
    if (cooldownChoice === 'none') return 0
    if (cooldownChoice === 'custom') return Number(customCooldown || 0)
    return Number(cooldownChoice)
  }, [cooldownChoice, customCooldown])

  // Derive + validate the config from the current inputs (FR-015: validate at entry).
  const derived = useMemo(() => {
    if (!supported || !enabled) return { config: null, error: null }
    try {
      const limits = []
      const nativeLimits = {
        perTxLimit: parseAmount(`Per-transaction limit (${nativeSymbol})`, nativePerTx, NATIVE_DECIMALS),
        windowLimit: parseAmount(`24-hour limit (${nativeSymbol})`, nativeWindow, NATIVE_DECIMALS),
      }
      if (nativeLimits.perTxLimit > 0n || nativeLimits.windowLimit > 0n) {
        limits.push({ asset: NATIVE_ASSET, ...nativeLimits })
      }
      if (stableAddress) {
        const stableLimits = {
          perTxLimit: parseAmount(`Per-transaction limit (${stableSymbol})`, stablePerTx, stableDecimals),
          windowLimit: parseAmount(`24-hour limit (${stableSymbol})`, stableWindow, stableDecimals),
        }
        if (stableLimits.perTxLimit > 0n || stableLimits.windowLimit > 0n) {
          limits.push({ asset: stableAddress, ...stableLimits })
        }
      }
      if (cooldownChoice === 'custom') {
        const n = Number(customCooldown)
        if (!customCooldown.trim() || !Number.isInteger(n) || n < 0) {
          throw new Error('Enter the custom delay as a whole number of seconds')
        }
      }
      const allowlistAdd = recipients.map((r) => r.trim()).filter(Boolean)
      const config = {
        limits,
        cooldown: cooldownSeconds,
        allowlistEnabled: allowlistOn,
        allowlistAdd: allowlistOn ? allowlistAdd : [],
        allowlistRemove: [],
      }
      validatePolicyConfig(config)
      if (limits.length === 0 && cooldownSeconds === 0 && !allowlistOn) {
        throw new Error('Configure at least one rule, or choose "No policy (skip)"')
      }
      return { config, error: null }
    } catch (e) {
      return { config: null, error: e.message }
    }
  }, [
    supported,
    enabled,
    nativePerTx,
    nativeWindow,
    stablePerTx,
    stableWindow,
    allowlistOn,
    recipients,
    cooldownChoice,
    customCooldown,
    cooldownSeconds,
    nativeSymbol,
    stableAddress,
    stableSymbol,
    stableDecimals,
  ])

  const summary = useMemo(() => summarizePolicyConfig(derived.config, assetMeta), [derived.config, assetMeta])

  // Non-blocking strictness warning (FR-015): warn, but do not stop, an unusually long delay.
  const strictWarning =
    enabled && supported && cooldownSeconds > THIRTY_DAYS
      ? `A ${formatDuration(cooldownSeconds)} delay between transactions is unusually strict — the vault will allow at most one outgoing transaction per ${formatDuration(cooldownSeconds)}.`
      : null

  // Push the derived value to the parent whenever it changes (skip identical re-emissions).
  const lastEmitted = useRef('unset')
  useEffect(() => {
    let next = null
    if (supported && enabled) {
      next = derived.error ? { invalid: true, error: derived.error } : { ...derived.config, summary }
    }
    const key = JSON.stringify(next, (_, v) => (typeof v === 'bigint' ? `${v}n` : v))
    if (key === lastEmitted.current) return
    lastEmitted.current = key
    onChange?.(next)
  }, [supported, enabled, derived, summary, onChange])

  const updateRecipient = (i, val) => setRecipients((prev) => prev.map((r, idx) => (idx === i ? val : r)))
  const addRecipient = () => setRecipients((prev) => [...prev, ''])
  const removeRecipient = (i) => setRecipients((prev) => prev.filter((_, idx) => idx !== i))

  if (!supported) {
    return (
      <section className="custody-policy" aria-label="Vault policy">
        <h4 className="custody-policy-title">Policy</h4>
        <p role="status">Policy rules aren&apos;t available on this network yet.</p>
        <p className="custody-hint">The vault will be created without spending rules; you can use it exactly as before.</p>
      </section>
    )
  }

  return (
    <section className="custody-policy" aria-label="Vault policy">
      <fieldset>
        <legend>Policy (optional)</legend>
        <p className="custody-hint">
          Rules are enforced on-chain from the vault&apos;s first transaction. You can skip this step for an
          unrestricted vault.
        </p>
        <label>
          <input
            type="radio"
            name="policy-mode"
            checked={!enabled}
            onChange={() => setEnabled(false)}
          />
          No policy (skip)
        </label>
        <label>
          <input
            type="radio"
            name="policy-mode"
            checked={enabled}
            onChange={() => setEnabled(true)}
          />
          Set spending rules
        </label>
      </fieldset>

      {enabled && (
        <>
          <fieldset>
            <legend>Spending limits ({nativeSymbol})</legend>
            <div className="custody-field">
              <label htmlFor="policy-native-pertx">Per-transaction limit ({nativeSymbol})</label>
              <input
                id="policy-native-pertx"
                type="text"
                inputMode="decimal"
                placeholder="No limit"
                value={nativePerTx}
                onChange={(e) => setNativePerTx(e.target.value)}
              />
            </div>
            <div className="custody-field">
              <label htmlFor="policy-native-window">24-hour limit ({nativeSymbol})</label>
              <input
                id="policy-native-window"
                type="text"
                inputMode="decimal"
                placeholder="No limit"
                value={nativeWindow}
                onChange={(e) => setNativeWindow(e.target.value)}
              />
            </div>
          </fieldset>

          {stableAddress && (
            <fieldset>
              <legend>Spending limits ({stableSymbol})</legend>
              <div className="custody-field">
                <label htmlFor="policy-stable-pertx">Per-transaction limit ({stableSymbol})</label>
                <input
                  id="policy-stable-pertx"
                  type="text"
                  inputMode="decimal"
                  placeholder="No limit"
                  value={stablePerTx}
                  onChange={(e) => setStablePerTx(e.target.value)}
                />
              </div>
              <div className="custody-field">
                <label htmlFor="policy-stable-window">24-hour limit ({stableSymbol})</label>
                <input
                  id="policy-stable-window"
                  type="text"
                  inputMode="decimal"
                  placeholder="No limit"
                  value={stableWindow}
                  onChange={(e) => setStableWindow(e.target.value)}
                />
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend>Recipient allowlist</legend>
            <label>
              <input
                type="checkbox"
                checked={allowlistOn}
                onChange={(e) => setAllowlistOn(e.target.checked)}
              />
              Only allow transfers to approved recipients
            </label>
            {allowlistOn && (
              <>
                {recipients.map((recipient, i) => (
                  <div className="custody-owner-row" key={i}>
                    <label className="sr-only" htmlFor={`policy-recipient-${i}`}>{`Allowed recipient ${i + 1}`}</label>
                    <input
                      id={`policy-recipient-${i}`}
                      type="text"
                      inputMode="text"
                      placeholder="0x…"
                      value={recipient}
                      onChange={(e) => updateRecipient(i, e.target.value)}
                    />
                    {recipients.length > 1 && (
                      <button type="button" onClick={() => removeRecipient(i)} aria-label={`Remove recipient ${i + 1}`}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addRecipient}>
                  Add recipient
                </button>
              </>
            )}
          </fieldset>

          <div className="custody-field">
            <label htmlFor="policy-cooldown">Delay between outgoing transactions</label>
            <select id="policy-cooldown" value={cooldownChoice} onChange={(e) => setCooldownChoice(e.target.value)}>
              {COOLDOWN_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {cooldownChoice === 'custom' && (
            <div className="custody-field">
              <label htmlFor="policy-cooldown-custom">Custom delay (seconds)</label>
              <input
                id="policy-cooldown-custom"
                type="number"
                min={0}
                value={customCooldown}
                onChange={(e) => setCustomCooldown(e.target.value)}
              />
            </div>
          )}

          {derived.error && (
            <p className="custody-error" role="alert">
              {derived.error}
            </p>
          )}
          {strictWarning && <p className="custody-warning">{strictWarning}</p>}

          {summary.length > 0 && (
            <div className="custody-policy-summary" role="status">
              <h5 className="custody-policy-summary-title">These rules will be active from the first transaction</h5>
              <ul>
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
