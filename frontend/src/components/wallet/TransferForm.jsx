import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSwitchChain } from 'wagmi'
import AddressInput from '../ui/AddressInput'
import AddressBookButton from '../ui/AddressBookButton'
import QRScanner from '../ui/QRScanner'
import SensitiveValue from '../common/SensitiveValue'
import TransferAssetSelect from './TransferAssetSelect'
import TransferFromSelect from './TransferFromSelect'
import { useTransfer, TRANSFER_KIND } from '../../hooks/useTransfer'
import { useWallet } from '../../hooks/useWalletManagement'
import { useActiveAccount } from '../../hooks/useActiveAccount'
import { useCustodyVaults } from '../../hooks/useCustodyVaults'
import usePortfolio from '../../hooks/usePortfolio'
import { useAddressScreening } from '../../hooks/useAddressScreening'
import { useNotification } from '../../hooks/useUI'
import { extractAddressFromScan } from '../../lib/addressBook/scanAddress'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
const toNum = (v) => (v == null || v === '' ? null : Number(v))

/**
 * Transfer tab — send any asset from the connected account's cross-network portfolio to an address/ENS name.
 *
 * Flexibility (this spec): the asset is a dropdown of every transferable portfolio holding, the "From" is a
 * dropdown of the connected wallet plus Protect (custody) vaults, and the gasless badge reflects each asset's
 * OWN network capability. Because a transfer is signed on the connected chain, an asset on another network is
 * gated behind a "Switch to {network}" step before Preview/Send. Sending from a vault creates a threshold
 * proposal (useActiveAccount) rather than an immediate transfer.
 */
