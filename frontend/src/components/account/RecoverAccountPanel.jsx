/**
 * Wallet-only passkey account recovery (spec 045, US6/FR-014).
 *
 * A user who lost every passkey but linked an external wallet as a controller
 * regains access here: connect that wallet → verify on-chain that it controls
 * the account (`isOwnerAddress`) → create a fresh passkey on this device →
 * authorize it with an ordinary wallet transaction (`addOwnerPublicKey`).
 * No bundler, relayer, or FairWins-operated service is involved — the same
 * calls work from any generic wallet tool (see
 * docs/runbooks/passkey-account-recovery.md).
 */

import { useState, useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { ethers } from 'ethers'
import { useWallet } from '../../hooks/useWalletManagement'
import {
  createCredential,
  rememberCredential,
  knownCredentials,
  CeremonyCancelled,
} from '../../lib/passkey/credentials'

// Human-readable fragments for the vendored Coinbase Smart Wallet MultiOwnable
// surface (ethers v6 signer path — the wallet talks to the account directly).
const RECOVERY_ABI = [
  'function isOwnerAddress(address owner) view returns (bool)',
  'function addOwnerPublicKey(bytes32 x, bytes32 y)',
]

const isHexAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())

function RecoverAccountPanel({ deps = {} }) {
  const { address: walletAddress, signer, provider, loginMethod, isConnected } = useWallet()
  const [accountAddress, setAccountAddress] = useState('')
  // idle → verifying → ready → creating → submitting → confirmed | failed
  const [txState, setTxState] = useState('idle')
  const [notice, setNotice] = useState(null)

  // Local hints: addresses this browser has ever associated with a passkey.
  const hints = useMemo(() => {
    const seen = new Set()
    return (deps.knownCredentials ?? knownCredentials)()
      .map((c) => c.address)
      .filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()))
  }, [deps.knownCredentials])

  const verify = useCallback(async () => {
    setNotice(null)
    setTxState('verifying')
    try {
      const target = accountAddress.trim()
      const account = new ethers.Contract(target, RECOVERY_ABI, deps.provider ?? provider)
      const isOwner = await account.isOwnerAddress(walletAddress)
      if (!isOwner) {
        setTxState('idle')
        setNotice({
          kind: 'error',
          text: 'The connected wallet is not a controller of that account. Recovery needs a wallet that was linked while you still had passkey access.',
        })
        return
      }
      setTxState('ready')
    } catch (e) {
      setTxState('idle')
      setNotice({
        kind: 'error',
        text: `Could not verify that account on this network: ${e.reason || e.message}`,
      })
    }
  }, [accountAddress, walletAddress, provider, deps.provider])

  const recover = useCallback(async () => {
    setNotice(null)
    setTxState('creating')
    let credential
    try {
      credential = await (deps.createCredential ?? createCredential)({ label: 'Recovered device', deps })
    } catch (e) {
      setTxState('ready')
      if (!(e instanceof CeremonyCancelled || e?.name === 'CeremonyCancelled')) {
        setNotice({ kind: 'error', text: e.message })
      }
      return
    }
    try {
      setTxState('submitting')
      const target = accountAddress.trim()
      const account = new ethers.Contract(target, RECOVERY_ABI, deps.signer ?? signer)
      const tx = await account.addOwnerPublicKey(credential.publicKey.x, credential.publicKey.y)
      const receipt = await tx.wait()
      if (receipt?.status !== 1) throw new Error('transaction reverted')
      // Only now is the credential a real controller — record it so passkey
      // sign-in works immediately (spec 045 FR-005).
      rememberCredential({ ...credential, address: target }, deps.storage)
      setTxState('confirmed')
      setNotice({
        kind: 'success',
        text: 'New passkey authorized. You can now sign out of this wallet and sign in with the passkey.',
      })
    } catch (e) {
      setTxState('ready')
      setNotice({ kind: 'error', text: `Authorizing the new passkey failed: ${e.reason || e.message}` })
    }
  }, [accountAddress, signer, deps])

  // Wallet-session only: a passkey session manages controllers in the
  // Controllers panel instead; disconnected visitors must connect first.
  if (!isConnected || loginMethod === 'passkey') return null

  return (
    <section className="recover-account-panel section" aria-label="Recover passkey account">
      <h3>Recover a passkey account</h3>
      <p className="section-description">
        Lost your passkeys? If this wallet was linked to your passkey account as a controller, it can
        authorize a new passkey — no FairWins involvement required.
      </p>

      <label htmlFor="recover-account-address">Passkey account address</label>
      <input
        id="recover-account-address"
        type="text"
        placeholder="0x… account to recover"
        value={accountAddress}
        onChange={(e) => {
          setAccountAddress(e.target.value)
          setTxState('idle')
        }}
        disabled={txState === 'creating' || txState === 'submitting'}
      />
      {hints.length > 0 && txState === 'idle' && (
        <div className="recover-account-panel__hints">
          <span>Known on this browser:</span>
          {hints.map((h) => (
            <button key={h} type="button" className="btn btn-small" onClick={() => setAccountAddress(h)}>
              {`${h.substring(0, 6)}...${h.substring(h.length - 4)}`}
            </button>
          ))}
        </div>
      )}

      <div className="recover-account-panel__actions">
        <button
          type="button"
          className="btn"
          disabled={!isHexAddress(accountAddress) || txState !== 'idle'}
          onClick={verify}
        >
          {txState === 'verifying' ? 'Verifying…' : 'Verify ownership'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={txState !== 'ready'}
          onClick={recover}
        >
          {txState === 'creating'
            ? 'Waiting for your device…'
            : txState === 'submitting'
              ? 'Authorizing on-chain…'
              : 'Create & authorize new passkey'}
        </button>
      </div>

      {txState === 'ready' && (
        <p role="status" data-testid="recover-verified">
          ✓ This wallet controls the account. Creating a passkey will prompt your device, then send one
          wallet transaction.
        </p>
      )}
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`recover-account-panel__${notice.kind}`}
        >
          {notice.text}
        </p>
      )}
    </section>
  )
}

RecoverAccountPanel.propTypes = {
  deps: PropTypes.object,
}

export default RecoverAccountPanel
