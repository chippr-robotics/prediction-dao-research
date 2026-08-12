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
  builderFee:
    'A fee FairWins charges on Hyperliquid orders placed through FairWins, as a percentage of the ' +
    'trade, on top of Hyperliquid’s own fees. You approve it once on Hyperliquid before it can ' +
    'ever be charged, and the current rate is always shown here first.',
  gmxDiscount:
    'Trading on GMX through FairWins’ referral link gives you a discount on GMX’s trading ' +
    'fees. FairWins receives a share of the remaining fee from GMX. It costs you nothing extra.',
  gainsReferral:
    'FairWins earns a small referral share from Gains Network on trades attributed to FairWins. ' +
    'It is paid by the venue and costs you nothing extra.',
  pnl: 'Profit or loss on the position if it were closed at the current price, as the venue reports it.',
}

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

export const PERPS_FEE_UNCONFIRMED_NOTE =
  'The current FairWins fee rate could not be confirmed just now, so it is not shown. The venue ' +
  'will never charge more than the rate you approved on it.'
