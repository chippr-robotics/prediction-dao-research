# Social & Image — Predict: Monetizing Polymarket Order Flow Without Ever Touching an Order

## X (Twitter)

A 401 redesigned our whole feature: Polymarket's CLOB binds every order to its signer, so a shared relayer can't submit for you. FairWins earns by *attributing* trades — a bytes32 builder code in signed headers — and discloses the additive builder fee as its own line, never "free." 🔗 <link>

#PredictionMarkets #Polymarket #Web3

## LinkedIn

The first design for Predict — FairWins' prediction-market trading surface built on publicly available information and skill-based forecasting — looked like every relayer pattern we had: a shared gateway credential submits orders on the member's behalf. It failed against the live API with a 401.

Polymarket's CLOB binds every order to its signer by design. That killed the intermediating-relayer architecture and forced a better one. The post covers:

- Client-direct orders: the member's own wallet is the only order signer; credentials never touch a FairWins server.
- Attribution over intermediation: a `bytes32` builder code rides on signed request headers, not in the order struct — FairWins earns on volume without holding orders, credentials, or funds.
- Honest fee disclosure: unlike an OpenSea referral that costs the user nothing, Polymarket's builder fee is *additive* — a real taker cost — so it gets its own labelled "FairWins builder fee" line, never folded into a total.
- Boot-time cap enforcement: rates are config (default 50 bps taker / 0 maker), hard-capped at the program limits; a misconfigured fee refuses to boot.

Participants remain subject to applicable law and Polymarket's own regional restrictions, which the app surfaces and never bypasses.

How do you decide which fees to itemize versus blend? 🔗 <link>

#PredictionMarkets #Polymarket #Web3 #NonCustodial #FinTech

## Image prompt (Gemini / Nano Banana)

A clean abstract-geometric editorial illustration of a signed order traveling directly from a stylized browser window to a distant exchange node along a single unbroken luminous line, while a small parallel tag — representing an attribution header — branches off to a side beacon without interrupting the main path. Convey non-custodial directness: no intermediary hub sits on the primary line. Deep navy and teal base with a single warm coral accent marking the attribution tag and beacon. Crisp vector-like forms, soft glow, subtle grid texture in the background, precise and trustworthy fintech-engineering mood, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
