# Private Prediction Markets: Confidential Terms with Trustless Settlement

*How envelope encryption brings the enforceability of smart contracts to confidential peer-to-peer agreements*

| | |
|---|---|
| **Series** | Privacy Architecture |
| **Part** | 1 (published) |
| **Audience** | Product-minded builders, founders, and the crypto-curious |
| **Tags** | `encryption`, `privacy`, `prediction-markets` |
| **Reading time** | ~14 minutes |

> **This post is already published.** Read it here:
> [Private Prediction Markets: Confidential Terms with Trustless Settlement](../../private-prediction-markets-envelope-encryption.md)

**Abstract.** Two professionals want to back opposing views of a public outcome
with real money — without broadcasting their firms' positioning to a public
order book. The published post walks their wager through the five stages of a
binding contract (creation, offer, consideration, acceptance, execution), and
shows how *envelope encryption* makes it work: the terms are encrypted once with
a single random key, and that key is then re-wrapped separately for each
participant, using keypairs derived from their own wallets so no central service
ever holds a master key. The encrypted envelope lives off-chain, with only a
tiny reference stored on the blockchain, while escrow and automatic,
market-pegged settlement handle the money. The wrapping uses a post-quantum
hybrid scheme (pairing today's proven encryption with a quantum-resistant one)
to defend against "harvest now, decrypt later" attacks. It closes with honest
limitations — privacy protects competitive intelligence, not illegal activity;
participants remain subject to applicable law.

## Further reading

- The full published article, linked above, is the primary reference.
- For deeper background, see the FairWins developer documentation on the
  platform's encryption approach.
