# FairWins Finance Professional Series — Inventory

*Intermediate and advanced briefings for non-technical readers with a
financial-services background.*

This is the fourth layer of the FairWins content program, written for a
specific reader: a professional fluent in traditional finance — asset
management, treasury, operations, compliance, risk, advisory, or fintech
product — who is **not** a developer. Where the other layers explain crypto on
its own terms, this series **bridges**: it starts from a concept the reader
already knows (custody, settlement, counterparty risk, collateral, NAV,
KYC/AML, best execution, cost disclosure) and maps it onto the on-chain
mechanism, with an honest read on where the two genuinely differ and what the
risk-and-controls picture looks like.

The four layers:

| Layer | Reader | Depth |
|-------|--------|-------|
| User Guide | app users | how-to |
| Knowledge Base | crypto-curious beginners | beginner |
| Engineering Blog | semi-technical | how it's built |
| **Finance Professional Series** (this) | **finance pros, non-technical** | **intermediate / advanced** |

> **Informational, not advice.** Every briefing is educational. Nothing here is
> investment, legal, tax, or regulatory advice, and analogies to regulated
> products are for building intuition — not claims of legal equivalence.
> Regulatory treatment of tokens, yield, and markets varies by jurisdiction and
> is evolving. Yield carries risk and is never guaranteed.

---

## The 18 briefings

Level key: **I** = Intermediate, **A** = Advanced.

### Track 1 — Custody & Settlement

| # | Briefing | Lvl | TradFi anchor | Pairs with |
|---|----------|-----|---------------|------------|
| 01 | Self-custody vs. qualified custodians | I | Custody, segregation, insolvency remoteness | Passkey accounts |
| 02 | Trustless escrow and the end of counterparty risk | I | Escrow agents, clearinghouses | Wager lifecycle |
| 03 | Atomic settlement: delivery-versus-payment at T+0 | A | DvP/PvP, settlement finality, Herstatt risk | Wager lifecycle |
| 04 | Institutional controls on-chain: multisig & segregation of duties | I | Maker-checker, four-eyes, treasury controls | Safe custody |
| 05 | Programmable spending policy as pre-trade controls | A | Investment mandates, pre-trade compliance | Policy engine |

### Track 2 — Money, Yield & Markets

| # | Briefing | Lvl | TradFi anchor | Pairs with |
|---|----------|-----|---------------|------------|
| 06 | Stablecoins as a settlement asset | I | Tokenized cash, e-money, bank deposits | Wager lifecycle |
| 07 | On-chain lending vs. money markets & repo | A | Money-market funds, repo, securities lending | Earn |
| 08 | Tokenized vaults as fund structures | A | Fund shares, NAV, subscriptions/redemptions | Earn |
| 09 | A practitioner's risk framework for DeFi yield | A | Credit/liquidity/operational risk taxonomy | Earn |
| 10 | Oracles as reference-data and benchmark infrastructure | A | Market-data vendors, benchmark administration | Oracle adapters |
| 11 | Prediction markets as information markets & event contracts | I | Binary options, event contracts | Oracle adapters |
| 12 | Builder codes and best execution | A | Payment for order flow, best-execution duty | Predict |

### Track 3 — Compliance, Disclosure & Governance

| # | Briefing | Lvl | TradFi anchor | Pairs with |
|---|----------|-----|---------------|------------|
| 13 | Programmatic compliance: screening, KYC/AML & the travel rule | A | AML programs, FATF travel rule | Compliance gating |
| 14 | Fee transparency and cost disclosure | I | MiFID II ex-ante cost disclosure | FeeRouter |
| 15 | Confidentiality on a public ledger | A | Bilateral OTC, dark pools, information barriers | Envelope encryption |
| 16 | Operational risk in upgradeable systems | A | Change management, key governance | UUPS upgrades |
| 17 | Assurance for smart contracts: audits & formal verification | I | SOC 2, model validation, third-party assurance | Symbolic execution & fuzzing |
| 18 | DAOs and member-owned governance | I | Mutuals, cooperatives, member-owned structures | ClearPath DAO registry |

Each briefing is 1,100–1,600 words, contains a **Risk & controls** section, links
to its matching engineering deep-dive, and carries a **Further reading** list
that mixes traditional-finance references (BIS/IOSCO/FATF/CFTC/MiFID and
practitioner explainers) with the relevant technical standards.

---

## Where this fits the publication program

The Knowledge Base and Engineering Blog interleave into a single beginner→
technical stream (see `knowledge-base-inventory.md`). The Finance Professional
Series is best run as a **parallel monthly track** — a "Finance Desk" cadence —
rather than folded into that weekly stream, because its reader and register are
distinct. A workable rhythm: publish one briefing every two weeks, sequenced by
track (Custody & Settlement → Money, Yield & Markets → Compliance, Disclosure &
Governance), so professional readers get a coherent arc while the main stream
continues for general users.

Recommended lead-offs (highest resonance for a finance audience):

1. Trustless escrow and the end of counterparty risk (02)
2. Atomic settlement at T+0 (03)
3. On-chain lending vs. money markets & repo (07)
4. A practitioner's risk framework for DeFi yield (09)
5. Programmatic compliance and the travel rule (13)
