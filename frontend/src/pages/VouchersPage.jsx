import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useWallet } from '../hooks/useWalletManagement'
import { useVouchers } from '../hooks/useVouchers'
import { useTierPrices } from '../hooks/useTierPrices'
import { TIER_NAMES, TIER_COLORS } from '../hooks/useRoleDetails'
import Button from '../components/ui/Button'
import './vouchers.css'

const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']

/**
 * VouchersPage (spec 026): buy a transferable membership voucher (gift/resell it), or redeem one you hold into
 * a soulbound membership for the connected wallet. The full "my vouchers" list arrives with the subgraph;
 * v1 redeems by token id. Addresses/ABIs come from synced config (Principle V); privacy is disclosed honestly.
 */
export default function VouchersPage() {
  const { account, isConnected } = useWallet()
  const { getPrice, ROLE_HASHES, TIER_IDS } = useTierPrices()
  const { status, error, lastTxHash, voucherAvailable, mintVoucher, redeemVoucher, getVoucher } = useVouchers()
  const { hash } = useLocation()

  // Deep links from the "Get Wager Access" modal (#vch-buy-h / #vch-redeem-h)
  // scroll to the relevant section.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const [selectedTier, setSelectedTier] = useState('BRONZE')
  const [mintedId, setMintedId] = useState(null)

  const [redeemId, setRedeemId] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewMsg, setPreviewMsg] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [redeemed, setRedeemed] = useState(false)

  if (!isConnected) return <Navigate to="/" replace />

  const role = ROLE_HASHES.WAGER_PARTICIPANT
  const busy = status === 'minting' || status === 'redeeming'

  async function onMint() {
    setMintedId(null)
    try {
      const { tokenId } = await mintVoucher(role, TIER_IDS[selectedTier])
      setMintedId(tokenId)
    } catch {
      /* error surfaced via hook state */
    }
  }

  async function onPreview() {
    setPreview(null)
    setPreviewMsg('')
    if (!redeemId) return
    const v = await getVoucher(redeemId)
    if (!v) {
      setPreviewMsg('No voucher with that id (it may not exist or was already redeemed/burned).')
      return
    }
    setPreview(v)
    if (!v.ownedByMe) {
      setPreviewMsg('This voucher is owned by another address — redeeming requires the wallet that holds it.')
    }
  }

  async function onRedeem() {
    setRedeemed(false)
    try {
      // NOTE: pass the in-force Terms version hash here once wired (spec 007); the contract records whatever
      // hash is supplied for the redeemer. The checkbox captures explicit consent in the UI.
      await redeemVoucher(redeemId, undefined)
      setRedeemed(true)
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
        {status === 'minting' && 'Minting voucher…'}
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
        <Button variant="primary" onClick={onMint} loading={status === 'minting'} disabled={!voucherAvailable || busy}>
          Buy {TIER_NAMES[TIER_IDS[selectedTier]]} voucher
        </Button>
        {mintedId && (
          <p className="vch-success" role="status">
            Voucher #{mintedId} minted to your wallet. Send it to anyone, or redeem it below.
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
        <div className="vch-redeem-row">
          <label htmlFor="vch-token-id">Voucher id</label>
          <input
            id="vch-token-id"
            className="vch-input"
            inputMode="numeric"
            value={redeemId}
            onChange={(e) => {
              setRedeemId(e.target.value.replace(/[^0-9]/g, ''))
              setPreview(null)
              setPreviewMsg('')
            }}
            placeholder="e.g. 1"
            disabled={!voucherAvailable || busy}
          />
          <Button variant="secondary" onClick={onPreview} disabled={!voucherAvailable || !redeemId || busy}>
            Preview
          </Button>
        </div>

        {preview && (
          <div className="vch-preview">
            <span className="vch-tier-badge" style={{ backgroundColor: TIER_COLORS[preview.tier] }}>
              {TIER_NAMES[preview.tier]}
            </span>
            <span>{preview.durationDays}-day membership</span>
            <span className={preview.ownedByMe ? 'vch-ok' : 'vch-warn'}>
              {preview.ownedByMe ? 'You hold this voucher' : 'Held by another wallet'}
            </span>
          </div>
        )}
        {previewMsg && <p className="vch-warn" role="status">{previewMsg}</p>}

        <label className="vch-terms">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={!voucherAvailable || busy}
          />
          I accept the Terms &amp; Conditions and confirm I’m eligible.
        </label>

        <Button
          variant="primary"
          onClick={onRedeem}
          loading={status === 'redeeming'}
          disabled={!voucherAvailable || !redeemId || !acceptedTerms || busy || (preview && !preview.ownedByMe)}
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
