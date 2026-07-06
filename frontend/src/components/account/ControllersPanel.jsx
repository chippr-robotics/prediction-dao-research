/**
 * Account controllers panel (spec 041, T046–T048 — US4/FR-018–FR-020).
 *
 * Lists every controller (passkeys + linked wallets) from the ON-CHAIN owner
 * set, with local labels; supports add-passkey, link-wallet (sanctions-
 * screened BEFORE the on-chain op — clarification Q2), and remove (last-
 * controller refusal client-side; the contract enforces it regardless).
 * Every mutation routes through sendCalls as an account self-call — one
 * ceremony each, on-chain enforced.
 */

import { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { usePasskeyAccount } from '../../hooks/usePasskeyAccount'
import { useWallet } from '../../hooks/useWalletManagement'
import { createCredential, rememberCredential } from '../../lib/passkey/credentials'
import {
  encodeAddPasskeyOwner,
  encodeAddWalletOwner,
  encodeRemoveOwner,
  LastControllerError,
} from '../../lib/passkey/smartAccount'
import { unwrapMasterSeed, wrapForController, revokeController } from '../../lib/passkey/prfKeys'
import { screenController } from '../../utils/sanctionsScreen'

function ControllersPanel({ deps = {} }) {
  const { address, sendCalls, provider } = useWallet()
  const account = usePasskeyAccount(deps)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [linkAddress, setLinkAddress] = useState('')

  const run = useCallback(
    async (fn) => {
      setBusy(true)
      setNotice(null)
      try {
        await fn()
        await account.refresh()
      } catch (e) {
        if (e?.name === 'CeremonyCancelled') setNotice(null) // clean abort
        else setNotice({ kind: 'error', text: e.message })
      } finally {
        setBusy(false)
      }
    },
    [account]
  )

  /** Add a second passkey: new credential ceremony → ownerAdd self-call → PRF wrap (FR-019). */
  const addPasskey = useCallback(
    () =>
      run(async () => {
        const cred = await (deps.createCredential ?? createCredential)({ label: 'New device', deps })
        await sendCalls([
          { target: address, data: encodeAddPasskeyOwner(cred.publicKey) },
        ])
        rememberCredential({ ...cred, address }, deps.storage)
        // Grant the new credential the SAME encryption seed where possible
        // (FR-012). Failure here never blocks the controller addition.
        try {
          const session = account.controllers.find((c) => c.isThisDevice && c.credentialId)
          if (session?.credentialId) {
            const seed = await unwrapMasterSeed({ account: address, credentialId: session.credentialId, deps })
            await wrapForController({ account: address, seed, credentialId: cred.credentialId, deps })
          }
        } catch {
          setNotice({
            kind: 'info',
            text: 'Passkey added. Encrypted features for the new device can be enabled later from a device that has them.',
          })
        }
      }),
    [run, deps, sendCalls, address, account.controllers]
  )

  /** Link an external wallet: screening gate FIRST (clarification Q2), then ownerAdd. */
  const linkWallet = useCallback(
    () =>
      run(async () => {
        const target = linkAddress.trim()
        const verdict = await (deps.screenController ?? screenController)(target, provider)
        if (!verdict.clear) {
          throw new Error(
            verdict.available
              ? 'This wallet address is flagged by sanctions screening and cannot be linked.'
              : 'Screening is unavailable right now — linking is blocked until it can run (fail-closed).'
          )
        }
        await sendCalls([{ target: address, data: encodeAddWalletOwner(target) }])
        setLinkAddress('')
      }),
    [run, deps, linkAddress, provider, sendCalls, address]
  )

  /** Remove a controller: on-chain removal + wrapped-seed revocation (FR-020). */
  const removeController = useCallback(
    (controller) =>
      run(async () => {
        const data = encodeRemoveOwner({
          index: controller.index,
          ownerBytes: controller.ownerBytes,
          ownerCount: BigInt(account.controllerCount),
        })
        await sendCalls([{ target: address, data }])
        if (controller.credentialId) {
          revokeController({ account: address, credentialId: controller.credentialId, deps })
        }
      }),
    [run, account.controllerCount, sendCalls, address, deps]
  )

  if (!account.isPasskeySession) return null

  return (
    <section className="controllers-panel" aria-label="Account controllers">
      <h3>Devices &amp; controllers</h3>
      {!account.deployed && (
        <p className="controllers-panel__counterfactual" role="note">
          Your account is ready to receive funds and activates on-chain with your first action.
          Controller changes become available after that.
        </p>
      )}

      {account.singleControllerRisk && (
        <p className="controllers-panel__risk" role="alert" data-testid="single-controller-warning">
          Only one passkey controls this account. Add a second passkey or link a wallet so losing this
          device never means losing your funds.
        </p>
      )}

      <ul className="controllers-panel__list">
        {account.controllers.map((c) => (
          <li key={String(c.index)} data-testid={`controller-${c.index}`}>
            <span>{c.label}</span>
            <span className="controllers-panel__kind">{c.kind}</span>
            {c.kind === 'wallet' && <code>{c.address}</code>}
            {c.isThisDevice && <em> (this device)</em>}
            <button
              type="button"
              className="btn btn-small"
              disabled={busy || account.controllerCount <= 1}
              onClick={() => removeController(c)}
              aria-label={`Remove ${c.label}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="controllers-panel__actions">
        <button type="button" className="btn" disabled={busy || !account.deployed} onClick={addPasskey}>
          Add a passkey
        </button>
        <div className="controllers-panel__link">
          <input
            type="text"
            placeholder="0x… wallet to link"
            value={linkAddress}
            onChange={(e) => setLinkAddress(e.target.value)}
            aria-label="Wallet address to link"
          />
          <button
            type="button"
            className="btn"
            disabled={busy || !account.deployed || !/^0x[0-9a-fA-F]{40}$/.test(linkAddress.trim())}
            onClick={linkWallet}
          >
            Link wallet
          </button>
        </div>
      </div>

      {notice && (
        <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`controllers-panel__${notice.kind}`}>
          {notice.text}
        </p>
      )}
      {account.error && <p role="alert">{account.error}</p>}
    </section>
  )
}

ControllersPanel.propTypes = {
  deps: PropTypes.object,
}

export { LastControllerError }
export default ControllersPanel
