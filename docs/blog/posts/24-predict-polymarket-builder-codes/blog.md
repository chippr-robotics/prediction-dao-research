# Predict: Earning From Prediction-Market Trades Without Ever Touching One

*How FairWins added prediction-market trading with no custody, no contract changes, and one honestly disclosed fee*

---

| | |
|---|---|
| **Series** | Finance Surfaces (part 3) |
| **Part** | 24 of 34 |
| **Audience** | Product managers, founders, and the crypto-curious |
| **Tags** | `prediction-markets`, `polymarket`, `non-custodial`, `transparency` |
| **Reading time** | ~7 minutes |

---

> **A note on responsible use:** This article describes trading on prediction markets using publicly available information and ordinary, skill-based forecasting. Nothing here is a way to trade on secret, non-public information or to sidestep the rules that govern these markets. Everyone who participates remains fully subject to applicable law and to Polymarket's own regional restrictions — which FairWins surfaces to members and never tries to bypass.

---

## The error message that redesigned the feature

The first design for Predict looked like every other pattern FairWins had built: the member creates an order, a FairWins server holds one shared credential, and the server submits the order to Polymarket on the member's behalf. Clean, familiar, one secret to manage.

It failed against the live system with a single blunt error: *invalid API key*.

The reason is a deliberate feature of how Polymarket works, not a bug. On Polymarket, **every order is cryptographically tied to the wallet that signed it**. A credential is registered to one specific wallet, and the exchange rejects any order whose signer doesn't match. A single shared key simply cannot place trades for other people's wallets — which is exactly the property you want from a non-custodial exchange, and exactly the property that kills the "our server trades for you" approach.

That rejection forced a different design, and it turned out to be the better one: the member's own wallet is the only thing that ever signs an order, orders go from the member's browser straight to Polymarket, and FairWins earns money not by sitting in the middle of the trade but by *attributing* it — attaching a small referral tag to each order. This post walks through how that works, and why the resulting fee had to be disclosed differently from any other feature in the app.

## What Predict is (and isn't)

Predict is a section of the app plus a thin, read-only helper on the server side. There are **no smart-contract changes and no custody** — FairWins never holds a member's funds or touches their trade. The pieces are simple:

- **Browsing** markets and positions goes through a lightweight server proxy that fronts Polymarket's public, read-only data — cached and rate-limited, nothing more.
- **Trading** is direct: the member's browser talks to Polymarket itself, using credentials only the member holds.
- **Revenue** comes from Polymarket's official referral program for apps, called **builder codes**: trades FairWins helps generate earn a small referral fee plus a share of a weekly rewards pool.

Predict is also **Polygon-only**, because that's the only network Polymarket runs on. On any other network the Predict tab simply doesn't appear — no greyed-out button, no "coming soon," just absent.

## Each member trades with their own keys

Because every order is tied to its signer, each member derives their own trading credentials. This costs one signature — a wallet prompt, not an actual transaction and no gas — and the app remembers it for the session, so a member signs at most once. Those credentials are **never sent to a FairWins server**; the browser talks to Polymarket directly.

The order itself — its exact structure, rounding, and signature — is handled entirely by Polymarket's own official trading library, so FairWins never hand-builds an order and risks getting it subtly wrong. And here's a detail that shapes everything downstream: the referral tag is *not* part of the signed order at all. The signed order has no slot for it. Attribution rides alongside the order, on the request itself.

## The attribution seam: crediting the trade without shipping secrets

FairWins' builder code is a public identifier — think of it as a referral tag. Crediting a trade to FairWins means attaching a few extra pieces of signed information to each order submission. Producing that signature requires a genuine shared secret (FairWins' own builder credentials), so that secret lives **only on the server**, never in the browser.

The bridge between "trade happens in the browser" and "secret lives on the server" is a small, narrow request: when the member is about to submit an order, the browser asks the server to produce just the attribution signature — nothing else. The server signs and returns those few values, which get stacked onto the member's own order. Two properties matter here:

