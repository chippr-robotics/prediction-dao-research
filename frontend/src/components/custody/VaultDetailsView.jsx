// Spec 102 (US5, FR-010…FR-012, FR-015) — the vault sheet's Details view: everything else about
// the vault. Address (copy) · one article per network (version, threshold, role, reachability,
// policy block) · owners cross-referenced against the address book · the acting-account chooser ·
// "Remove from Protect" (every network, after confirmation).
//
// Reads span chains; writes never do. The policy block for a network is proposable only on the
// instance the wallet is connected to (spec 068 FR-004); the others render read-only with the
// switch prompt VaultDetail already carries.

import { useState } from 'react'
import PropTypes from 'prop-types'
import { useWallet } from '../../hooks'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import { useVaultProposals } from '../../hooks/useVaultProposals'
import { useAccountSwitcher, ACCOUNT_KIND_TAG, shortAccountAddr } from '../../hooks/useAccountSwitcher'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { useClipboard } from '../../hooks/useClipboard'
import { chainDisplayName, isTestnetChain, listChainNames } from '../../lib/custody/chainName'
import VaultDetail from './VaultDetail'
import VaultOwnerRow from './VaultOwnerRow'
import OwnersThresholdPanel from './OwnersThresholdPanel'

const lc = (a) => String(a || '').toLowerCase()

function probeChainIds(list) {
  return (list || []).map((x) => (x && typeof x === 'object' ? x.chainId : x)).filter((x) => x != null)
}

function NetworkArticle({ instance, connected, owner, onProposePolicy, onSwitchNetwork, proposalQueue }) {
  const chainId = Number(instance.chainId)
  const name = instance.chainName || chainDisplayName(chainId)
  const testnet = instance.isTestnet ?? isTestnetChain(chainId)
  const readable = instance.isSafe === true
  return (
    <article className="vault-details__network" data-testid="vault-network" data-chain-id={chainId} aria-label={name}>
      <div className="vault-details__network-head">
        <strong>{name}</strong>
        {testnet && <span className="vault-details__network-facts">testnet</span>}
        {readable && (
          <span className="vault-details__network-facts">
            {instance.version ? `Safe ${instance.version} · ` : ''}
            {instance.threshold} of {instance.owners?.length ?? 0} · {owner ? 'Owner' : 'View-only'}
          </span>
        )}
      </div>
      {instance.reachable === false && (
        <p className="custody-error" role="status">
          {name} could not be reached, so this network&rsquo;s facts are not shown. Nothing about the vault has changed.
        </p>
      )}
      {instance.reachable !== false && instance.isSafe === false && (
        <p className="custody-error" role="status">
          Could not read a Safe at this address on {name}.
        </p>
      )}
      {readable && (
        <VaultDetail
          vault={{ ...instance, onVaultChain: connected }}
          variant="network"
          onProposePolicy={connected && owner ? onProposePolicy : undefined}
          onSwitchNetwork={onSwitchNetwork}
          proposalQueue={connected ? proposalQueue : []}
        />
      )}
    </article>
  )
}

NetworkArticle.propTypes = {
  instance: PropTypes.object.isRequired,
  connected: PropTypes.bool,
  owner: PropTypes.bool,
  onProposePolicy: PropTypes.func,
  onSwitchNetwork: PropTypes.func,
  proposalQueue: PropTypes.array,
}

