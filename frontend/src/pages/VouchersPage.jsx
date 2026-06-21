import { useState, useEffect, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet } from '../hooks/useWalletManagement'
import { useVouchers } from '../hooks/useVouchers'
import { useTierPrices } from '../hooks/useTierPrices'
import { TIER_NAMES, TIER_COLORS } from '../hooks/useRoleDetails'
import { MEMBERSHIP_VOUCHERS_TERMS_PATH } from '../constants/legalLinks'
import Button from '../components/ui/Button'
import './vouchers.css'

const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']
const MAX_QUANTITY = 50

/**
 * VouchersPage (spec 026): buy membership vouchers — a quantity at once, optionally gifted directly to another
 * address — or redeem one you hold into a soulbound membership for the connected wallet. The redeem section
 * lists the wallet's held vouchers (on-chain) so the user picks one instead of typing a token id. Addresses/
 * ABIs come from synced config (Principle V); privacy is disclosed honestly.
 */
export default function VouchersPage() {
  const { account, isConnected } = useWallet()
  const { getPrice, ROLE_HASHES, TIER_IDS } = useTierPrices()
  const {
    status, error, lastTxHash, voucherAvailable, batchMintAvailable,
    mintVouchers, redeemVoucher, listMyVouchers,
  } = useVouchers()
  const { hash } = useLocation()

  const [selectedTier, setSelectedTier] = useState('BRONZE')
  const [quantity, setQuantity] = useState(1)
  const [recipient, setRecipient] = useState('')
  const [minted, setMinted] = useState(null)

  const [myVouchers, setMyVouchers] = useState([])
  const [loadingVouchers, setLoadingVouchers] = useState(false)
  const [selectedVoucherId, setSelectedVoucherId] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [redeemed, setRedeemed] = useState(false)

  const role = ROLE_HASHES.WAGER_PARTICIPANT
  const busy = status === 'minting' || status === 'redeeming'

  // Deep links from the "Get Wager Access" modal (#vch-buy-h / #vch-redeem-h) scroll to the section.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const refreshVouchers = useCallback(async () => {
    if (!voucherAvailable || !account) {
      setMyVouchers([])
      return
    }
    setLoadingVouchers(true)
    try {
      const held = await listMyVouchers()
      setMyVouchers(held)
      // Drop a selection that's no longer held (e.g. after redeeming it).
      setSelectedVoucherId((cur) => (held.some((v) => v.tokenId === cur) ? cur : ''))
    } finally {
      setLoadingVouchers(false)
    }
  }, [voucherAvailable, account, listMyVouchers])

  // Load the wallet's vouchers on mount and whenever the wallet/network changes.
  useEffect(() => {
    refreshVouchers()
  }, [refreshVouchers])

  if (!isConnected) return <Navigate to="/" replace />

  const giftMode = recipient.trim().length > 0
  const recipientValid = !giftMode || ethers.isAddress(recipient.trim())
  const qtyNum = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number(quantity) || 1)))
  const unitPrice = getPrice('WAGER_PARTICIPANT', selectedTier)
  const totalPrice = unitPrice * qtyNum
  // Multiple or gifting needs the batch helper; a single self-purchase does not.
  const needsHelper = qtyNum > 1 || giftMode
  const buyBlocked = needsHelper && !batchMintAvailable

  async function onBuy() {
    setMinted(null)
    try {
      const res = await mintVouchers(role, TIER_IDS[selectedTier], qtyNum, recipient)
      setMinted(res)
      // Holdings only change if you bought for yourself.
      if (!res.gift) refreshVouchers()
    } catch {
      /* error surfaced via hook state */
    }
  }

  async function onRedeem() {
    setRedeemed(false)
    if (!selectedVoucherId) return
    try {
      // NOTE: pass the in-force Terms version hash here once wired (spec 007); the contract records whatever
      // hash is supplied for the redeemer. The checkbox captures explicit consent in the UI.
      await redeemVoucher(selectedVoucherId, undefined)
      setRedeemed(true)
      refreshVouchers()
    } catch {
      /* error surfaced via hook state */
    }
  }

  return (
    <div className="vch-page">
      <header className="vch-header">
        <h1>Membership Vouchers</h1>
        <p className="vch-sub">
          A voucher is a transferable token that can be gifted or resold. Redeeming one mints the same
          soulbound membership you would get by buying directly — it just lets someone else buy it for you, or
          you resell it if your plans change.
        </p>
      </header>

      <aside className="vch-privacy" role="note" aria-label="Privacy information">
        <strong>Privacy, honestly:</strong> voucher mints, transfers, and burns are public on-chain. Redeeming
        from a <em>fresh wallet</em> (one that received the voucher) keeps your membership from being linked to
        the wallet that bought it — this is pseudonymity, not cryptographic anonymity.
      </aside>

      {!voucherAvailable && (
        <div className="vch-unavailable" role="status">
          Membership vouchers aren’t available on this network yet. Switch to a supported network or check back
          after the next deployment.
        </div>
      )}

      {/* Live status / errors */}
      <div className="vch-status" role="status" aria-live="polite" aria-atomic="true">
        {status === 'minting' && 'Submitting your purchase…'}
        {status === 'redeeming' && 'Redeeming…'}
        {error && <span className="vch-error">{error}</span>}
        {lastTxHash && !error && <span className="vch-tx">tx: {lastTxHash.slice(0, 10)}…</span>}
      </div>

      <section className="vch-card" aria-labelledby="vch-buy-h">
        <h2 id="vch-buy-h">Buy a voucher</h2>
        <fieldset className="vch-tiers" disabled={!voucherAvailable || busy}>
          <legend>Choose a tier</legend>
          {TIER_ORDER.map((tierKey) => {
            const id = TIER_IDS[tierKey]
            const price = getPrice('WAGER_PARTICIPANT', tierKey)
            return (
              <label key={tierKey} className={`vch-tier ${selectedTier === tierKey ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="voucher-tier"
                  value={tierKey}
                  checked={selectedTier === tierKey}
                  onChange={() => setSelectedTier(tierKey)}
                />
                <span className="vch-tier-badge" style={{ backgroundColor: TIER_COLORS[id] }}>
                  {TIER_NAMES[id]}
                </span>
                <span className="vch-tier-price">${price} USDC</span>
              </label>
            )
          })}
        </fieldset>

        <div className="vch-buy-row">
          <label className="vch-field">
            <span>Quantity</span>
            <input
              className="vch-input vch-qty"
              type="number"
              min="1"
              max={MAX_QUANTITY}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!voucherAvailable || busy}
            />
          </label>
          <label className="vch-field vch-field-grow">
            <span>Gift to address <em>(optional)</em></span>
            <input
              className={`vch-input ${giftMode && !recipientValid ? 'vch-input-error' : ''}`}
              type="text"
              spellCheck="false"
              autoComplete="off"
              placeholder="0x… — leave blank to buy for yourself"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              disabled={!voucherAvailable || busy}
            />
          </label>
        </div>
        {giftMode && !recipientValid && (
          <p className="vch-warn" role="status">That doesn’t look like a valid wallet address.</p>
        )}
        {buyBlocked && (
          <p className="vch-warn" role="status">
            Buying more than one or gifting to another address isn’t available on this network yet — you can
            buy a single voucher for yourself.
          </p>
        )}

        <Button
          variant="primary"
          onClick={onBuy}
          loading={status === 'minting'}
          disabled={!voucherAvailable || busy || buyBlocked || !recipientValid}
        >
          {giftMode
            ? `Gift ${qtyNum} ${TIER_NAMES[TIER_IDS[selectedTier]]} voucher${qtyNum > 1 ? 's' : ''} ($${totalPrice} USDC)`
            : `Buy ${qtyNum} ${TIER_NAMES[TIER_IDS[selectedTier]]} voucher${qtyNum > 1 ? 's' : ''} ($${totalPrice} USDC)`}
        </Button>
        {minted && (
          <p className="vch-success" role="status">
            {minted.gift
              ? `Sent ${minted.count} voucher${minted.count > 1 ? 's' : ''} to ${minted.recipient.slice(0, 6)}…${minted.recipient.slice(-4)}.`
              : `${minted.count} voucher${minted.count > 1 ? 's' : ''} minted to your wallet. Redeem below, or send to anyone.`}
          </p>
        )}
        <p className="vch-fineprint">
          A small resale royalty (2.5%) is suggested to marketplaces and goes to the treasury. The voucher is a
          utility access token, not an investment.
        </p>
      </section>

      <section className="vch-card" aria-labelledby="vch-redeem-h">
        <h2 id="vch-redeem-h">Redeem a voucher</h2>
        <p className="vch-help">
          Redeeming burns the voucher and grants the membership to <strong>this connected wallet</strong>
          {account ? ` (${account.slice(0, 6)}…${account.slice(-4)})` : ''}. To keep it private, redeem from a
          fresh wallet that you transferred the voucher to.
        </p>

        <div className="vch-myvouchers-head">
          <span className="vch-myvouchers-title">Your vouchers</span>
          <button
            type="button"
            className="vch-refresh"
            onClick={refreshVouchers}
            disabled={!voucherAvailable || loadingVouchers || busy}
          >
            {loadingVouchers ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {loadingVouchers && myVouchers.length === 0 && (
          <p className="vch-help" role="status">Looking up your vouchers…</p>
        )}

        {!loadingVouchers && voucherAvailable && myVouchers.length === 0 && (
          <p className="vch-empty" role="status">
            You don’t have any vouchers to redeem. Buy one above, or ask whoever gifted you a voucher to send it
            to this wallet.
          </p>
        )}

        {myVouchers.length > 0 && (
          <fieldset className="vch-voucher-list" disabled={!voucherAvailable || busy}>
            <legend>Choose a voucher to redeem</legend>
            {myVouchers.map((v) => (
              <label
                key={v.tokenId}
                className={`vch-voucher-item ${selectedVoucherId === v.tokenId ? 'is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="redeem-voucher"
                  value={v.tokenId}
                  checked={selectedVoucherId === v.tokenId}
                  onChange={() => setSelectedVoucherId(v.tokenId)}
                />
                <span className="vch-tier-badge" style={{ backgroundColor: TIER_COLORS[v.tier] }}>
                  {TIER_NAMES[v.tier]}
                </span>
                <span className="vch-voucher-meta">{v.durationDays}-day membership</span>
                <span className="vch-voucher-id">#{v.tokenId}</span>
              </label>
            ))}
          </fieldset>
        )}

        <label className="vch-terms">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={!voucherAvailable || busy || myVouchers.length === 0}
          />
          I accept the{' '}
          <a href={MEMBERSHIP_VOUCHERS_TERMS_PATH} target="_blank" rel="noopener noreferrer">
            Terms &amp; Conditions
          </a>{' '}
          (including the membership voucher terms) and confirm I’m eligible.
        </label>

        <Button
          variant="primary"
          onClick={onRedeem}
          loading={status === 'redeeming'}
          disabled={!voucherAvailable || !selectedVoucherId || !acceptedTerms || busy}
        >
          Redeem to this wallet
        </Button>
        {redeemed && (
          <p className="vch-success" role="status">
            Redeemed — your membership is now active on this wallet.
          </p>
        )}
      </section>
    </div>
  )
}
