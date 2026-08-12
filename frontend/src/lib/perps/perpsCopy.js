/**
 * Every member-facing Perps string that explains a concept lives here (the lib/earn/earnCopy.js
 * convention), written for members with no DeFi background (constitution III tone rule). Perps
 * copy is where honesty slips easiest — leverage marketing language is banned; risk is stated
 * plainly.
 */

export const PERPS_TIPS = {
  fundingRate:
    'Funding is a small payment that flows between traders holding opposite sides of a pair, ' +
    'usually every hour. A positive rate means people betting the price rises (longs) pay those ' +
    'betting it falls (shorts); a negative rate is the reverse. It is not a fee charged by FairWins.',
  openInterest:
    'Open interest is the total value of positions currently open on this pair at this venue. ' +
    'Higher open interest generally means a more active market.',
  maxLeverage:
    'The largest multiplier this venue allows on this pair. Higher leverage means a smaller price ' +
    'move against you wipes out your stake ("liquidation"). Venues may show "—" when they do not ' +
    'publish a limit here.',
  liquidation:
    'A leveraged position is closed automatically ("liquidated") when the price moves far enough ' +
    'against it that the money backing it is nearly gone. What remains of the stake is usually lost.',
  venue:
    'The external trading platform this pair trades on. FairWins shows the market data; trading ' +
    'happens on the venue with your own wallet.',
  /**
   * FOR A WORLD THAT DOES NOT EXIST YET — and the view must keep it that way.
   *
   * This tip is only true where FairWins can actually place a Hyperliquid order for you, and it
   * cannot: Hyperliquid is read-only here. `PerpsView` therefore renders this (and the rate line it
   * annotates) only when Hyperliquid management is AVAILABLE, never merely when the configured rate
   * is above zero — the rate is admin-settable while the capability is not. If you are changing
   * this string, `PERPS_HYPERLIQUID_NO_FEE_NOTE` below is the one members read today.
   */
  builderFee:
    'A fee FairWins charges on Hyperliquid orders it places for you, as a percentage of the trade, ' +
    'on top of Hyperliquid’s own fees. It rides only orders placed through FairWins — never a trade ' +
    'you make on Hyperliquid’s own app. You approve it once on Hyperliquid before it can ever be ' +
    'charged, and the current rate is always shown here first.',
  /**
   * The Hyperliquid economics line members read TODAY, and it stays true whatever the configured
   * rate is: a builder fee can only ride an order FairWins sends, and FairWins sends none.
   */
  hyperliquidNoFee:
    'FairWins sends Hyperliquid no orders — your Hyperliquid positions are shown here and managed on ' +
    'Hyperliquid’s own app — so there is no FairWins fee on a Hyperliquid trade, whatever rate is ' +
    'configured. If FairWins ever places Hyperliquid orders for you, the rate would be shown here ' +
    'first and you would approve it on Hyperliquid before it could be charged.',
  gmxDiscount:
    'Trading on GMX through FairWins’ referral link gives you a discount on GMX’s trading ' +
    'fees. FairWins receives a share of the remaining fee from GMX. It costs you nothing extra.',
  gainsReferral:
    'FairWins earns a small referral share from Gains Network on trades attributed to FairWins. ' +
    'It is paid by the venue and costs you nothing extra.',
  pnl: 'Profit or loss on the position if it were closed at the current price, as the venue reports it.',
  /**
   * The same idea when FairWins worked it out instead of the venue. It is a SEPARATE string on
   * purpose: the one above claims the venue reported the number, and rendering that claim over our
   * own arithmetic is precisely the dishonesty the “calculated” label exists to prevent.
   */
  pnlCalculated:
    'Profit or loss if the position were closed at the current price, worked out by FairWins from ' +
    'the size, side and entry the venue reported. It leaves out the venue’s borrowing and funding ' +
    'charges and the price impact of closing, so the venue will settle at a different number.',
}