export default function VaultDetailsView({ group, onClose, onVaultsChanged }) {
  const { address: connectedAddress, chainId: walletChainId, switchNetwork } = useWallet()
  const custody = useCustodyVaults()
  const connectedInstance = group.connectedInstance || null
  const proposals = useVaultProposals(connectedInstance)
  const switcher = useAccountSwitcher()
  const { identity, operateAsPersonal } = useActiveAccount()
  const clipboard = useClipboard()

  const [probe, setProbe] = useState({ busy: false, message: null })
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState(null)
  const [govBusy, setGovBusy] = useState(false)
  const [govError, setGovError] = useState(null)

  // Spec 068 FR-004 — re-checked at SUBMIT time: the wallet may have left the vault's network while
  // the sheet was open, and a governance change must never be sent to another chain.
  const proposeOnConnected = async (...args) => {
    setGovError(null)
    setGovBusy(true)
    try {
      if (!connectedInstance || Number(walletChainId) !== Number(connectedInstance.chainId)) {
        throw new Error('Your wallet is no longer on this vault\'s network. Switch back and try again.')
      }
      await proposals.propose(...args)
    } catch (e) {
      setGovError(e?.message || 'Could not propose the change.')
    } finally {
      setGovBusy(false)
    }
  }

  const instances = group.instances || []
  const chainIds = group.chainIds || instances.map((i) => Number(i.chainId))
  const owners = group.owners || []
  const readable = group.readable || instances.filter((i) => i.isSafe === true)
  const me = lc(connectedAddress)

  const ownerChains = (owner) =>
    readable.filter((i) => (i.owners || []).some((o) => lc(o) === lc(owner))).map((i) => Number(i.chainId))

  const doSwitch = (chainId) => {
    if (!switchNetwork) return
    Promise.resolve(switchNetwork(chainId)).catch(() => {})
  }

  const runProbe = async () => {
    setProbe({ busy: true, message: null })
    try {
      const res = await custody.probeVault?.(group.address)
      const added = probeChainIds(res?.added)
      const unreachable = probeChainIds(res?.unreachable)
      const parts = []
      parts.push(added.length > 0 ? `Added on ${listChainNames(added)}.` : 'No new networks found.')
      if (unreachable.length > 0) parts.push(`Not checked on ${listChainNames(unreachable)} — try again later.`)
      setProbe({ busy: false, message: parts.join(' ') })
      if (added.length > 0) onVaultsChanged?.()
    } catch (e) {
      setProbe({ busy: false, message: e?.message || 'Could not check other networks.' })
    }
  }

  const actingAsThis = identity?.mode === 'vault' && lc(identity.vaultAddress) === lc(group.address)

  const remove = async () => {
    setRemoving(true)
    setRemoveError(null)
    try {
      await custody.forgetVault?.(group.address)
      if (actingAsThis) operateAsPersonal?.()
      onVaultsChanged?.()
      onClose?.()
    } catch (e) {
      setRemoveError(e?.message || 'Could not remove this vault.')
      setRemoving(false)
    }
  }

  return (
    <div className="vault-details" data-testid="vault-details">
      {/* (a) Address */}
      <section className="vault-details__section" aria-labelledby="vault-details-address">
        <h4 id="vault-details-address">Address</h4>
        <div className="vault-details__address">
          <code>{group.address}</code>
          <button type="button" onClick={() => clipboard.copy(group.address)} data-testid="vault-copy-address">
            {clipboard.copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {clipboard.copied ? 'Address copied' : ''}
        </span>
        {clipboard.error && (
          <p className="custody-error" role="alert">
            {clipboard.error}
          </p>
        )}
      </section>

      {/* (b) Networks */}
      <section className="vault-details__section" aria-labelledby="vault-details-networks">
        <h4 id="vault-details-networks">Networks</h4>
        {instances.map((instance) => {
          const cid = Number(instance.chainId)
          return (
            <NetworkArticle
              key={cid}
              instance={instance}
              connected={Number(walletChainId) === cid}
              owner={Boolean(instance.owner)}
              onProposePolicy={proposals?.propose}
              onSwitchNetwork={doSwitch}
              proposalQueue={proposals?.queue ?? []}
            />
          )
        })}
        <div className="custody-actions">
          <button type="button" onClick={runProbe} disabled={probe.busy} data-testid="vault-probe">
            {probe.busy ? 'Checking…' : 'Check other networks'}
          </button>
        </div>
        {probe.message && (
          <p className="custody-hint" role="status" data-testid="vault-probe-result">
            {probe.message}
          </p>
        )}
      </section>

      {/* (c) Owners */}
      <section className="vault-details__section" aria-labelledby="vault-details-owners">
        <h4 id="vault-details-owners">Owners</h4>
        {owners.length === 0 ? (
          <p className="custody-hint" role="status">
            {readable.length === 0 ? 'Owners could not be read on any network.' : 'No owners.'}
          </p>
        ) : (
          <ul className="vault-details__owners">
            {owners.map((owner) => (
              <VaultOwnerRow key={lc(owner)} address={owner} chainIds={ownerChains(owner)} isYou={Boolean(me) && lc(owner) === me} />
            ))}
          </ul>
        )}
        {/* Governance (spec 043 US4) kept its home beside the owner list: adding/removing an owner or
            changing the threshold is an ordinary proposal on the CONNECTED network's instance, so the
            panel renders only where the wallet is on a network the member co-owns — the same
            submit-time chain check VaultProposalsPanel applies, and the queue tab shows the result. */}
        {connectedInstance?.isSafe === true && connectedInstance.owner && typeof proposals?.propose === 'function' && (
          <div className="vault-details__governance" data-testid="vault-governance">
            <h5 className="vault-details__subheading">Owners &amp; threshold</h5>
            <p className="custody-hint" role="note">
              Changes are proposed on {chainDisplayName(Number(connectedInstance.chainId))} and wait in the queue for the
              other owners.
            </p>
            <OwnersThresholdPanel vault={connectedInstance} onPropose={proposeOnConnected} busy={govBusy} />
            {govError && (
              <p className="custody-error" role="alert">
                {govError}
              </p>
            )}
          </div>
        )}
      </section>

      {/* (d) Acting account */}
      <section className="vault-details__section" aria-labelledby="vault-details-acting">
        <h4 id="vault-details-acting">Acting account</h4>
        <div className="vault-details__acting" role="radiogroup" aria-label="Act as">
          {(switcher.accounts || []).map((acc) => {
            const current = acc.id === switcher.currentId
            const isThisVault = acc.kind === 'vault' && lc(acc.address) === lc(group.address)
            return (
              <button
                key={acc.id}
                type="button"
                role="radio"
                aria-checked={current}
                className={`vault-details__act-as${isThisVault ? ' is-this-vault' : ''}`}
                data-testid={`vault-act-as-${acc.id}`}
                onClick={() => {
                  if (!current) switcher.choose(acc)
                }}
              >
                <span>{acc.label || shortAccountAddr(acc.address)}</span>
                {acc.kind !== 'personal' && (
                  <span className="vault-details__act-as-kind">{ACCOUNT_KIND_TAG[acc.kind] || acc.kind}</span>
                )}
                <span className="vault-details__act-as-addr">{shortAccountAddr(acc.address)}</span>
              </button>
            )
          })}
        </div>
        <p className="custody-hint" role="note">
          Switching is instant and address-only; signing happens when you send.
        </p>
      </section>

      {/* (e) Danger */}
      <section className="vault-details__section" aria-labelledby="vault-details-danger">
        <h4 id="vault-details-danger">Remove</h4>
        <div className="vault-details__danger">
          {!confirmRemove ? (
            <button type="button" className="vault-details__danger-btn" onClick={() => setConfirmRemove(true)} data-testid="vault-remove">
              Remove from Protect
            </button>
          ) : (
            <>
              <p className="custody-hint">
                This forgets the vault on {listChainNames(chainIds)}. Nothing on chain changes; you can load it again later.
              </p>
              <button type="button" className="vault-details__danger-btn" onClick={remove} disabled={removing} data-testid="vault-remove-confirm">
                {removing ? 'Removing…' : `Remove on ${chainIds.length} network${chainIds.length === 1 ? '' : 's'}`}
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} disabled={removing}>
                Cancel
              </button>
            </>
          )}
        </div>
        {removeError && (
          <p className="custody-error" role="alert">
            {removeError}
          </p>
        )}
      </section>
    </div>
  )
}

VaultDetailsView.propTypes = {
  /** VaultGroup (lib/custody/vaultGroups). */
  group: PropTypes.object.isRequired,
  onClose: PropTypes.func,
  /** Fired after the list changed (probe added a network / vault removed). */
  onVaultsChanged: PropTypes.func,
}
