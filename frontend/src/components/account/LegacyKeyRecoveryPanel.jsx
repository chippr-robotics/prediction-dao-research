/**
 * Legacy key & word-list recovery (Recovery section).
 *
 * Members who arrive with an *old* secret — a raw EOA private key or a BIP-39
 * word list — use this to bring that account under FairWins. The flow is a
 * guided series of informational bottom sheets (shared ActionSheet, mirroring
 * RecoverAccountPanel) because handling a raw secret is high-stakes:
 *
 *   intro → enter the key/word list → set a passphrase (encrypt at rest) →
 *   move the funds to a smart account → done.
 *
 * The secret is encrypted on-device with a passphrase-derived key
 * (lib/recovery/legacyKeys.js) and never leaves the browser. The headline
 * outcome is sweeping the funds onto a passkey smart account — a legacy EOA is
 * treated as something to move off of, not a place to keep money.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import { getNetwork } from '../../config/networks'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import ActionSheet from './ActionSheet'
import {
  classifySecret,
  encryptLegacySecret,
  decryptLegacySecret,
  legacyKeyVault,
  quoteNativeSweep,
  sweepNativeToSmartAccount,
} from '../../lib/recovery/legacyKeys'
import './LegacyKeyRecoveryPanel.css'

const shortAddr = (a) => (a ? `${a.substring(0, 6)}…${a.substring(a.length - 4)}` : '')
const KIND_LABEL = { privateKey: 'private key', mnemonic: 'word list' }

const STEP_TITLES = {
  intro: 'Recover a legacy account',
  enter: 'Enter your key or word list',
  secure: 'Secure this key on your device',
  transfer: 'Move your funds to a smart account',
  unlock: 'Unlock this key',
  done: 'Recovery complete',
}

function LegacyKeyRecoveryPanel({ deps = {} }) {
  const { address: sessionAddress, provider, loginMethod, chainId, isConnected } = useWallet()
  const vault = useMemo(() => (deps.vault ?? legacyKeyVault)(), [deps.vault])

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('intro')
  const [phase, setPhase] = useState('idle') // idle | encrypting | quoting | sweeping
  const [notice, setNotice] = useState(null)
  const [stored, setStored] = useState(() => vault.list())

  // Import working state.
  const [rawSecret, setRawSecret] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [passphrase2, setPassphrase2] = useState('')
  // The classified secret currently in memory (from import OR after unlock).
  const [active, setActive] = useState(null) // { kind, address, secret }

  // Transfer working state.
  const [destInput, setDestInput] = useState('')
  const [destResolved, setDestResolved] = useState('')
  const [quote, setQuote] = useState(null)
  const [txHash, setTxHash] = useState(null)

  const network = useMemo(() => getNetwork(chainId), [chainId])
  const networkName = network?.name || 'this network'
  const nativeSymbol = network?.nativeCurrency?.symbol || 'the native token'

  const detected = useMemo(() => classifySecret(rawSecret), [rawSecret])
  const alreadyStored = detected.address ? vault.has(detected.address) : false

  const destTarget = useMemo(() => {
    const r = (destResolved || '').trim()
    if (ethers.isAddress(r)) return r
    const i = destInput.trim()
    return ethers.isAddress(i) ? i : ''
  }, [destResolved, destInput])

  const refreshStored = useCallback(() => setStored(vault.list()), [vault])

  const resetWizard = useCallback(() => {
    setStep('intro')
    setPhase('idle')
    setNotice(null)
    setRawSecret('')
    setPassphrase('')
    setPassphrase2('')
    setActive(null)
    setQuote(null)
    setTxHash(null)
    // Default the destination to the current session account when it is a
    // passkey smart account — that is exactly where we want the funds to land.
    const suggest = loginMethod === 'passkey' && sessionAddress ? sessionAddress : ''
    setDestInput(suggest)
    setDestResolved(suggest)
  }, [loginMethod, sessionAddress])

  const openWizard = useCallback(() => {
    resetWizard()
    setOpen(true)
  }, [resetWizard])

  const closeWizard = useCallback(() => {
    if (phase === 'encrypting' || phase === 'sweeping') return // never yank mid-write
    setOpen(false)
  }, [phase])

  // Clear any secret material from memory when the sheet fully closes.
  useEffect(() => {
    if (!open) {
      setRawSecret('')
      setPassphrase('')
      setPassphrase2('')
      setActive(null)
    }
  }, [open])

  // Step 1→2 handoff: capture the classified secret so later steps don't
  // re-parse the textarea.
  const goSecure = useCallback(() => {
    const c = classifySecret(rawSecret)
    if (c.kind !== 'privateKey' && c.kind !== 'mnemonic') {
      setNotice({ kind: 'error', text: "That doesn't look like a private key or a valid word list. Check for typos or missing words." })
      return
    }
    setActive({ kind: c.kind, address: c.address, secret: c.secret })
    setNotice(null)
    setStep('secure')
  }, [rawSecret])

  const storeAndContinue = useCallback(async () => {
    if (!active) return
    if (passphrase !== passphrase2) {
      setNotice({ kind: 'error', text: 'The two passphrases do not match.' })
      return
    }
    setNotice(null)
    setPhase('encrypting')
    try {
      const entry = await encryptLegacySecret({
        secret: active.secret,
        kind: active.kind,
        address: active.address,
        passphrase,
        deps,
      })
      vault.set(entry)
      refreshStored()
      setPassphrase('')
      setPassphrase2('')
      setPhase('idle')
      setStep('transfer')
    } catch (e) {
      setPhase('idle')
      setNotice({ kind: 'error', text: e.message })
    }
  }, [active, passphrase, passphrase2, deps, vault, refreshStored])

  const checkBalance = useCallback(async () => {
    if (!active) return
    setNotice(null)
    setPhase('quoting')
    try {
      const q = await quoteNativeSweep({ kind: active.kind, secret: active.secret, provider: deps.provider ?? provider })
      setQuote(q)
      setPhase('idle')
    } catch (e) {
      setPhase('idle')
      setNotice({ kind: 'error', text: `Could not read the balance on ${networkName}: ${e.reason || e.shortMessage || e.message}` })
    }
  }, [active, provider, deps.provider, networkName])

  const doSweep = useCallback(async () => {
    if (!active || !destTarget) return
    setNotice(null)
    setPhase('sweeping')
    try {
      const tx = await sweepNativeToSmartAccount({
        kind: active.kind,
        secret: active.secret,
        to: destTarget,
        provider: deps.provider ?? provider,
      })
      const receipt = await tx.wait()
      if (receipt?.status === 0) throw new Error('the transfer reverted on-chain')
      setTxHash(tx.hash)
      setPhase('idle')
      setStep('done')
    } catch (e) {
      setPhase('idle')
      setNotice({ kind: 'error', text: `The transfer did not go through: ${e.reason || e.shortMessage || e.message}` })
    }
  }, [active, destTarget, provider, deps.provider])

  // Stored-entry actions.
  const [unlockEntry, setUnlockEntry] = useState(null)
  const [unlockPass, setUnlockPass] = useState('')

  const startTransferStored = useCallback((entry) => {
    resetWizard()
    setUnlockEntry(entry)
    setUnlockPass('')
    setStep('unlock')
    setOpen(true)
  }, [resetWizard])

  const doUnlock = useCallback(async () => {
    if (!unlockEntry) return
    setNotice(null)
    setPhase('encrypting')
    try {
      const secret = await decryptLegacySecret({ entry: unlockEntry, passphrase: unlockPass, deps })
      setActive({ kind: unlockEntry.kind, address: unlockEntry.address, secret })
      setUnlockPass('')
      setPhase('idle')
      setStep('transfer')
    } catch (e) {
      setPhase('idle')
      setNotice({ kind: 'error', text: e.message })
    }
  }, [unlockEntry, unlockPass, deps])

  const removeStored = useCallback((address) => {
    vault.delete(address)
    refreshStored()
  }, [vault, refreshStored])

  if (!isConnected) return null

  const busy = phase === 'encrypting' || phase === 'sweeping'
  const noticeEl = notice && (
    <p role="alert" className={`lkr-notice lkr-notice--${notice.kind}`}>{notice.text}</p>
  )

  return (
    <section className="legacy-recovery section" aria-label="Recover a legacy key or word list">
      <h3>Legacy key & word-list recovery</h3>
      <p className="section-description">
        Moving from an older wallet? Bring in a legacy <strong>private key</strong> or <strong>word list</strong>{' '}
        (recovery phrase). FairWins stores it encrypted on this device and helps you move the funds to a modern
        smart account — the safer place to keep them.
      </p>
      <button type="button" className="btn btn-primary legacy-recovery__start" onClick={openWizard}>
        Recover a legacy key
      </button>

      {stored.length > 0 && (
        <ul className="lkr-stored" aria-label="Recovered legacy keys stored on this device">
          {stored.map((e) => (
            <li key={e.address} className="lkr-stored__item">
              <div className="lkr-stored__meta">
                <code className="lkr-stored__addr" title={e.address}>{shortAddr(e.address)}</code>
                <span className="lkr-stored__sub">
                  {KIND_LABEL[e.kind] || 'key'}
                  {e.importedAt ? ` · saved ${new Date(e.importedAt).toLocaleDateString()}` : ''}
                </span>
              </div>
              <div className="lkr-stored__actions">
                <button type="button" className="btn btn-small" onClick={() => startTransferStored(e)}>
                  Move funds
                </button>
                <button
                  type="button"
                  className="btn btn-small lkr-stored__remove"
                  onClick={() => removeStored(e.address)}
                  aria-label={`Remove stored key ${shortAddr(e.address)}`}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ActionSheet open={open} onClose={closeWizard} title={STEP_TITLES[step]} closeDisabled={busy}>
        {/* Step 1 — what this does + the honest warning. */}
        {step === 'intro' && (
          <div className="recover-step">
            <p>
              Recover an account from a legacy <strong>private key</strong> or <strong>word list</strong>. This
              lets you move any funds it holds onto a smart account you control here.
            </p>
            <ol className="recover-step__list">
              <li>Paste the private key or word list — we detect which it is.</li>
              <li>Choose a passphrase so we can store it encrypted on this device.</li>
              <li>Move its funds to your smart account in one transaction.</li>
            </ol>
            <p className="recover-step__warn" role="note">
              ⚠ Only paste a key you own. Anyone with this secret controls that account — treat it like cash. We
              never send it anywhere; it stays encrypted on this device.
            </p>
            <div className="recover-step__actions">
              <button type="button" className="btn" onClick={closeWizard}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => { setNotice(null); setStep('enter') }}>
                Get started
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — enter + live detection. */}
        {step === 'enter' && (
          <div className="recover-step">
            <p>Paste your private key (starts with <code>0x</code>) or your recovery word list (12–24 words).</p>
            <textarea
              className="lkr-secret-input"
              value={rawSecret}
              onChange={(e) => { setRawSecret(e.target.value); setNotice(null) }}
              placeholder="0x… private key, or your 12–24 recovery words separated by spaces"
              rows={3}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Private key or recovery word list"
            />
            {detected.kind === 'privateKey' || detected.kind === 'mnemonic' ? (
              <p className="recover-step__ok" role="status" data-testid="lkr-detected">
                ✓ Detected a {KIND_LABEL[detected.kind]} for account <code>{shortAddr(detected.address)}</code>.
                {alreadyStored && ' This account is already stored — continuing will replace it.'}
              </p>
            ) : detected.kind === 'invalid' ? (
              <p className="lkr-notice lkr-notice--warn" role="status">
                Not a recognizable key yet — keep typing, or check for a missing/mistyped word.
              </p>
            ) : null}
            {noticeEl}
            <div className="recover-step__actions">
              <button type="button" className="btn" onClick={() => setStep('intro')}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={detected.kind !== 'privateKey' && detected.kind !== 'mnemonic'}
                onClick={goSecure}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — passphrase → encrypt at rest. */}
        {step === 'secure' && (
          <div className="recover-step">
            <p>
              Choose a passphrase to encrypt this {active ? KIND_LABEL[active.kind] : 'key'} on this device. You
              will need it to move funds later. <strong>We can&apos;t reset it</strong> — if you forget it, the
              stored copy is unrecoverable (your original key still works).
            </p>
            <label className="lkr-field">
              <span>Passphrase</span>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setNotice(null) }}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>
            <label className="lkr-field">
              <span>Confirm passphrase</span>
              <input
                type="password"
                value={passphrase2}
                onChange={(e) => { setPassphrase2(e.target.value); setNotice(null) }}
                autoComplete="new-password"
              />
            </label>
            {noticeEl}
            <div className="recover-step__actions">
              <button type="button" className="btn" onClick={() => setStep('enter')} disabled={busy}>Back</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || passphrase.length < 8 || passphrase !== passphrase2}
                onClick={storeAndContinue}
              >
                {phase === 'encrypting' ? 'Encrypting…' : 'Encrypt & continue'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3b — unlock a previously stored key before moving funds. */}
        {step === 'unlock' && (
          <div className="recover-step">
            <p>
              Enter the passphrase for <code>{shortAddr(unlockEntry?.address)}</code> to move its funds.
            </p>
            <label className="lkr-field">
              <span>Passphrase</span>
              <input
                type="password"
                value={unlockPass}
                onChange={(e) => { setUnlockPass(e.target.value); setNotice(null) }}
                autoComplete="off"
                aria-label="Passphrase"
              />
            </label>
            {noticeEl}
            <div className="recover-step__actions">
              <button type="button" className="btn" onClick={closeWizard} disabled={busy}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || !unlockPass} onClick={doUnlock}>
                {phase === 'encrypting' ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — recommend + sweep to a smart account. */}
        {step === 'transfer' && (
          <div className="recover-step">
            <p role="status" className="recover-step__ok">
              ✓ Key for <code>{shortAddr(active?.address)}</code> is stored encrypted on this device.
            </p>
            <p>
              We recommend moving the funds to a <strong>smart account</strong> — it supports passkeys, recovery,
              and gasless actions. Send the {nativeSymbol} balance to the account below.
            </p>
            <div className="recover-step__address-row">
              <div className="recover-step__address-wrap">
                <AddressInput
                  id="lkr-destination"
                  label="Destination smart account"
                  value={destInput}
                  onChange={(e) => { setDestInput(e.target.value); setNotice(null) }}
                  onResolvedChange={(addr) => setDestResolved(addr || '')}
                  chainId={chainId}
                  placeholder="0x… smart account to receive funds"
                  disabled={busy}
                />
              </div>
              <AddressBookButton disabled={busy} onSelect={(entry) => { setDestInput(entry.address); setDestResolved(entry.address) }} />
            </div>

            <div className="recover-step__actions">
              <button type="button" className="btn" onClick={checkBalance} disabled={phase !== 'idle'}>
                {phase === 'quoting' ? 'Checking…' : 'Check balance'}
              </button>
            </div>

            {quote && (
              <div className="lkr-quote" role="status">
                <div><span>Balance</span><strong>{ethers.formatEther(quote.balance)} {nativeSymbol}</strong></div>
                <div><span>Network fee (reserved)</span><strong>~{ethers.formatEther(quote.gasReserve)} {nativeSymbol}</strong></div>
                <div><span>Will transfer</span><strong>{ethers.formatEther(quote.sendable)} {nativeSymbol}</strong></div>
                {quote.sendable <= 0n && (
                  <p className="lkr-quote__empty">Not enough to cover the network fee — add a little {nativeSymbol} to this account first, or there is nothing to move.</p>
                )}
              </div>
            )}

            <p className="recover-step__meta-line">
              Only the {nativeSymbol} balance moves. Tokens (USDC, etc.) on this key stay put — move those from Pay
              &amp; Transfer after you sign in. Checked on {networkName}.
            </p>

            {noticeEl}

            <div className="recover-step__actions">
              <button type="button" className="btn" onClick={closeWizard} disabled={busy}>Do this later</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !destTarget || !quote || quote.sendable <= 0n}
                onClick={doSweep}
              >
                {phase === 'sweeping' ? 'Transferring…' : 'Transfer funds'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5 — done. */}
        {step === 'done' && (
          <div className="recover-step">
            <p role="status" className="recover-step__ok">✓ Funds sent to your smart account.</p>
            <p>
              The transfer is confirmed. Your legacy key stays encrypted on this device in case you need it again —
              remove it from the Recovery list once you&apos;re sure it&apos;s empty.
            </p>
            {txHash && network?.explorer?.baseUrl && (
              <p className="recover-step__hint">
                <a href={`${network.explorer.baseUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                  View transaction →
                </a>
              </p>
            )}
            <div className="recover-step__actions">
              <button type="button" className="btn btn-primary" onClick={closeWizard}>Done</button>
            </div>
          </div>
        )}
      </ActionSheet>
    </section>
  )
}

LegacyKeyRecoveryPanel.propTypes = {
  deps: PropTypes.object,
}

export default LegacyKeyRecoveryPanel
