// Spec 043 (US1) — the member's vaults, with selection (FR-007).
// Spec 049 (US2) — each row carries a PolicyBadge when the vault is policy-governed (or has a
// foreign guard); the status/summary are enriched by useCustodyVaults and absent on failure.
// Spec 068 (US1) — the list spans EVERY chain the member has vaults on, so each row states its
// chain (FR-002) and an unreachable chain degrades to an honest per-row notice rather than
// disappearing or blanking the list.
//
// Protect-accordion-refresh — the list reuses the Recovery tab's AccordionSection (one vault
// expanded at a time, detail inline in the card body instead of a side column) so the two
// collapsible surfaces behave identically. The card itself borrows the account-card visual
// language (avatar, kind pill, per-kind accent border, active-state ring) from the My Account
// carousel, so a vault reads as the same "account" everywhere it's shown in the app.

import { useMemo } from 'react'
import AccordionSection from '../account/AccordionSection'
import { AccordionGroupContext } from '../account/accordionContext'
import AccountAvatar from '../account/AccountAvatar'
import PolicyBadge from './PolicyBadge'
import VaultDetail from './VaultDetail'
import VaultProposalsPanel from './VaultProposalsPanel'

export default function VaultList({
  vaults,
  activeAddress,
  onSelect,
  onForget,
  onSwitchNetwork,
  proposals,
  isActiveIdentity = () => false,
}) {
  // One vault open at a time, driven by the existing selection state rather than
  // AccordionGroup's own — selecting a vault IS expanding its card, matching the exclusive
  // open-one-at-a-time behavior of the Recovery tab's AccordionGroup.
  const groupValue = useMemo(
    () => ({
      isOpen: (id) => id === activeAddress,
      toggle: (id) => onSelect(id === activeAddress ? null : id),
    }),
    [activeAddress, onSelect],
  )

  if (!vaults?.length) {
    return (
      <p className="custody-hint" role="status">
        No vaults yet.
      </p>
    )
  }

  return (
    <AccordionGroupContext.Provider value={groupValue}>
      <div className="accordion-group custody-vault-list" aria-label="Your vaults">
        {vaults.map((v) => {
          const open = v.address === activeAddress
          const label = v.label || 'Unnamed vault'
          const summary = [
            v.isSafe && v.threshold != null
              ? `${v.threshold}-of-${v.owners.length}${v.owner ? ' · owner' : ' · view-only'}`
              : null,
            v.reachable === false
              ? `${v.chainName || `chain ${v.chainId}`} unreachable`
              : v.isSafe === false
                ? 'unreadable'
                : null,
          ]
            .filter(Boolean)
            .join(' · ')

          return (
            <AccordionSection
              key={`${v.chainId}:${v.address}`}
              id={v.address}
              className={`custody-vault-card${v.isTestnet ? ' is-testnet' : ''}`}
              icon={<AccountAvatar address={v.address} size={28} />}
              title={
                <span className="custody-vault-card__title">
                  <span className="custody-vault-card__kind">Multisig</span>
                  <span className="custody-vault-card__label">{label}</span>
                  <span className="custody-vault-card__addr">{shorten(v.address)}</span>
                  <PolicyBadge status={v.policyStatus} summary={v.policySummary} />
                </span>
              }
              summary={summary}
              badge={`${v.chainName || `Chain ${v.chainId}`}${v.isTestnet ? ' · testnet' : ''}`}
              badgeTone={v.isTestnet ? 'warn' : 'info'}
            >
              <VaultDetail
                vault={v}
                onForget={onForget}
                isActiveIdentity={isActiveIdentity(v)}
                onProposePolicy={open && v.owner && v.onVaultChain ? proposals?.propose : undefined}
                onSwitchNetwork={onSwitchNetwork}
                // FR-019 — the policy panel needs the live queue to refuse a second pending change;
                // only the open vault's own queue applies (the shared instance tracks activeVault).
                proposalQueue={open ? (proposals?.queue ?? []) : []}
              />
              {open && <VaultProposalsPanel vault={v} proposals={proposals} />}
            </AccordionSection>
          )
        })}
      </div>
    </AccordionGroupContext.Provider>
  )
}

function shorten(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
}
