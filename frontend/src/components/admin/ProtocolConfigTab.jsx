import { useState, useEffect, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import { getContractAddressForChain } from '../../config/contracts'
import { isValidEthereumAddress } from '../../utils/validation'

/**
 * ProtocolConfigTab — the protocol wiring view of the operations control
 * plane (DEFAULT_ADMIN_ROLE).
 *
 * Before this view existed, an operator could not even READ the live wiring
 * (which sanctions guard, which oracle adapters, which stake tokens) without
 * a block explorer. Every setter here is a high-consequence config change —
 * each row shows the current value next to the input that replaces it.
 */
const REGISTRY_ABI = [
  'function membershipManager() view returns (address)',
  'function polymarketAdapter() view returns (address)',
  'function sanctionsGuard() view returns (address)',
  'function intentExtension() view returns (address)',
  'function oracleAdapters(uint8) view returns (address)',
  'function isTokenAllowed(address) view returns (bool)',
  'function setMembershipManager(address)',
  'function setPolymarketAdapter(address)',
  'function setSanctionsGuard(address)',
  'function setOracleAdapter(uint8 resolutionType, address adapter)',
  'function setTokenAllowed(address token, bool allowed)',
]

const MEMBERSHIP_ABI = [
  'function treasury() view returns (address)',
  'function paymentToken() view returns (address)',
  'function voucher() view returns (address)',
  'function sanctionsGuard() view returns (address)',
  'function setTreasury(address)',
  'function setPaymentToken(address)',
  'function setSanctionsGuard(address)',
  'function setAuthorizedCaller(address caller, bool authorized)',
  'function authorizedCallers(address) view returns (bool)',
]

const SANCTIONS_ABI = [
  'function sanctionsOracle() view returns (address)',
  'function setSanctionsOracle(address)',
]

// Oracle-routed subset of IWagerRegistryTypes.ResolutionType (indexes 5–7);
// 0–4 resolve socially or via the dedicated Polymarket adapter slot.
const ORACLE_TYPES = [
  { value: 5, label: 'Chainlink Data Feed' },
  { value: 6, label: 'Chainlink Functions' },
  { value: 7, label: 'UMA Optimistic Oracle' },
]

function shortAddr(a) {
  return a && a !== ethers.ZeroAddress ? `${a.substring(0, 6)}...${a.substring(a.length - 4)}` : ''
}

function WiringRow({ label, current, note }) {
  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <span className="status-value">
        {current === undefined ? '…'
          : current && current !== ethers.ZeroAddress
            ? <code title={current}>{shortAddr(current)}</code>
            : <span className="status-value paused">{note || 'unset'}</span>}
      </span>
    </div>
  )
}

