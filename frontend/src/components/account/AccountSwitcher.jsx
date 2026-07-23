/**
 * Global "acting account" switcher (spec 062 follow-up). Lets a member choose
 * which account the app acts as — their personal wallet, a multisig vault
 * (spec 043), or a recovered legacy account (spec 062) — writing the shared
 * active identity (CustodyContext via useActiveAccount) that Trade, Transfer, and
 * every money-moving surface already read.
 *
 * Selecting a legacy account first unlocks it (biometric or passphrase, via
 * LegacyUnlockDialog) into an in-memory signer; the key is never persisted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useWallet } from '../../hooks/useWalletManagement'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import { useLegacyAccounts } from '../../hooks/useLegacyAccounts'
import BlockiesAvatar from '../ui/BlockiesAvatar'
import LegacyUnlockDialog from './LegacyUnlockDialog'
import './AccountSwitcher.css'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
const KIND_TAG = { vault: 'Multisig', legacy: 'Recovered' }

export default function AccountSwitcher({ deps = {} }) {
  const { address, chainId } = useWallet()
  const { identity, operateAsPersonal, operateAsVault, operateAsLegacy } = useActiveAccount()
  const { vaults } = useCustodyVaults()
  const legacyAccounts = useLegacyAccounts()

  const [open, setOpen] = useState(false)
  const [unlockEntry, setUnlockEntry] = useState(null)
  const wrapRef = useRef(null)

  const accounts = useMemo(() => {
    const list = [{ id: 'personal', kind: 'personal', address, label: 'Personal wallet' }]
    for (const v of vaults || []) {
      if (v?.address) list.push({ id: `vault:${v.address}`, kind: 'vault', address: v.address, chainId: v.chainId, label: v.label || short(v.address) })
    }
    return list.concat(legacyAccounts)
  }, [address, vaults, legacyAccounts])

  const currentId = useMemo(() => {
    if (identity.mode === 'vault') return `vault:${identity.vaultAddress}`
    if (identity.mode === 'legacy') return `legacy:${String(identity.address).toLowerCase()}`
    return 'personal'
  }, [identity])

  const selected = accounts.find((a) => a.id === currentId) || accounts[0]

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const choose = useCallback((acc) => {
    setOpen(false)
    if (acc.kind === 'personal') return operateAsPersonal()
    if (acc.kind === 'vault') return operateAsVault({ address: acc.address, chainId: acc.chainId, label: acc.label })
    if (acc.kind === 'legacy') { setUnlockEntry(acc.entry); return undefined } // unlock, then operateAsLegacy
    return undefined
  }, [operateAsPersonal, operateAsVault])

  const onUnlocked = useCallback((signer) => {
    if (unlockEntry) {
      // Unlocked for the CURRENT chain — submit re-checks this before sending.
      operateAsLegacy({ address: unlockEntry.address, chainId, kind: unlockEntry.kind, label: short(unlockEntry.address), signer })
    }
    setUnlockEntry(null)
  }, [unlockEntry, chainId, operateAsLegacy])

  // Only worth showing when there's more than the personal wallet to choose from.
  if (accounts.length <= 1) return null

  const row = (acc, withTag = true) => (
    <>
      <BlockiesAvatar address={acc.address} size={20} />
      <span className="acct-switch__label">
        {acc.label || short(acc.address)}
        {withTag && KIND_TAG[acc.kind] && <span className="acct-switch__tag">{KIND_TAG[acc.kind]}</span>}
      </span>
      <span className="acct-switch__addr">{short(acc.address)}</span>
    </>
  )

  return (
    <div className="acct-switch" ref={wrapRef}>
      <span className="acct-switch__caption">Acting as</span>
      <button
        type="button"
        className="acct-switch__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change acting account"
        onClick={() => setOpen((o) => !o)}
      >
        {row(selected)}
        <span className="acct-switch__chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="acct-switch__menu" role="listbox">
          {accounts.map((acc) => (
            <li key={acc.id} role="option" aria-selected={acc.id === currentId}>
              <button type="button" className="acct-switch__opt" onClick={() => choose(acc)}>
                {row(acc)}
                {acc.id === currentId && <span className="acct-switch__check" aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <LegacyUnlockDialog
        open={Boolean(unlockEntry)}
        entry={unlockEntry}
        onClose={() => setUnlockEntry(null)}
        onUnlocked={onUnlocked}
        deps={deps}
      />
    </div>
  )
}

AccountSwitcher.propTypes = {
  deps: PropTypes.object,
}