First, the server signs **attribution only** — it never sees the order, the member's credentials, or their positions. Second, attribution is **best-effort**: if the server is down or unconfigured, the order goes through *unattributed* rather than being blocked. FairWins losing a referral fee is never a reason a member can't trade. This mirrors a rule that runs through the whole platform: a member is never stranded for the sake of FairWins' revenue.

## Fees, honestly

This is where Predict differs from FairWins' marketplace feature, and the difference is the most instructive part of the design.

That other feature's referral reward comes out of the *partner's* own fee — it costs the member nothing — so it's credited silently, with no fee line. Polymarket's builder fee is different: it's **additive**. It stacks on top of Polymarket's own trading fee and is a real cost to the trader. Because it's a genuine, additional cost, honesty demands it be shown — not credited silently.

So the confirmation screen treats it exactly the way FairWins' disclosure philosophy requires: the builder fee appears as its own clearly labeled "FairWins builder fee" line — never folded into a total, never described as free. Polymarket's *own* fee is a separate matter: it's calculated by Polymarket's engine at the moment a trade executes and varies with price and size, so rather than invent a dollar figure FairWins can't guarantee, the screen discloses it as a separate note. The rule is "what you see is what you're charged" for the one fee FairWins controls, and honest uncertainty about the one it doesn't. (Traders who post orders that others fill, rather than taking existing ones, pay no builder fee at all.)

The rate is a setting, not buried in code: by default half a percent (50 basis points) for takers and zero for makers, hard-capped at Polymarket's program limits. That cap is enforced the moment the server starts up: if someone misconfigures the fee above the allowed limit, the server refuses to start rather than quietly overcharging. A fat-fingered rate becomes an outage you notice in seconds, not a fee incident you discover in a support ticket weeks later.

For context, a taker's total cost lands around Polymarket's own fee (which varies by market category) plus FairWins' half-percent — comparable to other regulated prediction platforms and mid-pack among Polymarket-connected apps.

## The region gate

Polymarket blocks trading from certain regions as a matter of its own policy. FairWins checks a member's eligibility before showing fees and again before submitting. A blocked member gets an honest region notice and a link to Polymarket itself — FairWins never bypasses the block, and never shows a trade button that's guaranteed to fail. The same "degrade honestly" pattern covers every failure: if a fee can't be confirmed, signing is blocked rather than guessed; during an outage, the member gets a clear message and a link out.

## Why build it this way

**Attribution over intermediation.** Even setting aside the signer rule that made a middleman impossible, crediting trades is simply the better trade-off: FairWins earns on volume without ever holding a member's credentials, orders, or funds — no custody, no broker posture, and the smallest possible secret to protect.

**Direct trading, server-side reads only.** Splitting the two paths means the trust-sensitive part — the signed order — has no FairWins hop at all, while the cacheable part — browsing markets — gets sensible limits and a kill switch. The server can go down and members can still trade.

**A fee that's a setting, with a hard cap at startup.** Keeping the rate in configuration rather than code, and refusing to start if it's set too high, turns a potential fee scandal into a boring, immediate, self-correcting failure.

**Disclose what you control, admit what you don't.** The additive builder fee gets its own exact, labeled line. Polymarket's execution-time fee gets an honest note rather than a made-up estimate. The tidier alternative — one blended "total" — would be less truthful, so FairWins didn't ship it.

The honest open trade-off: passkey wallets can't trade on Predict yet. Ordinary wallets work today, and support for passkey-based signatures is coming once it can be verified end to end — the honest, working answer shipped ahead of the complete one.

## Further reading

- [Polymarket documentation](https://docs.polymarket.com/) — the prediction-market exchange behind Predict, including its builder-code referral program
- [EIP-712: typed structured data signing](https://eips.ethereum.org/EIPS/eip-712) — the widely used standard for the human-readable signatures that authorize orders
- [Prediction market (overview)](https://en.wikipedia.org/wiki/Prediction_market) — background on how these markets work
- For deeper implementation details, see the FairWins developer documentation.