function ProtocolConfigTab({ signer, chainId, provider, runTx, pendingTx }) {
  const registryAddr = getContractAddressForChain('wagerRegistry', chainId)
  const membershipAddr = getContractAddressForChain('membershipManager', chainId)
  const sanctionsAddr = getContractAddressForChain('sanctionsGuard', chainId)

  const [wiring, setWiring] = useState({})
  const [addrForm, setAddrForm] = useState({ target: 'registry-sanctions', address: '' })
  const [oracleForm, setOracleForm] = useState({ type: 5, address: '' })
  const [tokenForm, setTokenForm] = useState({ address: '', allowed: true, status: null })
  const [callerForm, setCallerForm] = useState({ address: '', authorized: true })

  const registryRead = useMemo(
    () => (registryAddr && provider ? new ethers.Contract(registryAddr, REGISTRY_ABI, provider) : null),
    [registryAddr, provider]
  )
  const membershipRead = useMemo(
    () => (membershipAddr && provider ? new ethers.Contract(membershipAddr, MEMBERSHIP_ABI, provider) : null),
    [membershipAddr, provider]
  )
  const sanctionsRead = useMemo(
    () => (sanctionsAddr && provider ? new ethers.Contract(sanctionsAddr, SANCTIONS_ABI, provider) : null),
    [sanctionsAddr, provider]
  )

  const fetchWiring = useCallback(async () => {
    if (!registryRead) return
    const safe = (p) => p.catch(() => undefined)
    const [mm, pm, sg, ext, cdf, cf, uma, treasury, payToken, voucher, mmSg, oracle] =
      await Promise.all([
        safe(registryRead.membershipManager()),
        safe(registryRead.polymarketAdapter()),
        safe(registryRead.sanctionsGuard()),
        safe(registryRead.intentExtension()),
        safe(registryRead.oracleAdapters(5)),
        safe(registryRead.oracleAdapters(6)),
        safe(registryRead.oracleAdapters(7)),
        membershipRead ? safe(membershipRead.treasury()) : undefined,
        membershipRead ? safe(membershipRead.paymentToken()) : undefined,
        membershipRead ? safe(membershipRead.voucher()) : undefined,
        membershipRead ? safe(membershipRead.sanctionsGuard()) : undefined,
        sanctionsRead ? safe(sanctionsRead.sanctionsOracle()) : undefined,
      ])
    setWiring({ mm, pm, sg, ext, cdf, cf, uma, treasury, payToken, voucher, mmSg, oracle })
  }, [registryRead, membershipRead, sanctionsRead])

  useEffect(() => {
    fetchWiring()
  }, [fetchWiring])

  // One form drives all single-address setters; this table routes each choice
  // to the right contract + method and flags screening-disable cases.
  const ADDRESS_TARGETS = {
    'registry-sanctions': {
      label: 'WagerRegistry → sanctions guard', addr: () => registryAddr, abi: REGISTRY_ABI,
      method: 'setSanctionsGuard', danger: 'address(0) disables sanctions screening on the registry',
    },
    'registry-membership': {
      label: 'WagerRegistry → membership manager', addr: () => registryAddr, abi: REGISTRY_ABI,
      method: 'setMembershipManager',
    },
    'registry-polymarket': {
      label: 'WagerRegistry → Polymarket adapter', addr: () => registryAddr, abi: REGISTRY_ABI,
      method: 'setPolymarketAdapter',
    },
    'membership-treasury': {
      label: 'MembershipManager → treasury', addr: () => membershipAddr, abi: MEMBERSHIP_ABI,
      method: 'setTreasury', danger: 'all future fee withdrawals default to this address',
    },
    'membership-paytoken': {
      label: 'MembershipManager → payment token', addr: () => membershipAddr, abi: MEMBERSHIP_ABI,
      method: 'setPaymentToken',
    },
    'membership-sanctions': {
      label: 'MembershipManager → sanctions guard', addr: () => membershipAddr, abi: MEMBERSHIP_ABI,
      method: 'setSanctionsGuard', danger: 'address(0) disables sanctions screening on memberships',
    },
    'guard-oracle': {
      label: 'SanctionsGuard → Chainalysis oracle', addr: () => sanctionsAddr, abi: SANCTIONS_ABI,
      method: 'setSanctionsOracle', danger: 'address(0) disables oracle screening (deny-list still applies)',
    },
  }

  const selectedTarget = ADDRESS_TARGETS[addrForm.target]

  const handleSetAddress = () => {
    const value = addrForm.address.trim()
    // address(0) is a legitimate—but destructive—input for the guard slots, so
    // accept it explicitly rather than through the generic validator.
    const isClearing = value === ethers.ZeroAddress
    if (!isClearing && !isValidEthereumAddress(value)) return
    const target = selectedTarget
    runTx(
      () => new ethers.Contract(target.addr(), target.abi, signer)[target.method](value),
      `${target.label} set to ${isClearing ? 'address(0)' : shortAddr(value)}`
    ).then(fetchWiring)
  }

  const handleSetOracleAdapter = () => {
    if (!registryAddr || !isValidEthereumAddress(oracleForm.address)) return
    const typeLabel = ORACLE_TYPES.find((t) => t.value === oracleForm.type)?.label
    runTx(
      () => new ethers.Contract(registryAddr, REGISTRY_ABI, signer)
        .setOracleAdapter(oracleForm.type, oracleForm.address),
      `${typeLabel} adapter set to ${shortAddr(oracleForm.address)}`
    ).then(fetchWiring)
  }

  const handleCheckToken = async () => {
    if (!registryRead || !isValidEthereumAddress(tokenForm.address)) return
    const allowed = await registryRead.isTokenAllowed(tokenForm.address).catch(() => null)
    setTokenForm((f) => ({ ...f, status: allowed }))
  }

  const handleSetTokenAllowed = () => {
    if (!registryAddr || !isValidEthereumAddress(tokenForm.address)) return
    runTx(
      () => new ethers.Contract(registryAddr, REGISTRY_ABI, signer)
        .setTokenAllowed(tokenForm.address, tokenForm.allowed),
      `Stake token ${shortAddr(tokenForm.address)} ${tokenForm.allowed ? 'allowed' : 'disallowed'}`
    ).then(() => setTokenForm((f) => ({ ...f, status: f.allowed })))
  }

  const handleSetAuthorizedCaller = () => {
    if (!membershipAddr || !isValidEthereumAddress(callerForm.address)) return
    runTx(
      () => new ethers.Contract(membershipAddr, MEMBERSHIP_ABI, signer)
        .setAuthorizedCaller(callerForm.address, callerForm.authorized),
      `Caller ${shortAddr(callerForm.address)} ${callerForm.authorized ? 'authorized' : 'deauthorized'} on MembershipManager`
    )
  }

  return (
    <div className="admin-tab-content" role="tabpanel">
      <div className="admin-card">
        <div className="admin-card-header">
          <h3>Live Wiring</h3>
          <button type="button" className="refresh-btn" onClick={fetchWiring} aria-label="Refresh wiring">↻</button>
        </div>
        <div className="status-details">
          <WiringRow label="WagerRegistry → membership manager" current={wiring.mm} />
          <WiringRow label="WagerRegistry → sanctions guard" current={wiring.sg} note="screening OFF" />
          <WiringRow label="WagerRegistry → Polymarket adapter" current={wiring.pm} />
          <WiringRow label="WagerRegistry → intents facet" current={wiring.ext} />
          <WiringRow label="Oracle adapter: Chainlink Data Feed" current={wiring.cdf} />
          <WiringRow label="Oracle adapter: Chainlink Functions" current={wiring.cf} />
          <WiringRow label="Oracle adapter: UMA" current={wiring.uma} />
          <WiringRow label="MembershipManager → treasury" current={wiring.treasury} />
          <WiringRow label="MembershipManager → payment token" current={wiring.payToken} />
          <WiringRow label="MembershipManager → voucher" current={wiring.voucher} />
          <WiringRow label="MembershipManager → sanctions guard" current={wiring.mmSg} note="screening OFF" />
          <WiringRow label="SanctionsGuard → Chainalysis oracle" current={wiring.oracle} note="oracle screening OFF" />
        </div>
        <p className="card-info">
          The intents facet is set via <code>setIntentExtension</code> (UPGRADER_ROLE, floppy
          keystore) and is shown read-only — swap it only through the upgrade runbook.
        </p>
      </div>

      <div className="admin-card">
        <h3>Rewire Address</h3>
        <p>
          Changes take effect immediately for all users. For guard slots,{' '}
          <code>0x000…000</code> disables screening — this is logged on-chain and should follow
          the compliance runbook.
        </p>
        <div className="admin-form">
          <label>
            Target
            <select value={addrForm.target}
              onChange={(e) => setAddrForm({ ...addrForm, target: e.target.value })}>
              {Object.entries(ADDRESS_TARGETS).map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
          </label>
          <label>
            New address
            <input type="text" placeholder="0x…" value={addrForm.address}
              onChange={(e) => setAddrForm({ ...addrForm, address: e.target.value })} />
            {selectedTarget?.danger && (
              <span className="hint">⚠ {selectedTarget.danger}</span>
            )}
          </label>
          <button className="confirm-btn danger" onClick={handleSetAddress}
            disabled={pendingTx || !signer || !addrForm.address || !selectedTarget?.addr()}>
            {pendingTx ? 'Processing...' : 'Set Address'}
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h3>Oracle Adapter Routing</h3>
        <p>Route a resolution type to its adapter contract on WagerRegistry.</p>
        <div className="admin-form">
          <label>
            Resolution type
            <select value={oracleForm.type}
              onChange={(e) => setOracleForm({ ...oracleForm, type: Number(e.target.value) })}>
              {ORACLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label>
            Adapter address
            <input type="text" placeholder="0x…" value={oracleForm.address}
              onChange={(e) => setOracleForm({ ...oracleForm, address: e.target.value })} />
          </label>
          <button className="confirm-btn primary" onClick={handleSetOracleAdapter}
            disabled={pendingTx || !signer || !oracleForm.address || !registryAddr}>
            {pendingTx ? 'Processing...' : 'Set Adapter'}
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h3>Stake Token Allowlist</h3>
        <p>Which ERC-20s can be escrowed as wager stakes. Disallowing a token blocks new wagers only — existing escrow settles normally.</p>
        <div className="admin-form">
          <label>
            Token address
            <input type="text" placeholder="0x…" value={tokenForm.address}
              onChange={(e) => setTokenForm({ ...tokenForm, address: e.target.value, status: null })} />
            {tokenForm.status != null && (
              <span className="hint">Currently {tokenForm.status ? 'allowed' : 'not allowed'}</span>
            )}
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={tokenForm.allowed}
              onChange={(e) => setTokenForm({ ...tokenForm, allowed: e.target.checked })} />
            Allowed as stake token
          </label>
          <div className="emergency-actions">
            <button type="button" className="confirm-btn secondary" onClick={handleCheckToken}
              disabled={!tokenForm.address}>
              Check Current
            </button>
            <button className="confirm-btn primary" onClick={handleSetTokenAllowed}
              disabled={pendingTx || !signer || !tokenForm.address || !registryAddr}>
              {pendingTx ? 'Processing...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Membership Hook Callers</h3>
        <p>
          Contracts authorized to record market open/close counts on MembershipManager
          (normally just the WagerRegistry proxy). Only change during a registry migration.
        </p>
        <div className="admin-form">
          <label>
            Caller address
            <input type="text" placeholder="0x…" value={callerForm.address}
              onChange={(e) => setCallerForm({ ...callerForm, address: e.target.value })} />
          </label>
          <label className="admin-checkbox">
            <input type="checkbox" checked={callerForm.authorized}
              onChange={(e) => setCallerForm({ ...callerForm, authorized: e.target.checked })} />
            Authorized
          </label>
          <button className="confirm-btn danger" onClick={handleSetAuthorizedCaller}
            disabled={pendingTx || !signer || !callerForm.address || !membershipAddr}>
            {pendingTx ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProtocolConfigTab
