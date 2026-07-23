/**
 * Cross-chain recovery panel (spec 063, US2/US3) — for a recovered account, scan the
 * OTHER chains its seed controls (Bitcoin, Solana) and surface any funds, with a send
 * action. Unlocks to the raw secret (biometric/passphrase) only in memory, derives +
 * discovers, and never persists/logs/transmits key material.
 */

import { useCallback, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { unlockLegacySecret } from '../../lib/recovery/legacyKeys'
import { useCrossChainDiscovery } from '../../hooks/useCrossChainDiscovery'
import { LAMPORTS_PER_SOL } from '../../lib/solana/rpc'
import { isValidSolanaAddress } from '../../lib/solana/address'
import './LegacyKeyRecoveryPanel.css'

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
const fmtSol = (lamports) => (Number(lamports) / Number(LAMPORTS_PER_SOL)).toLocaleString(undefined, { maximumFractionDigits: 9 })
const fmtBtc = (sats) => (Number(sats || 0) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })

export default function CrossChainRecoveryPanel({ entry, deps = {} }) {
  const { status, results, error, runDiscovery, sendSol } = useCrossChainDiscovery({ deps: deps.discovery })
  const [passphrase, setPassphrase] = useState('')
  const [unlockError, setUnlockError] = useState(null)
  const [sendFor, setSendFor] = useState(null) // solana address being sent from
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [sendState, setSendState] = useState({ status: 'idle', message: null })

  const isPasskey = entry?.protection === 'passkey'

  const handleScan = useCallback(async () => {
    setUnlockError(null)
    try {
      const secret = await unlockLegacySecret({ entry, passphrase, deps: deps.unlock })
      setPassphrase('')
      await runDiscovery({ kind: entry.kind, secret })
    } catch (e) {
      setUnlockError(e?.message || 'Could not unlock this account')
    }
  }, [entry, passphrase, runDiscovery, deps.unlock])

  const fundedSolana = useMemo(() => (results?.solana || []).filter((s) => s.status === 'found'), [results])
  const btc = results?.bitcoin || null
  const btcSpendable = useMemo(
    () => (btc?.holdings || []).reduce((sum, h) => sum + (h.spendableSats || 0), 0),
    [btc],
  )
  const btcConfirmed = useMemo(
    () => (btc?.holdings || []).reduce((sum, h) => sum + (h.confirmedSats || 0), 0),
    [btc],
  )

  const canSend = sendFor && isValidSolanaAddress(to) && Number(amount) > 0 && sendState.status !== 'sending'

  const handleSend = useCallback(async () => {
    setSendState({ status: 'sending', message: null })
    try {
      const res = await sendSol({ address: sendFor, to, amountSol: amount })
      setSendState({ status: 'sent', message: `Sent — ${res.signature}` })
      setSendFor(null); setTo(''); setAmount('')
    } catch (e) {
      setSendState({ status: 'error', message: e?.message || 'Send failed' })
    }
  }, [sendSol, sendFor, to, amount])

  return (
    <section className="lkr-crosschain" aria-label="Recover funds on other chains">
      <h4>Other chains</h4>
      <p className="recover-step__hint">
        This recovered account&apos;s seed may hold Bitcoin or Solana too. Scan to find and move those funds.
      </p>

      {status === 'idle' || status === 'error' ? (
        <div className="recover-step">
          {!isPasskey && (
            <label className="lkr-field">
              <span>Passphrase</span>
              <input type="password" value={passphrase} autoComplete="off" aria-label="Passphrase"
                onChange={(e) => { setPassphrase(e.target.value); setUnlockError(null) }} />
            </label>
          )}
          {unlockError && <p role="alert" className="lkr-notice lkr-notice--error">{unlockError}</p>}
          {status === 'error' && error && <p role="alert" className="lkr-notice lkr-notice--error">{error}</p>}
          <button type="button" className="btn btn-primary" onClick={handleScan}
            disabled={!isPasskey && !passphrase}>
            {isPasskey ? 'Scan with biometrics' : 'Scan for funds'}
          </button>
        </div>
      ) : status === 'scanning' ? (
        <p className="lkr-notice" role="status">Scanning Bitcoin and Solana…</p>
      ) : (
        <div className="lkr-crosschain__results">
          {/* Bitcoin */}
          <div className="lkr-asset-row">
            <span className="lkr-asset-row__chain">Bitcoin</span>
            {!btc ? (
              <span className="lkr-asset-row__muted">Gateway unavailable</span>
            ) : btc.status === 'unreachable' ? (
              <span className="lkr-asset-row__muted">Couldn&apos;t check — try again</span>
            ) : btcConfirmed > 0 ? (
              <span className="lkr-asset-row__amount">{fmtBtc(btcConfirmed)} BTC{btcSpendable < btcConfirmed ? ' (some protected)' : ''}</span>
            ) : (
              <span className="lkr-asset-row__muted">No funds found</span>
            )}
          </div>

          {/* Solana */}
          <div className="lkr-asset-row">
            <span className="lkr-asset-row__chain">Solana</span>
            {fundedSolana.length === 0 ? (
              <span className="lkr-asset-row__muted">No funds found</span>
            ) : (
              <ul className="lkr-asset-list">
                {fundedSolana.map((s) => (
                  <li key={s.address}>
                    <span className="lkr-asset-row__amount">{fmtSol(s.balanceLamports)} SOL</span>
                    <span className="lkr-asset-row__addr">{shortAddr(s.address)}</span>
                    <button type="button" className="btn lkr-linkbtn" onClick={() => { setSendFor(s.address); setSendState({ status: 'idle', message: null }) }}>
                      Send
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {sendFor && (
            <div className="recover-step lkr-send-form">
              <p className="recover-step__hint">Send SOL from {shortAddr(sendFor)}. You pay the network fee.</p>
              <label className="lkr-field"><span>To</span>
                <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Solana address" aria-label="Recipient Solana address" />
              </label>
              <label className="lkr-field"><span>Amount (SOL)</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" aria-label="Amount in SOL" />
              </label>
              {sendState.message && (
                <p role={sendState.status === 'error' ? 'alert' : 'status'} className={`lkr-notice ${sendState.status === 'error' ? 'lkr-notice--error' : ''}`}>{sendState.message}</p>
              )}
              <div className="recover-step__actions">
                <button type="button" className="btn" onClick={() => setSendFor(null)} disabled={sendState.status === 'sending'}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleSend} disabled={!canSend}>
                  {sendState.status === 'sending' ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {sendState.status === 'sent' && !sendFor && (
            <p role="status" className="lkr-notice">{sendState.message}</p>
          )}
        </div>
      )}
    </section>
  )
}

CrossChainRecoveryPanel.propTypes = {
  entry: PropTypes.object.isRequired,
  deps: PropTypes.object,
}
