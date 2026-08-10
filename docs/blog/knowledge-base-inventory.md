# FairWins Knowledge Base — Inventory & Publication Schedule

*Beginner-friendly concept primers for the FairWins user base, and the schedule
that interleaves them with the engineering deep-dives.*

The FairWins content program now has three layers, each for a different reader:

1. **User Guide** (`docs/user-guide/`) — task-oriented *how do I do X in the app*.
2. **Knowledge Base** (`docs/blog/knowledge/`, this document) — concept primers:
   *what is X, and why does it matter*. Written for everyday, non-technical users.
3. **Engineering Blog** (`docs/blog/posts/`) — architecture deep-dives: *how we
   built X*. Written for semi-technical readers.

The Knowledge Base exists to build the user base's general understanding over
time. Each primer is short (700–1,100 words), assumes no technical background,
and links to its matching engineering deep-dive for readers who want to go
deeper. The two sets are published **interleaved** so a concept is explained in
plain language shortly before the deep-dive that assumes it (see the schedule
at the end).

---

## The 20 primers

Level key: **B** = Beginner, **B–I** = Beginner–Intermediate.

### Track A — Wallets & Keys

| # | Primer | Level | Pairs with deep-dive |
|---|--------|-------|----------------------|
| 01 | Self-custody: what "be your own bank" really means | B | Account recovery |
| 02 | Passkeys & smart accounts: the fingerprint wallet | B | Passkey smart accounts |
| 03 | Gas fees & going gasless | B | Sponsored gas / paymaster |

- **01 Self-custody** — Keys, wallets, and "not your keys, not your coins"; the
  freedom and the responsibility of holding your own funds. Tags: `self-custody`,
  `wallets`, `security`, `basics`.
- **02 Passkeys & smart accounts** — Why your phone's Face ID / fingerprint can
  now be a real crypto wallet, and what a "smart account" is in plain terms.
  Tags: `passkeys`, `wallets`, `onboarding`, `basics`.
- **03 Gas fees & gasless** — What the network fee ("gas") is, why it exists, and
  what it means when an app covers it for you. Tags: `gas`, `fees`, `basics`.

### Track B — Payments & Markets

| # | Primer | Level | Pairs with deep-dive |
|---|--------|-------|----------------------|
| 04 | Stablecoins explained (USDC) | B | Wager lifecycle |
| 05 | Escrow & trustless settlement | B | Wager lifecycle |
| 06 | Prediction markets 101 | B | Oracle adapters |

- **04 Stablecoins** — What a stablecoin is, how it stays near a dollar, and why
  apps use them for real-money features. Tags: `stablecoins`, `usdc`, `payments`,
  `basics`.
- **05 Escrow & trustless settlement** — A neutral party holding the stakes — done
  by code so neither side can walk away. Tags: `escrow`, `settlement`, `basics`.
- **06 Prediction markets 101** — Backing a considered view with a stake; skill-based
  forecasting on public information. Carries the responsible-use note. Tags:
  `prediction-markets`, `forecasting`, `basics`.

### Track C — Earning & Yield

| # | Primer | Level | Pairs with deep-dive |
|---|--------|-------|----------------------|
| 07 | DeFi lending & yield: earning on idle funds | B–I | Earn |
| 08 | Morpho & vaults explained | B–I | Earn |
| 09 | Reading APY & understanding risk | B–I | Earn |
| 10 | Fees & basis points: reading what you pay | B | FeeRouter |

- **07 DeFi lending & yield** — Lending idle funds to earn interest without a bank,
  and where that yield actually comes from. Honest about risk. Tags: `defi`,
  `lending`, `yield`, `basics`.
- **08 Morpho & vaults** — What the Morpho lending protocol is, and what a curated
  "vault" does on your behalf. Tags: `morpho`, `vaults`, `defi`, `lending`.
- **09 APY & risk** — How to read a yield number, why it moves, and how to spot
  "too good to be true." Tags: `apy`, `risk`, `yield`, `defi`.
- **10 Fees & basis points** — What a fee is, what "basis points" mean, and the
  promise that you always see the exact cost before you approve. Tags: `fees`,
  `basis-points`, `transparency`, `basics`.

### Track D — Security & Custody

| # | Primer | Level | Pairs with deep-dive |
|---|--------|-------|----------------------|
| 11 | Multisig wallets: why several signatures beat one | B | Safe custody |
| 12 | Spending guardrails: rules that outrank approvals | B–I | Policy engine |
| 13 | Sanctions screening & compliance | B | Compliance gating |

- **11 Multisig wallets** — A shared account where several people must approve
  before money moves, and why treasuries rely on them. Tags: `multisig`, `security`,
  `custody`, `basics`.
- **12 Spending guardrails** — On-chain rules that can block a transaction even when
  enough people approved it. Tags: `security`, `policy`, `custody`.