export default function TransferForm({ onSent }) {
  const {
    send, status, error, quoteGaslessForAsset, balanceOf, refreshBalances, tokens, isPasskey,
  } = useTransfer()
  const { address, chainId } = useWallet()
  const { identity, isVault, operateAsPersonal, operateAsVault } = useActiveAccount()
  const { vaults } = useCustodyVaults()
  const portfolio = usePortfolio()
  const { screenOne } = useAddressScreening()
  const { showNotification } = useNotification()
  const { switchChainAsync, isPending: switching } = useSwitchChain()

  const [selectedKey, setSelectedKey] = useState(null)
  const [toRaw, setToRaw] = useState('')
  const [toResolved, setToResolved] = useState('')
  const [amount, setAmount] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [screening, setScreening] = useState(null) // null | 'clear' | 'restricted' | 'uncertain'
  const [formError, setFormError] = useState(null)
  const [scanOpen, setScanOpen] = useState(false)

  const connectedChainId = Number(chainId)
  const busy = status === 'signing' || status === 'submitting' || status === 'pending'

  useEffect(() => { refreshBalances() }, [refreshBalances])

  // Compose the asset dropdown: every held portfolio asset across networks, plus the connected chain's
  // native + stablecoin (always present so the form is usable before the portfolio loads / at zero balance).
  // Keyed by `${chainId}:${registryId}` so the synthesized defaults merge with their portfolio row.
  const assetOptions = useMemo(() => {
    const byKey = new Map()
    const put = (opt) => byKey.set(opt.key, { ...(byKey.get(opt.key) || {}), ...opt })

    if (tokens.native) {
      put({
        key: `${connectedChainId}:native`,
        chainId: connectedChainId,
        kind: 'native',
        address: null,
        symbol: tokens.native,
        name: tokens.nativeName,
        decimals: tokens.nativeDecimals,
        networkName: tokens.networkName,
        balance: toNum(balanceOf(TRANSFER_KIND.NATIVE)),
      })
    }
    if (tokens.stableAddress) {
      put({
        key: `${connectedChainId}:${tokens.stableAddress.toLowerCase()}`,
        chainId: connectedChainId,
        kind: 'erc20',
        address: tokens.stableAddress,
        symbol: tokens.stable,
        name: tokens.stableName,
        decimals: tokens.stableDecimals,
        networkName: tokens.networkName,
        balance: toNum(balanceOf(TRANSFER_KIND.STABLE)),
      })
    }
    for (const h of portfolio.holdings || []) {
      if (h.asset.kind !== 'native' && h.asset.kind !== 'erc20') continue // no NFTs in a value transfer
      if (!(h.balance > 0)) continue
      put({
        key: `${Number(h.asset.chainId)}:${String(h.asset.id).toLowerCase()}`,
        chainId: Number(h.asset.chainId),
        kind: h.asset.kind,
        address: h.asset.address || null,
        symbol: h.asset.symbol,
        name: h.asset.name,
        decimals: h.asset.decimals,
        networkName: h.network,
        balance: h.balance,
      })
    }

    return [...byKey.values()].sort((a, b) => {
      const ac = a.chainId === connectedChainId ? 0 : 1
      const bc = b.chainId === connectedChainId ? 0 : 1
      if (ac !== bc) return ac - bc
      return (b.balance ?? 0) - (a.balance ?? 0)
    })
  }, [portfolio.holdings, tokens, connectedChainId, balanceOf])

  // Default to the connected chain's stablecoin, then its native coin, then whatever's first.
  const defaultKey = useMemo(() => {
    const stable = assetOptions.find(
      (o) => o.chainId === connectedChainId && o.address && tokens.stableAddress &&
        o.address.toLowerCase() === tokens.stableAddress.toLowerCase(),
    )
    if (stable) return stable.key
    const native = assetOptions.find((o) => o.chainId === connectedChainId && o.kind === 'native')
    return (native || assetOptions[0])?.key || null
  }, [assetOptions, connectedChainId, tokens.stableAddress])

  const activeKey = selectedKey && assetOptions.some((o) => o.key === selectedKey) ? selectedKey : defaultKey
  const selectedAsset = assetOptions.find((o) => o.key === activeKey) || null

  const onConnectedChain = selectedAsset && Number(selectedAsset.chainId) === connectedChainId
  const gasless = selectedAsset ? quoteGaslessForAsset(selectedAsset) : false
  const bal = selectedAsset?.balance ?? null
  const symbol = selectedAsset?.symbol || ''

  // "From" accounts: the personal wallet plus every custody vault surfaced in Protect (on this network).
  const fromAccounts = useMemo(() => {
    const list = [{ id: 'personal', kind: 'personal', label: '', address, chainId: connectedChainId }]
    for (const v of vaults || []) {
      if (v.isSafe === false) continue
      list.push({
        id: `vault:${v.address}`,
        kind: 'vault',
        label: v.label || `Vault ${short(v.address)}`,
        address: v.address,
        chainId: Number(v.chainId),
      })
    }
    return list
  }, [address, vaults, connectedChainId])

  const fromValue = isVault && identity?.vaultAddress ? `vault:${identity.vaultAddress}` : 'personal'

  const handleFromChange = useCallback(
    (account) => {
      if (account.kind === 'vault') {
        operateAsVault({ address: account.address, chainId: account.chainId, label: account.label })
      } else {
        operateAsPersonal()
      }
    },
    [operateAsVault, operateAsPersonal],
  )

  // Advisory sanctions pre-check on the resolved recipient, against the SELECTED asset's chain.
  useEffect(() => {
    let cancelled = false
    if (!toResolved) { setScreening(null); return undefined }
    setScreening(null)
    Promise.resolve(screenOne(toResolved, selectedAsset?.chainId ?? connectedChainId))
      .then((s) => { if (!cancelled) setScreening(s) })
      .catch(() => { if (!cancelled) setScreening('uncertain') })
    return () => { cancelled = true }
  }, [toResolved, screenOne, selectedAsset?.chainId, connectedChainId])

  const amountValid = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0
  }, [amount])

  // A vault send is a proposal validated by its signers later, so the connected wallet's balance doesn't gate it.
  const overBalance = useMemo(() => {
    if (isVault || bal == null || !amountValid) return false
    return Number(amount) > Number(bal)
  }, [isVault, bal, amount, amountValid])

  const canPreview =
    Boolean(selectedAsset) && onConnectedChain && Boolean(toResolved) && amountValid && !overBalance &&
    screening !== 'restricted' && !busy

  const handleMax = useCallback(() => {
    if (!isVault && bal != null) setAmount(String(bal))
  }, [isVault, bal])

  const resetForm = useCallback(() => {
    setToRaw(''); setToResolved(''); setAmount(''); setPreviewing(false); setScreening(null); setFormError(null)
  }, [])

  const applyAddress = useCallback((addr) => {
    setToRaw(addr)
    setToResolved(addr)
  }, [])

  const handleScan = useCallback((decodedText) => {
    const addr = extractAddressFromScan(decodedText)
    if (addr) applyAddress(addr)
    setScanOpen(false)
  }, [applyAddress])

  const handleSelectAsset = useCallback((option) => {
    setSelectedKey(option.key)
    setPreviewing(false)
    setFormError(null)
  }, [])

  const handleSwitch = useCallback(async () => {
    if (!selectedAsset) return
    setFormError(null)
    try {
      await switchChainAsync({ chainId: selectedAsset.chainId })
    } catch (err) {
      setFormError(err?.shortMessage || err?.message || 'Could not switch network.')
    }
  }, [selectedAsset, switchChainAsync])

  const handleSend = useCallback(async () => {
    setFormError(null)
    try {
      const res = await send({ asset: selectedAsset, to: toResolved, amount })
      if (res?.proposed) {
        showNotification(
          `Proposed sending ${amount} ${symbol} to ${short(toResolved)} from the vault — its signers must approve it.`,
          'info',
        )
      } else if (res?.pending) {
        // Submitted but not yet confirmed on-chain (a stalled/never-included UserOp): tell the truth.
        showNotification(
          `Submitted ${amount} ${symbol} to ${short(toResolved)} — still confirming on-chain. It will show as complete in Activity once settled.`,
          'info',
        )
      } else {
        showNotification(
          `Sent ${amount} ${symbol} to ${short(toResolved)}${res.route === 'gasless' ? ' (gasless)' : ''}.`,
          'success',
        )
      }
      resetForm()
      onSent?.(res)
    } catch (err) {
      setFormError(err?.shortMessage || err?.message || 'Transfer failed.')
    }
  }, [send, selectedAsset, toResolved, amount, symbol, showNotification, resetForm, onSent])

  return (
    <div className="pt-form">
      {/* Asset selector — the whole cross-network portfolio */}
      <div className="pt-field">
        <span className="pt-label">Asset</span>
        <TransferAssetSelect
          options={assetOptions}
          value={activeKey}
          onChange={handleSelectAsset}
          isGasless={quoteGaslessForAsset}
          disabled={busy}
        />
        {gasless ? (
          <span className="pt-badge pt-badge-gasless">⚡ Gasless{isPasskey ? ' · sponsored' : ''}</span>
        ) : (
          <span className="pt-badge pt-badge-fee">Network fee applies</span>
        )}
      </div>

      {!previewing ? (
        <>
          {/* From — connected wallet or a Protect vault */}
          <div className="pt-field">
            <span className="pt-label">From</span>
            <TransferFromSelect
              accounts={fromAccounts}
              value={fromValue}
              onChange={handleFromChange}
              disabled={busy}
            />
            {isVault && (
              <span className="pt-hint">
                Sending from a vault creates a proposal for its signers to approve. Balances shown are your
                connected wallet&apos;s.
              </span>
            )}
          </div>

          {/* To — the standard address entry (ENS resolution + address book + QR scan) */}
          <div className="pt-field">
            <label className="pt-label" htmlFor="pt-to">To</label>
            <div className="pt-input-with-action">
              <div className="pt-address-input-wrap">
                <AddressInput
                  id="pt-to"
                  value={toRaw}
                  onChange={(e) => setToRaw(e.target.value)}
                  onResolvedChange={(addr) => setToResolved(addr || '')}
                  chainId={selectedAsset?.chainId ?? connectedChainId}
                  placeholder="0x… or ENS name (e.g., vitalik.eth)"
                  disabled={busy}
                />
              </div>
              <AddressBookButton disabled={busy} onSelect={(entry) => applyAddress(entry.address)} />
              <button
                type="button"
                className="pt-scan-btn"
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
            <QRScanner isOpen={scanOpen} onClose={() => setScanOpen(false)} onScanSuccess={handleScan} />
            {screening === 'restricted' && (
              <div className="pt-notice pt-notice-error" role="alert">
                This address is flagged by sanctions screening. Transfers to it are blocked.
              </div>
            )}
            {screening === 'uncertain' && toResolved && (
              <span className="pt-hint">Screening unavailable — proceed with care.</span>
            )}
          </div>

          {/* Amount */}
          <div className="pt-field">
            <label className="pt-label" htmlFor="pt-amount">Amount</label>
            <div className="pt-amount-row">
              <input
                id="pt-amount"
                className="pt-amount-input"
                inputMode="decimal"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                disabled={busy}
                aria-describedby="pt-amount-hint"
              />
              <button type="button" className="pt-max" onClick={handleMax} disabled={isVault || bal == null || busy}>MAX</button>
              <span className="pt-amount-sym">{symbol}</span>
            </div>
            <span className="pt-hint" id="pt-amount-hint">
              {bal != null
                ? <>Balance: <SensitiveValue>{bal}</SensitiveValue> {symbol}</>
                : 'Loading balance…'}
              {overBalance && ' · exceeds balance'}
            </span>
          </div>

          {(error || formError) && (
            <div className="pt-notice pt-notice-error" role="alert">{formError || error}</div>
          )}

          <div className="pt-actions">
            {selectedAsset && !onConnectedChain ? (
              <button
                type="button"
                className="pt-btn pt-btn-primary"
                onClick={handleSwitch}
                disabled={switching || busy}
              >
                {switching ? 'Switching…' : `Switch to ${selectedAsset.networkName} to send`}
              </button>
            ) : (
              <button
                type="button"
                className="pt-btn pt-btn-primary"
                onClick={() => setPreviewing(true)}
                disabled={!canPreview}
              >
                Preview
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="pt-preview" aria-live="polite">
            <div className="pt-preview-amount">{amount} {symbol}</div>
            <div className="pt-preview-row"><span className="k">To</span><span className="v">{short(toResolved)}</span></div>
            <div className="pt-preview-row"><span className="k">Network</span><span className="v">{selectedAsset?.networkName}</span></div>
            <div className="pt-preview-row">
              <span className="k">Fee</span>
              <span className="v">{gasless ? 'Gasless — no network fee' : `You pay the ${tokens.native} network fee`}</span>
            </div>
            {isVault && (
              <div className="pt-preview-row">
                <span className="k">Sending as</span>
                <span className="v">Vault proposal</span>
              </div>
            )}
          </div>

          {(error || formError) && (
            <div className="pt-notice pt-notice-error" role="alert">{formError || error}</div>
          )}

          <div className="pt-actions">
            <button type="button" className="pt-btn pt-btn-secondary" onClick={() => setPreviewing(false)} disabled={busy}>
              Back
            </button>
            <button type="button" className="pt-btn pt-btn-primary" onClick={handleSend} disabled={busy}>
              {busy ? (status === 'signing' ? 'Confirm in wallet…' : 'Sending…') : isVault ? 'Propose' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
