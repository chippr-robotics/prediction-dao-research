# Confidential Terms, Transparent Settlement: Privacy on a Public Ledger

*Protecting legitimate competitive intelligence while settling on an open chain — compared with bilateral OTC and dark pools, and where the information-barrier line sits*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Compliance, Disclosure & Governance |
| **Level** | Advanced |
| **Audience** | Compliance officers, buy-side risk and desk heads, general counsel, market-structure and product leads |
| **Tags** | `confidentiality`, `market-structure`, `MNPI`, `information-barriers`, `settlement` |
| **Reading time** | ~9 minutes |

> **Informational, not advice.** Educational only — not legal, compliance, or investment advice. Confidentiality protects legitimate competitive intelligence, not misconduct. Participants remain fully subject to securities laws, insider-trading rules, and their firms' policies. Regulatory treatment varies by jurisdiction and is unsettled.

## A wager two competitors can't make in public

Two professionals — say a derivatives desk head at one fund and a structured-products lead at a competitor — have known each other for years. Reviewing the same public filings and analyst reports everyone else can see, they land on opposite convictions about whether a widely covered merger clears regulatory review before quarter-end. Both want to back their view with real money.

A public prediction market is out instantly. One side's position would signal her fund's broader pharma-consolidation thesis; the other can't broadcast a view to his own trading floor; neither wants the reputational exposure of a named bet between competitors. The concern isn't hiding anything improper — it's protecting legitimate competitive intelligence, exactly the way a desk protects its positioning from being read off a public tape. They could paper a bilateral agreement, but that means lawyers, an escrow arrangement, and the uncomfortable question of what happens if the loser simply refuses to pay.

What they want is a familiar thing in an unfamiliar venue: **a private agreement with public enforceability.** Terms only they can see; settlement neither can escape. The tension is that public blockchains are radically transparent — the property that makes settlement trustless is the same property that would broadcast their thesis to every competitor watching the chain.

## The traditional model: how markets already hide size and intent

Financial markets have spent decades engineering *confidentiality without abandoning enforceability*. Two reference points matter here.

**Bilateral OTC.** Over-the-counter trades — swaps, forwards, negotiated blocks — are struck privately between two parties, typically under master agreements (an ISDA framework, for instance). Terms are confidential to the counterparties. The cost is precisely what our two professionals want to avoid: **counterparty credit risk**. A private promise is only as good as the loser's willingness and ability to pay, which is why OTC relationships lean on collateral, netting, and legal recourse.

**Dark pools.** Venues that let institutions execute large orders without displaying pre-trade quotes to the public book, so a big order doesn't move the price against the trader before it fills. The trade prints *after* execution; pre-trade intent stays dark. **Suppressing pre-trade information to protect a large or sensitive position** is a recognized, legitimate market-structure tool, not an inherently suspect one.

Both show the same idea our professionals need: confidentiality of *terms and intent* is a normal, lawful feature of institutional markets. What's been hard is combining that confidentiality with *guaranteed* settlement — without a trusted intermediary holding either the secret or the money.

## What changes on-chain

On a transparent chain, confidentiality is engineered rather than assumed, and the technique is one treasury and security professionals already know by name: **envelope encryption**, the same pattern enterprise cloud and secure-messaging systems use.

The mechanics, in the reader's terms: the agreement's terms are encrypted once with a single random key. That key is then separately re-wrapped for each participant using a keypair derived from their own wallet — so each party can open the terms independently, and no central service ever holds a master key. The encrypted bundle lives off-chain on decentralized storage; the chain holds only a small pointer to it plus the enforcement essentials — who the parties are, how much is escrowed, timing. Escrow and automatic settlement handle the money.

The result splits cleanly into what the world sees and what only the counterparties know:

- **Public on-chain:** two wallet addresses, the stake amounts, the status and timestamps, and a reference to the encrypted terms. Enough to enforce, and no more.
- **Private to the participants:** the actual question, the resolution criteria, the deadline, any custom terms. A competitor watching the chain sees a locked position between two addresses — not the thesis behind it.

This is dark-pool logic generalized: pre-settlement *intent and terms* are dark, while settlement itself is public and guaranteed. And it removes the OTC weakness in the same stroke — because both stakes are escrowed the moment the agreement binds, there is no counterparty credit risk left to manage. Settlement becomes a question of outcome, not of the loser's goodwill.

## Where it genuinely differs

**Better than bilateral OTC on credit risk.** The classic OTC exposure — will the loser pay? — is eliminated by pre-funded escrow, not merely mitigated by collateral schedules and legal recourse.