- **13 Sanctions & compliance** — Why an app screens wallet addresses against
  blocklists, and how it does so without collecting personal data. Tags:
  `compliance`, `sanctions`, `basics`.

### Track E — Oracles & Trading

| # | Primer | Level | Pairs with deep-dive |
|---|--------|-------|----------------------|
| 14 | Oracles: how a contract learns real-world outcomes | B | Oracle adapters |
| 15 | Polymarket & builder fees explained | B | Predict |

- **14 Oracles** — The "trusted referee" that tells a contract what happened in the
  real world, and why contracts can't see out on their own. Tags: `oracles`,
  `basics`.
- **15 Polymarket & builder fees** — What Polymarket is and what a small, disclosed
  "builder fee" is. Carries the responsible-use note. Tags: `polymarket`, `fees`,
  `trading`.

### Track F — Identity, Privacy & Networks

| # | Primer | Level | Pairs with deep-dive |
|---|--------|-------|----------------------|
| 16 | NFTs, soulbound tokens & memberships | B | Soulbound memberships |
| 17 | On-chain names (ENS & callsigns) | B | CallsignRegistry |
| 18 | Private & encrypted: keeping activity confidential | B | Envelope encryption |
| 19 | Blockchain networks & layer-2s | B | Bitcoin (non-EVM) |
| 20 | What is a DAO? | B | ClearPath DAO registry |

- **16 NFTs, soulbound & memberships** — What an NFT is, what "soulbound"
  (non-transferable) means, and how a membership differs from a giftable voucher.
  Tags: `nft`, `soulbound`, `memberships`, `basics`.
- **17 On-chain names** — Turning a long wallet address into a readable name; names
  are a convenience, never required to move money. Tags: `naming`, `ens`, `identity`.
- **18 Private & encrypted** — What end-to-end encryption means, and how a public
  blockchain can still keep some details confidential. Tags: `privacy`, `encryption`,
  `basics`.
- **19 Networks & layer-2s** — What a blockchain network is, why "layer-2s" like
  Polygon are cheaper and faster, and why Bitcoin is a different kind of network.
  Tags: `networks`, `layer-2`, `polygon`, `basics`.
- **20 What is a DAO** — Coordinating and deciding with shared on-chain rules instead
  of a traditional company. Tags: `dao`, `governance`, `basics`.

---

## Interleaved publication schedule

A suggested running order for BOTH sets at a cadence of **two posts per week**.
Primers (**K**) lead the engineering deep-dives (**A**) that build on them, and
the foundational primers (self-custody, stablecoins, gas) come first so newer
users have footing before anything technical. Adjust cadence to taste — the
ordering is the point, not the exact dates.

| Wk | Post 1 | Post 2 |
|----|--------|--------|
| 1  | K01 Self-custody | K02 Passkeys & smart accounts |
| 2  | A04 Passkey smart accounts | K03 Gas fees & gasless |
| 3  | A06 Sponsored gas / paymaster | A09 Intent-based gasless payments |
| 4  | K04 Stablecoins | K05 Escrow & trustless settlement |
| 5  | A14 Wager lifecycle | K06 Prediction markets 101 |
| 6  | K14 Oracles | A15 Oracle adapter abstraction |
| 7  | A16 Draws & open challenges | A17 Wager pools |
| 8  | K11 Multisig wallets | A07 Safe custody |
| 9  | K12 Spending guardrails | A08 Multisig policy engine |
| 10 | K13 Sanctions & compliance | A03 Compliance gating |
| 11 | K07 DeFi lending & yield | K08 Morpho & vaults |
| 12 | A23 Earn (vaults) | K09 APY & risk |
| 13 | K10 Fees & basis points | A22 FeeRouter |
| 14 | K15 Polymarket & builder fees | A24 Predict (builder codes) |
| 15 | K16 NFTs, soulbound & memberships | A02 Soulbound memberships |
| 16 | A01 Role-based access control | A05 Account recovery |
| 17 | K17 On-chain names | A33 CallsignRegistry |
| 18 | K18 Private & encrypted | A18 Envelope encryption (published) |
| 19 | A19 Multi-recipient encryption | A20 Encrypted data sync |
| 20 | A21 Nullifier system | A32 Spec-driven development |
| 21 | K19 Networks & layer-2s | A25 Bitcoin (non-EVM) |
| 22 | A13 Deterministic deployment | A10 Relayer gateway |
| 23 | A11 UUPS upgrades | A12 Two-facet proxy |
| 24 | K20 What is a DAO | A26 ClearPath DAO registry |
| 25 | A27 Indexing without a subgraph | A28 Unified activity ledger |
| 26 | A29 AI security review | A30 Coverage & audit gates |
| 27 | A31 Symbolic execution & fuzzing | A34 TokenFactory |

That is 54 posts across ~27 weeks. The first ~six weeks are deliberately
primer-heavy to onboard newcomers; later weeks lean toward the engineering
deep-dives once the foundational concepts are established.