/**
 * The word beside a figure FairWins worked out rather than read from the venue.
 *
 * One word, used everywhere such a figure appears, so a member learns it once. It is deliberately
 * not “estimated”: an estimate sounds like the venue's own number rounded, and these are ours.
 */
export const PERPS_CALCULATED_LABEL = 'calculated'

/**
 * Why a GMX position has no liquidation price here — and it is not that GMX is being coy.
 *
 * GMX v2 stores no liquidation price on a position at all: the level is implied by its
 * min-collateral rule applied to collateral that shrinks as borrowing and funding accrue, so it
 * moves without the position changing. Deriving it would need pool-side factors this app does not
 * read, and a leveraged member acting on a made-up one is the worst outcome on this surface. A bare
 * dash invites the reading “there isn't one”, which is the opposite of true — hence a sentence.
 */
export const PERPS_GMX_NO_LIQUIDATION_PRICE =
  'GMX does not publish a liquidation price for a position, and FairWins will not work one out: it ' +
  'depends on GMX’s minimum-collateral rule and on the borrowing and funding this position has ' +
  'accrued, neither of which this app reads. Your position can still be liquidated — GMX’s own app ' +
  'shows the level it will use.'

export const PERPS_RISK_DISCLOSURE =
  'Perpetual futures are leveraged products traded on third-party venues, not by FairWins. ' +
  'Leverage multiplies losses as well as gains, and a position can be liquidated — losing the ' +
  'entire stake — during normal market moves. Only trade with money you can afford to lose.'

export const PERPS_EXTERNAL_NOTE =
  'You are leaving FairWins. Trades are placed on the venue with your own wallet, under the ' +
  'venue’s terms.'

export const PERPS_TESTNET_NOTE =
  'Perps market data comes from mainnet venues only. This build runs against test networks, so ' +
  'the Perps view is unavailable here — nothing is broken, and no test funds are involved.'

export const PERPS_UNAVAILABLE_NOTE =
  'Perps market data is temporarily unavailable, so this view is paused. Nothing you hold is ' +
  'affected. Please try again shortly.'

/**
 * A Gains market order past its timeout window, said in OUR voice.
 *
 * This one is not a tip, it is a correction. The venue emits NOTHING when a market order simply
 * goes unexecuted — we derive the timeout from the current block height against the window the
 * diamond itself reports — so this sentence is our observation, and it must never be rendered under
 * a "Gains said:" attribution (see `lib/perps/orderState.js#isVenueStatedReason`). It names how we
 * know, because on the surface a member reads when their collateral is stuck, the difference
 * between "the venue told us" and "we worked it out" is the difference that matters.
 */
export const PERPS_GAINS_TIMEOUT_OBSERVATION =
  'Gains has reported nothing about this order — we work out that its timeout window has passed ' +
  'from the current block height.'

/**
 * What FairWins earns on Hyperliquid: nothing — said plainly, beside the GMX and Gains lines that
 * say what FairWins earns there.
 *
 * This replaces a sentence that described FairWins charging a fee on "Hyperliquid orders placed
 * through FairWins". No such order exists: Hyperliquid's L1 actions need a browser-held agent key
 * even to CLOSE a position, so FairWins ships the venue read-only and sends it nothing
 * (`specs/083-perps-position-management/hyperliquid-decision.md`). The sentence below is true at
 * every configured rate, which is the property that matters: the builder rate is admin-settable
 * from the Fees tab today, and a fee that can only ride an order FairWins never sends stays zero to
 * the member no matter what it is set to.
 */
export const PERPS_HYPERLIQUID_NO_FEE_NOTE =
  'Hyperliquid trades cost you nothing extra — FairWins earns nothing on them'

export const PERPS_FEE_UNCONFIRMED_NOTE =
  'The current FairWins fee rate could not be confirmed just now, so it is not shown. The venue ' +
  'will never charge more than the rate you approved on it.'
