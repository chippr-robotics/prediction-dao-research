/**
 * Account controllers panel (spec 041, T046–T048 — US4/FR-018–FR-020).
 *
 * Lists every controller (passkeys + linked wallets) from the ON-CHAIN owner
 * set, with local labels; supports add-passkey, link-wallet (sanctions-
 * screened BEFORE the on-chain op — clarification Q2), and remove (last-
 * controller refusal client-side; the contract enforces it regardless).
 * Every mutation routes through sendCalls as an account self-call — one
 * ceremony each, on-chain enforced.
 *
 * The panel is a collapsible section on the Recovery tab: collapsed it reports
 * how many controllers the account has (and flags a single-controller account),
 * so the list of keys is one tap away rather than a wall of controls. Every
 * mutation — add a passkey, link a wallet, remove a controller — happens in a
 * bottom sheet that states the consequence before it acts; the wallet address
 * entry lives in the link sheet, so the panel itself is just the list.
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
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import { extractAddressFromScan } from '../../lib/addressBook/scanAddress'
import ActionSheet from './ActionSheet'
import AccordionSection from './AccordionSection'

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

// User-facing guide for how losing/replacing passkeys and recovery via a linked wallet work.
const RECOVERY_DOCS_URL = 'https://docs.FairWins.app/user-guide/account-recovery/'

function ControllersPanel({ deps = {}, defaultOpen = false }) {
  const { address, sendCalls, provider, chainId } = useWallet()
  const account = usePasskeyAccount(deps)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [linkAddress, setLinkAddress] = useState('')
  const [linkAddressResolved, setLinkAddressResolved] = useState('')
  const [scanOpen, setScanOpen] = useState(false)
  // Informed-consent bottom sheet before a full-controller action: null | 'add' | 'link'.
  const [sheet, setSheet] = useState(null)
  // Controller queued for removal — removal is irreversible, so it confirms in a sheet.
  const [pendingRemoval, setPendingRemoval] = useState(null)

  const applyLinkAddress = useCallback((addr) => {
    setLinkAddress(addr)
    setLinkAddressResolved(addr)
  }, [])

  const handleScan = useCallback((decodedText) => {
    const addr = extractAddressFromScan(decodedText)
    if (addr) applyLinkAddress(addr)
    setScanOpen(false)
  }, [applyLinkAddress])

  // Returns true only when the action fully succeeded, so a confirmation sheet
  // can close on success and stay open (for a retry) on error/cancel.
  const run = useCallback(
    async (fn) => {
      setBusy(true)
      setNotice(null)
      try {
        await fn()
        await account.refresh()
        return true
      } catch (e) {
        if (e?.name === 'CeremonyCancelled') setNotice(null) // clean abort
        else setNotice({ kind: 'error', text: e.message })
        return false
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
        const target = (linkAddressResolved || linkAddress).trim()
        // Idempotent refusal (spec 045 edge case) — the contract would revert
        // AlreadyOwner anyway; refusing here saves the ceremony and the fee.
        const already = account.controllers.some(
          (c) => c.kind === 'wallet' && c.address?.toLowerCase() === target.toLowerCase()
        )
        if (already) throw new Error('That wallet is already a controller of this account.')
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
        setLinkAddressResolved('')
      }),
    [run, deps, linkAddress, linkAddressResolved, provider, sendCalls, address, account.controllers]
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

  // Confirm handlers for the informed-consent sheets: run the action, and close
  // the sheet only if it fully succeeded (errors stay in the sheet for a retry).
  const confirmAddPasskey = useCallback(async () => {
    if (await addPasskey()) setSheet(null)
  }, [addPasskey])

  const confirmLinkWallet = useCallback(async () => {
    if (await linkWallet()) setSheet(null)
  }, [linkWallet])

  const confirmRemoval = useCallback(async () => {
    if (pendingRemoval && (await removeController(pendingRemoval))) setPendingRemoval(null)
  }, [pendingRemoval, removeController])

  const closeLinkSheet = useCallback(() => {
    setSheet(null)
    setLinkAddress('')
    setLinkAddressResolved('')
  }, [])

  const linkTarget = (linkAddressResolved || linkAddress).trim()

  if (!account.isPasskeySession) return null

  // Collapsed-state summary + attention badge: how many keys can reach this
  // account, and whether that number is dangerously low.
  const summary = !account.deployed
    ? 'Activates on-chain with your first action'
    : `${account.controllerCount} ${account.controllerCount === 1 ? 'controller' : 'controllers'}`

  return (
    <>
      <AccordionSection
        id="controllers"
        title="Devices & controllers"
        summary={summary}
        badge={account.singleControllerRisk ? 'Add a backup key' : null}
        badgeTone="warn"
        defaultOpen={defaultOpen}
        className="controllers-panel"
      >
        <p className="controllers-panel__intro">
          Passkeys and linked wallets that can control this account. Keep at least two so losing one device never
          locks you out.{' '}
          <a href={RECOVERY_DOCS_URL} target="_blank" rel="noopener noreferrer">
            Learn how account recovery works →
          </a>
        </p>
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
            <li key={String(c.index)} data-testid={`controller-${c.index}`} className="controllers-panel__item">
              <div className="controllers-panel__item-info">
                <div className="controllers-panel__item-head">
                  <span className="controllers-panel__label">{c.label}</span>
                  <span className="controllers-panel__kind" data-kind={c.kind}>
                    {c.kind === 'wallet' ? 'Wallet' : 'Passkey'}
                  </span>
                  {c.isThisDevice && <span className="controllers-panel__badge">(this device)</span>}
                </div>
                {c.kind === 'wallet' && c.address && (
                  <code className="controllers-panel__address">{c.address}</code>
                )}
              </div>
              <button
                type="button"
                className="btn btn-small controllers-panel__remove"
                disabled={busy || account.controllerCount <= 1}
                onClick={() => {
                  setNotice(null)
                  setPendingRemoval(c)
                }}
                aria-haspopup="dialog"
                aria-label={`Remove ${c.label}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="controllers-panel__actions">
          <button
            type="button"
            className="btn"
            disabled={busy || !account.deployed}
            aria-haspopup="dialog"
            onClick={() => {
              setNotice(null)
              setSheet('add')
            }}
          >
            Add a passkey
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !account.deployed}
            aria-haspopup="dialog"
            onClick={() => {
              setNotice(null)
              setSheet('link')
            }}
          >
            Link a wallet
          </button>
        </div>

        {/* Panel-level notice only when no sheet is up (the sheet shows its own). */}
        {!sheet && !pendingRemoval && notice && (
          <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`controllers-panel__${notice.kind}`}>
            {notice.text}
          </p>
        )}
        {account.error && <p role="alert">{account.error}</p>}
      </AccordionSection>

      {/* Add-a-passkey: full-controller consequences before the ceremony. */}
      <ActionSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        title="Add a passkey"
        closeDisabled={busy}
      >
        <p className="action-sheet__text">
          A passkey is a second key for this account, stored on this device and unlocked with Face ID,
          Touch ID, or your device PIN.
        </p>
        <p className="action-sheet__warn">
          It becomes a <strong>full controller</strong> — like your current passkey, it can approve
          actions, move funds, and add or remove controllers. Keeping a second key is the recommended way
          to make sure losing one device never locks you out.
        </p>
        <ol className="action-sheet__list">
          <li>Your device prompts you to create the passkey.</li>
          <li>One on-chain transaction authorizes it on the account.</li>
        </ol>
        {busy && <p className="action-sheet__progress">Working… confirm the prompts on your device.</p>}
        {notice && (
          <p role="alert" className={`action-sheet__notice action-sheet__notice--${notice.kind}`}>
            {notice.text}
          </p>
        )}
        <div className="action-sheet__actions">
          <button type="button" className="btn" onClick={() => setSheet(null)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmAddPasskey} disabled={busy}>
            {busy ? 'Adding…' : 'Create passkey'}
          </button>
        </div>
      </ActionSheet>

      {/* Link-wallet: the address entry AND the consequence live in one sheet, so the panel
          stays a list and the member reads what linking means while typing the address.
          Linking grants FULL control — say so plainly before the act (FR-011). */}
      <ActionSheet
        open={sheet === 'link'}
        onClose={closeLinkSheet}
        title="Link a wallet"
        closeDisabled={busy}
      >
        <p className="action-sheet__warn">
          A linked wallet becomes a <strong>full controller</strong> of your account. It can move your
          funds, add or remove controllers, and recover the account if you lose your passkeys. Only link a
          wallet you exclusively control.
        </p>
        {/* Standard address entry (ENS resolution + address book + QR scan) used across the app */}
        <div className="controllers-panel__link-row">
          <div className="controllers-panel__address-wrap">
            <AddressInput
              id="controllers-link-address"
              value={linkAddress}
              onChange={(e) => setLinkAddress(e.target.value)}
              onResolvedChange={(addr) => setLinkAddressResolved(addr || '')}
              chainId={chainId}
              placeholder="0x… wallet to link"
              disabled={busy}
              aria-label="Wallet address to link"
            />
          </div>
          <AddressBookButton
            chainId={chainId}
            disabled={busy}
            onSelect={(entry) => applyLinkAddress(entry.address)}
          />
          <button
            type="button"
            className="controllers-panel__scan-btn"
            onClick={() => setScanOpen(true)}
            disabled={busy}
            title="Scan QR code"
            aria-label="Scan QR code"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z" />
            </svg>
          </button>
        </div>
        {ADDRESS_RE.test(linkTarget) && <code className="action-sheet__addr">{linkTarget}</code>}
        <ol className="action-sheet__list">
          <li>We screen the address first (linking is blocked if screening flags it or can&apos;t run).</li>
          <li>One on-chain transaction links it to your account.</li>
        </ol>
        {busy && <p className="action-sheet__progress">Screening and linking… confirm any prompts.</p>}
        {notice && (
          <p role="alert" className={`action-sheet__notice action-sheet__notice--${notice.kind}`}>
            {notice.text}
          </p>
        )}
        <div className="action-sheet__actions">
          <button type="button" className="btn" onClick={closeLinkSheet} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={confirmLinkWallet}
            disabled={busy || !account.deployed || !ADDRESS_RE.test(linkTarget)}
          >
            {busy ? 'Linking…' : 'Link wallet'}
          </button>
        </div>
      </ActionSheet>

      {/* Removing a controller is irreversible and can strand an account — confirm it. */}
      <ActionSheet
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        title="Remove this controller?"
        closeDisabled={busy}
      >
        <p className="action-sheet__text">
          <strong>{pendingRemoval?.label}</strong> will no longer be able to approve actions or recover this
          account.
        </p>
        {pendingRemoval?.address && <code className="action-sheet__addr">{pendingRemoval.address}</code>}
        <p className="action-sheet__warn">
          {pendingRemoval?.isThisDevice
            ? 'This is the key on the device you are using now — after removing it you will need another passkey or linked wallet to sign in.'
            : 'This cannot be undone from here; you would have to add the key back as a new controller.'}
        </p>
        {busy && <p className="action-sheet__progress">Removing… confirm any prompts.</p>}
        {notice && (
          <p role="alert" className={`action-sheet__notice action-sheet__notice--${notice.kind}`}>
            {notice.text}
          </p>
        )}
        <div className="action-sheet__actions">
          <button type="button" className="btn" onClick={() => setPendingRemoval(null)} disabled={busy}>
            Keep it
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmRemoval} disabled={busy}>
            {busy ? 'Removing…' : 'Remove controller'}
          </button>
        </div>
      </ActionSheet>

      {/* Outside the sheets: the scanner is its own full-screen surface (z-index above them). */}
      <QRScanner isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanSuccess={handleScan} />
    </>
  )
}

ControllersPanel.propTypes = {
  deps: PropTypes.object,
  /** Start expanded (the Recovery tab keeps every section collapsed by default). */
  defaultOpen: PropTypes.bool,
}

export { LastControllerError }
export default ControllersPanel
