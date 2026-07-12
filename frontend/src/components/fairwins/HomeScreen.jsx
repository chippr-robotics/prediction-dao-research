import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWallet, useWalletConnection } from '../../hooks'
import { useModal } from '../../hooks/useUI'
import CreateChallengePanel from './CreateChallengePanel'
import UnifiedLookupModal from './UnifiedLookupModal'
import MyMarketsModal from './MyMarketsModal'
import PolymarketTickerCrawler from './PolymarketTickerCrawler'
import PremiumPurchaseModal from '../ui/PremiumPurchaseModal'
import { parseTakeChallengeParams } from '../../utils/claimCode/deepLink.js'
import { OPEN_RESOLUTION_TYPES } from '../../hooks/useOpenChallengeCreate'
import { useFriendMarkets } from '../../contexts/FriendMarketsContext.js'
import './Dashboard.css'
import './HomeScreen.css'

/**
 * HomeScreen (spec 053) — the app's landing surface at /app. It opens directly on the
 * open-challenge create view (the shared CreateChallengePanel, rendered inline), the way a
 * payments app opens on its amount keypad. Two secondary entries sit beside it — "Accept a
 * challenge" (the unified phrase lookup) and "My rewards" (My Wagers, which surfaces claimable
 * winnings) — plus the Polymarket ticker, whose picks route into the create view's oracle path.
 * The full set of wager types/actions lives in the Wagers section (/wagers).
 */
function HomeScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isConnected } = useWallet()
  const { connectWallet } = useWalletConnection()
  const { showModal, hideModal } = useModal()
  const { friendMarkets } = useFriendMarkets()

  // Preselect the oracle path (from the ticker) and force-remount the panel so a fresh
  // create starts cleanly after a success or a ticker pick.
  const [oraclePreselect, setOraclePreselect] = useState(false)
  const [createKey, setCreateKey] = useState(0)

  const [showUnifiedLookup, setShowUnifiedLookup] = useState(false)
  const [unifiedInitialPhrase, setUnifiedInitialPhrase] = useState('')
  const [unifiedAutoResolve, setUnifiedAutoResolve] = useState(false)
  const [showMyWagers, setShowMyWagers] = useState(false)
  const [initialWagerId, setInitialWagerId] = useState(null)

  // Feed → wager navigation (spec 012): open My Wagers on a specific wager, then clear state.
  useEffect(() => {
    const openWagerId = location.state?.openWagerId
    if (openWagerId == null) return
    setInitialWagerId(String(openWagerId))
    setShowMyWagers(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.state, location.pathname, navigate])

  // Shared-phrase deep link (spec 037): /app?oc=take&code=<four words> opens the unified lookup,
  // prefilled + auto-resolving. Strip the query after consuming it (FR-016).
  useEffect(() => {
    const code = parseTakeChallengeParams(location.search)
    if (code) {
      setUnifiedInitialPhrase(code)
      setUnifiedAutoResolve(true)
      setShowUnifiedLookup(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.search, location.pathname, navigate])

  const openAccept = useCallback(() => {
    setUnifiedInitialPhrase('')
    setUnifiedAutoResolve(false)
    setShowUnifiedLookup(true)
  }, [])

  // Ticker pick → open the create view straight on its oracle (Polymarket) path.
  const handleTicker = useCallback(() => {
    setOraclePreselect(true)
    setCreateKey((k) => k + 1)
  }, [])

  // After a successful create, reset the inline panel for another challenge.
  const handleCreated = useCallback(() => {
    setOraclePreselect(false)
    setCreateKey((k) => k + 1)
  }, [])

  return (
    <div className="dashboard-container home-screen">
      {!isConnected && (
        <div className="home-connect-cta" role="note">
          <span>Connect your wallet to create a challenge.</span>
          <button type="button" className="fm-btn-primary home-connect-btn" onClick={() => connectWallet()}>
            Connect wallet
          </button>
        </div>
      )}

      {/* Primary content: the inline open-challenge create view. */}
      <section className="home-create" aria-label="Create a challenge">
        <CreateChallengePanel
          key={createKey}
          embedded
          initialResolutionType={oraclePreselect ? OPEN_RESOLUTION_TYPES.Polymarket : undefined}
          onDone={handleCreated}
        />
      </section>

      {/* Secondary actions: take a challenge, and view winnings/rewards. */}
      <section className="home-actions" aria-label="Other actions">
        <button type="button" className="fm-btn-secondary home-action" onClick={openAccept}>
          Accept a challenge
        </button>
        <button type="button" className="fm-btn-secondary home-action" onClick={() => setShowMyWagers(true)}>
          My rewards
        </button>
      </section>

      {/* Polymarket ticker — picks route into the create view's oracle path. */}
      <section className="dashboard-section home-ticker">
        <PolymarketTickerCrawler onSelectMarket={handleTicker} />
      </section>

      {/* Accept a challenge — the unified phrase lookup (spec 037). */}
      <UnifiedLookupModal
        key={showUnifiedLookup ? 'ul-open' : 'ul-closed'}
        isOpen={showUnifiedLookup}
        initialPhrase={unifiedInitialPhrase}
        autoResolve={unifiedAutoResolve}
        onClose={() => setShowUnifiedLookup(false)}
        onBuyMembership={() => {
          setShowUnifiedLookup(false)
          showModal(<PremiumPurchaseModal onClose={hideModal} />, { title: '', size: 'large', closable: false })
        }}
      />

      {/* My rewards — My Wagers, which lists claimable payouts + "Claim Winnings". */}
      <MyMarketsModal
        isOpen={showMyWagers}
        onClose={() => { setShowMyWagers(false); setInitialWagerId(null) }}
        friendMarkets={friendMarkets}
        initialSelectedMarketId={initialWagerId}
      />
    </div>
  )
}

export default HomeScreen
