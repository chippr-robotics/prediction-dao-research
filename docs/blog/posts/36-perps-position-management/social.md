# Social & Image — The Right Amount of Solidity Turned Out to Be Zero

## X (Twitter)

We planned a contract to charge a fee on perps trades. Then we read the venues: Gains overwrites the owner field with `_msgSender()`, and GMX's `createOrder` is `address account = msg.sender`. Any contract we added would have owned the member's leveraged position — and they could never have closed it. So we shipped none. 🔗 <link>

#Ethereum #DeFi #SmartContracts

## LinkedIn

The plan was a fee-taking router for perpetual futures. Two lines of someone else's code cancelled it.

Gains Network's `openTrade` takes a struct whose first field is `address user` — and then runs `_trade.user = _msgSender()`, overwriting whatever you passed. GMX v2 doesn't even offer the field: `ExchangeRouter.createOrder` is `address account = msg.sender`, hashed straight into the position key. Neither venue has an owner parameter. So any contract sitting in that path becomes the owner of the member's leveraged position, and the member can't close it — every management function resolves the trade by caller. GMX's `receiver` field looks like it solves this; it only directs payouts.

The right amount of Solidity for the feature turned out to be zero, and finding that out was the work. The new engineering post covers what followed:

- Both venues already ship a third-party fee rail that beats what we'd have built. GMX's `uiFeeReceiver` is permissionless to register, capped at 10 bps by the venue itself, and computed at order execution — so a cancelled or frozen order pays nothing. We could not have built that property without holding funds pending the outcome.
- The pricing question worth reading even if you never trade perps: the platform standard is 50 bps of the capital a member commits, but perps fees bill on *notional* — margin × leverage. 50 bps of notional at 50× is 25% of the member's margin per side. The same standard, honestly translated, is 5 bps of notional, which at 10× is about 50 bps of margin. GMX and Hyperliquid each cap a third party at 10 bps anyway.
- Not owning the position is a business asset, not just a safety property: no custody, no rescue button, no upgrade key, and a smaller regulatory surface.
- On a keeper-executed venue, an included transaction is not an open position. The UI says "sent to the venue" and only says "opened" when the venue's execution event arrives — because a member who believes their close executed stops watching a position that is still liquidatable.
- The post also lays out, in full, how the platform is funded: membership fees, platform fees on wrapped services, venue-collected builder fees, venue-paid referral rebates, and nothing at all on wagers, pools or transfers.

Full write-up: 🔗 <link>

Where has reading the dependency's source changed the shape of what you shipped?

#DeFi #SmartContracts #Fintech #ProductStrategy #Security

## Image prompt (Gemini / Nano Banana)

Clean modern isometric editorial illustration: a small figure-marker stands on a hexagonal platform, holding a single taut line that runs straight past an empty pedestal in the midground and connects directly to a large tilted trading-venue slab in the distance. The pedestal is conspicuously bare — a plinth with nothing on it, its shadow the only mass it casts — signalling a component deliberately absent from the path. Along the connecting line, near the venue end, one small faceted token is being lifted off sideways to a tiny side tray, suggesting a fee taken at the far end rather than at the origin. Deep navy background with teal gradients and a fine engineering grid; a single warm amber accent runs the full length of the direct line from figure to venue, making the unbroken connection the brightest element in the frame. Soft precise studio lighting, crisp edges, minimalist fintech-engineering aesthetic, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
