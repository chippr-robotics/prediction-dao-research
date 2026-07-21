# Private Prediction Markets: Confidential Terms with Trustless Settlement

*How envelope encryption brings the enforceability of smart contracts to confidential peer-to-peer agreements*

| | |
|---|---|
| **Series** | Privacy Architecture |
| **Part** | 1 (published) |
| **Audience** | Applied cryptographers, fintech engineers |
| **Tags** | `encryption`, `envelope-encryption`, `privacy`, `prediction-markets` |
| **Reading time** | ~14 minutes |

> **This post is already published.** Read it here:
> [Private Prediction Markets: Confidential Terms with Trustless Settlement](../../private-prediction-markets-envelope-encryption.md)

**Abstract.** Two professionals want to back opposing views of a public outcome
with real money — without broadcasting their firms' positioning to a public
order book. The published post walks their wager through the five stages of a
binding contract (creation, offer, consideration, acceptance, execution), and
shows how envelope encryption makes it work: terms encrypted once with a random
key, that key wrapped per participant using wallet-derived X-Wing keypairs
(X25519 + ML-KEM-768 hybrid, ChaCha20-Poly1305 payloads), the envelope stored
on IPFS with only a 60-byte CID on-chain, and USDC escrow plus oracle-pegged
resolution making settlement automatic. It closes with honest limitations —
privacy protects competitive intelligence, not illegal activity; participants
remain subject to applicable law.

## Sources

- `docs/developer-guide/envelope-encryption-spec.md`
- `docs/developer-guide/encryption-architecture.md`
- `specs/002-e2e-encryption-lifecycle/`
