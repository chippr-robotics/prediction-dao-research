// Spec 043 — Custody surface. Lives under Tools → Protect with two sub-sections: "On chain"
// (Safe multisig) and "Off chain" (reserved, disabled). Gated by Safe availability: on a network without a
// configured Safe deployment, vault CREATION shows an honest "unavailable on this network" state (FR-030).
//
// Spec 068 (US1) — the vault LIST is no longer gated by the connected chain: a member's vaults on
// every chain are always listed with their chain identity (FR-003), and only creation/load are
// restricted to networks where custody is deployed (FR-005). Actions on a vault whose chain is not
// the connected one are withheld behind a switch prompt (FR-004).

import { useState } from 'react'
import PropTypes from 'prop-types'
import { useWallet } from '../../hooks'
import { useCustody } from '../../hooks/useCustody'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import { useVaultProposals } from '../../hooks/useVaultProposals'
import { isCustodySupported, CUSTODY_SUPPORTED_CHAIN_IDS } from '../../config/safeContracts'
import { NETWORKS } from '../../config/networks'
import VaultList from './VaultList'
import CreateVaultWizard from './CreateVaultWizard'
import LoadVaultForm from './LoadVaultForm'
import VerifySection from './VerifySection'
import HardwareWalletSection from './HardwareWalletSection'
import AccordionGroup from '../account/AccordionGroup'
import AccordionSection from '../account/AccordionSection'
import { useHardwareAccounts } from '../../hooks/useHardwareAccounts'
import './Custody.css'

/** Custody chains other than the connected one, for the "create elsewhere" affordance (FR-005). */
function otherCustodyChains(chainId) {
  return CUSTODY_SUPPORTED_CHAIN_IDS.filter((id) => id !== Number(chainId)).map((id) => ({
    chainId: id,
    name: NETWORKS[id]?.name || `Chain ${id}`,
  }))
}

function OnChainSection() {
  const { address, chainId, switchNetwork } = useWallet()
  const { active } = useCustody()
  const {
    vaults,
    activeVault,
    activeAddress,
    selectVault,
    loading,
    error,
    loadByAddress,
    createVault,
    previewVaultAddress,
    forget,
  } = useCustodyVaults()
  const [mode, setMode] = useState(null) // null | 'create' | 'load'
  // Spec 049 — one shared proposal-queue instance for the active vault, so policy-change proposals
  // (VaultDetail → PolicyPanel) land in the same queue the VaultProposalsPanel renders.
  const proposals = useVaultProposals(activeVault)
  const canCreateHere = isCustodySupported(chainId)
  const elsewhere = otherCustodyChains(chainId)

  return (
    <div className="custody-onchain" role="region" aria-label="On-chain vaults">
      {canCreateHere ? (
        <div className="custody-actions">
          <button type="button" onClick={() => setMode(mode === 'create' ? null : 'create')}>
            Create vault
          </button>
          <button type="button" onClick={() => setMode(mode === 'load' ? null : 'load')}>
            Load existing
          </button>
        </div>
      ) : (
        // FR-005: creation is honestly unavailable here, but the member's existing vaults on other
        // chains stay listed below — the estate never disappears because of the connected network.
        <div className="custody-unavailable" role="status">
          <p>New vaults cannot be created on this network.</p>
          {elsewhere.length > 0 && (
            <p className="custody-hint">
              Custody is available on {elsewhere.map((c) => c.name).join(', ')}.{' '}
              {switchNetwork && (
                <button type="button" className="custody-link" onClick={() => switchNetwork(elsewhere[0].chainId)}>
                  Switch to {elsewhere[0].name}
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {canCreateHere && mode === 'create' && (
        <CreateVaultWizard
          connectedAddress={address}
          chainId={chainId}
          onCreate={createVault}
          onPreview={previewVaultAddress}
          onDone={() => setMode(null)}
        />
      )}
      {canCreateHere && mode === 'load' && (
        <LoadVaultForm onLoad={loadByAddress} chainId={chainId} onDone={() => setMode(null)} />
      )}

      {loading && <p className="custody-hint">Loading vaults…</p>}
      {error && (
        <p className="custody-error" role="alert">
          {error}
        </p>
      )}

      {/* Spec 074/protect-accordion-refresh — one vault expanded at a time, its detail inline in the
          card body, the same collapsible pattern as the Recovery tab (AccordionSection). */}
      <VaultList
        vaults={vaults}
        activeAddress={activeAddress}
        onSelect={selectVault}
        onForget={forget}
        onSwitchNetwork={switchNetwork}
        proposals={proposals}
        isActiveIdentity={(v) => active.mode === 'vault' && active.vaultAddress === v.address}
      />
    </div>
  )
}

export default function CustodyPanel({ openSection = null }) {
  // Cheap store read (public metadata only) — powers the collapsed Off chain summary so the
  // member sees their cold-storage state without opening the section.
  const hardwareAccounts = useHardwareAccounts()

  return (
    <div className="custody-panel">
      <h2 className="custody-heading">Protect</h2>

      {/* Spec 085 — the three areas are collapsible sections in the shared accordion (one open at
          a time, the same pattern as the Recovery and Settings tabs), so the tab reads as three
          headings instead of three full surfaces. Longform explanation lives in the docs, not
          here (FR-009/FR-010). Section ids double as the drawer-search attention/deep-link ids
          (navSearchIndex; AccordionSection stamps data-attention itself), and `openSection` is
          the hash-driven card the page asks us to land open. */}
      <AccordionGroup defaultOpenId="custody-onchain" openId={openSection} className="custody-accordion">
        {/* Always rendered: the vault list spans chains, so it must survive an unsupported
            connected network (FR-003/FR-005). OnChainSection itself gates creation. */}
        <AccordionSection
          id="custody-onchain"
          title="On chain"
          summary="Multisig vaults you co-control"
          data-testid="custody-acc-onchain"
        >
          <OnChainSection />
        </AccordionSection>

        {/* Verify — sign an arbitrary message to prove control of an account, and check somebody
            else's proof. It belongs in Protect rather than under an account surface because it is
            the only place a member does something to establish who controls what WITHOUT moving
            value; and unlike the vault sections it needs no deployment on any chain, so it is
            never gated by the connected network. */}
        <AccordionSection
          id="custody-verify"
          title="Verify"
          summary="Sign and check account proofs"
          data-testid="custody-acc-verify"
        >
          <VerifySection />
        </AccordionSection>

        {/* Off chain — cold storage with hardware wallets (spec 085). */}
        <AccordionSection
          id="custody-offchain"
          title="Off chain"
          summary={
            hardwareAccounts.length > 0
              ? `${hardwareAccounts.length} hardware ${hardwareAccounts.length === 1 ? 'account' : 'accounts'}`
              : 'Cold storage with a hardware wallet'
          }
          data-testid="custody-acc-offchain"
        >
          <HardwareWalletSection />
        </AccordionSection>
      </AccordionGroup>
    </div>
  )
}

CustodyPanel.propTypes = {
  /** Accordion card to land open (hash-driven deep link from WalletPage / drawer search). */
  openSection: PropTypes.string,
}

export { CUSTODY_SUPPORTED_CHAIN_IDS }