**Different from dark pools in what stays hidden.** A dark pool hides pre-trade quotes but still reports the executed trade to the market and its regulator. Here, the *terms* stay encrypted indefinitely, while the *fact* of a position, its size, and its parties' addresses are permanently public. That is a different confidentiality profile — arguably more private on content, arguably less private on the existence and counterparties of the position — and professionals should understand the trade rather than assume it maps onto either reference point exactly.

**Durability of the secret.** Because the encrypted terms may stay sensitive for years, a serious implementation defends against "harvest now, decrypt later" — an adversary recording ciphertext today to break with a future quantum computer — by using a hybrid scheme pairing today's proven encryption with a quantum-resistant one. Competitive intelligence doesn't always expire on schedule; the encryption shouldn't either.

## The line that matters: confidentiality is not a cover for misconduct

This is the section a compliance reader should weigh most carefully, because the same privacy that protects a legitimate desk position could be *imagined* as cover for something it must never be.

**Information barriers exist to keep material non-public information (MNPI) from crossing into trading decisions.** MNPI is information that is both material and not public — earnings ahead of release, a deal not yet announced, anything a reasonable investor would want that the market doesn't yet have. Trading on it, or passing it to someone who does, is insider dealing. Firms build "Chinese walls" — information barriers between, say, an advisory team that holds MNPI and a trading desk that must not.

Confidential settlement does nothing to change that line, and it is essential to say so plainly. Encrypting the *terms of a bet made on public information* protects competitive intelligence — a legitimate interest. It does not launder a bet made on *non-public* information into something permissible. The two professionals in the scenario are on opposite sides of a public, well-covered question, reasoning from filings anyone can read; that is skill-based forecasting, not trading on a secret. Privacy protects the analysis, not the existence of a legal basis for the trade. A participant sitting on MNPI is in exactly the same legal jeopardy encrypted or not — the encryption is irrelevant to the violation, and no honest description of this technology should suggest otherwise.

## Risk & controls

- **Compliance / conduct risk.** The dominant risk is not technical. A confidential-terms venue must be used to protect legitimate competitive intelligence only; participants remain fully subject to insider-trading law and firm policy. This is a use-governance question, not an encryption one.
- **Key-management risk.** Access is derived from each participant's own wallet, and the platform never holds a master key. That removes central-key-custody risk but places the burden on wallet security: lose control of the wallet and you lose control of the confidential access. Standard key-hygiene and recovery discipline apply.
- **Metadata leakage.** Terms are encrypted, but the *existence* of a position, its size, its timing, and the parties' addresses are permanently public. Observers can sometimes infer meaning from metadata and timing alone — confidentiality of content is not anonymity of activity.
- **Resolution and durability.** A private agreement still needs a trustworthy way to settle: pegging to an independent public market or a designated neutral arbitrator removes reliance on either party's self-attestation, but inherits that source's own risk. And the off-chain encrypted data must remain retrievable for the life of the agreement — the on-chain pointer is only useful if the referenced content persists.

## How FairWins approaches this

FairWins lets counterparties keep the *terms* of a peer-to-peer agreement confidential while settling on a public chain. Terms are encrypted once and re-wrapped per participant from wallet-derived keys, so no central service ever holds a master key; the encrypted bundle sits off-chain with only a small reference and the enforcement essentials on-chain. Stakes are escrowed on binding, removing counterparty credit risk, and settlement can be pegged to an independent public outcome or a neutral arbitrator rather than either party's word. The encryption uses a post-quantum hybrid scheme against harvest-now-decrypt-later exposure. FairWins is explicit on the boundary: this protects competitive intelligence and trading strategy, never material non-public information or any circumvention of securities law — participants remain fully subject to applicable law and their own professional obligations.

> **Informational, not advice.** Nothing here endorses using confidentiality to trade on MNPI or evade disclosure or reporting duties, and none of it is legal or compliance advice.

## Related deep-dive

For the engineering details, see [Private Prediction Markets: Confidential Terms with Trustless Settlement](../../posts/18-envelope-encryption/blog.md).

## Further reading

- Investopedia, "Dark Pool": https://www.investopedia.com/terms/d/dark-pool.asp
- Investopedia, "Over-the-Counter (OTC)": https://www.investopedia.com/terms/o/otc.asp
- Investopedia, "Material Nonpublic Information (MNPI)": https://www.investopedia.com/terms/m/materialinsiderinformation.asp
- IOSCO principles on dark liquidity: https://www.iosco.org/library/pubdocs/pdf/IOSCOPD353.pdf
- NIST post-quantum cryptography standards (ML-KEM): https://csrc.nist.gov/projects/post-quantum-cryptography
