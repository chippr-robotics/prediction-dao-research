# Private Prediction Markets: Confidential Terms with Trustless Settlement

*How envelope encryption brings the enforceability of smart contracts to confidential peer-to-peer agreements*

---

> **Important Note**: This article describes prediction markets based on publicly available information and legitimate forecasting. Private prediction markets are not a mechanism for trading on material non-public information, circumventing securities regulations, or subverting professional ethics rules. All participants remain fully subject to applicable laws, compliance requirements, and fiduciary obligations. The privacy described herein protects competitive intelligence and trading strategies—not illegal activity.

---

## The Problem with Public Positions

Sarah runs the derivatives desk at a mid-sized fund. Marcus leads structured products at a competing firm. They've known each other for fifteen years, and over coffee last month—reviewing the same public filings and analyst reports everyone else had access to—they found themselves on opposite sides of a conviction: whether a widely-covered pharmaceutical merger would clear regulatory review before Q3.

Both wanted to back their view with real money. A friendly wager between professionals, based purely on their differing interpretations of public information.

The obvious answer—a public prediction market—was immediately ruled out. Sarah's position would signal her fund's broader thesis on pharma consolidation. Marcus couldn't broadcast his view to his own trading floor. And neither wanted the reputational exposure of a public bet between named competitors. The privacy concern wasn't about hiding anything improper—it was about protecting legitimate competitive intelligence.

They could sign a bilateral agreement. But that meant lawyers, escrow arrangements, and the uncomfortable question of what happens if one party simply refuses to pay. They'd seen it before: verbal commitments evaporating when the outcome became inconvenient.

What Sarah and Marcus needed was something that didn't exist: a private agreement with public enforceability. Terms that only they could see, but settlement that neither could escape.

---

## A Contract in Five Stages

The solution borrows its structure from something both Sarah and Marcus understand instinctively: the lifecycle of a binding contract.

Every enforceable agreement moves through recognizable stages: **Creation**, **Offer**, **Consideration**, **Acceptance**, and **Execution**. Private prediction markets follow the same progression—but with cryptographic privacy and automatic settlement built into each step.

Let's follow Sarah and Marcus through each stage.

---

## Stage 1: Creation

Sarah decides to initiate. She opens the platform and drafts the terms:

> *"The Meridian-Vantage merger will receive regulatory approval and close before September 30, 2026. If yes, Marcus pays Sarah 50,000 USDC. If no, Sarah pays Marcus 50,000 USDC."*

She specifies Marcus as the counterparty and sets an acceptance deadline: he has 72 hours to review and accept.

Here's where private markets diverge from public ones. When Sarah clicks "Create," her terms don't go to a public order book. Instead, they're encrypted.

The system generates a random encryption key—unique to this specific market. Sarah's terms are locked with this key and stored on decentralized storage. No one browsing that storage can read them. They see only encrypted data that appears as random characters.

But Sarah needs Marcus to read the terms. How does she share the key without exposing it?

### The Envelope Solution

This is where **envelope encryption** comes in—a pattern used by secure messaging apps and enterprise cloud providers, now applied to contracts.

Think of Sarah's terms as a letter inside a locked box. The box has a random key (the encryption key). Sarah receives a sealed envelope containing a copy of that key, locked with her personal key derived from her wallet.

When she invites Marcus, the system creates a second sealed envelope containing the same box key, but locked with Marcus's personal key.

Now both can open the box. But no one else can—not the platform, not observers, not anyone who intercepts the encrypted data.

**Why this matters for Sarah**: Her terms are encrypted once, regardless of whether she's betting against one person or ten. The system scales efficiently without re-encrypting for each participant.

**Why this matters for Marcus**: He doesn't need to trust Sarah to keep the key safe. His access is independent, derived from his own wallet. If Sarah's systems are compromised, his envelope remains secure.

---

## Stage 2: Offer

Marcus receives a notification. Someone has proposed a private market with him as counterparty.

He opens the platform, connects his wallet, and is prompted to sign a message. This signature—which only Marcus can produce—mathematically generates his encryption keypair. The platform never sees this key. It's derived entirely in his browser.

With his key, Marcus opens his envelope, retrieves the box key, and decrypts Sarah's terms.

He sees everything: the prediction question, the stakes, the resolution criteria, the deadline. He can review at his leisure, consult colleagues, or simply think it over.

At this point, no funds have moved. Sarah has made an offer. Marcus is evaluating.

### What Marcus Can Verify

Even before accepting, Marcus can confirm several properties:

- **Only he and Sarah can read these terms.** The envelope structure shows exactly two recipients.
- **The terms are cryptographically committed.** Sarah cannot change them after the fact without creating a new market entirely.
- **The stakes will be escrowed, not held by either party.** The smart contract will custody funds until resolution.

This is the due diligence phase of any contract negotiation—but with cryptographic guarantees replacing paper trails.

---

## Stage 3: Consideration

Consideration—the exchange of value that makes a contract binding—happens the moment Marcus decides to proceed.

He clicks "Accept" and is prompted to deposit his stake: 50,000 USDC. His wallet displays the transaction details. He confirms.

The smart contract receives Marcus's funds and holds them alongside Sarah's original stake (which she deposited at creation). Neither party can withdraw. The combined 100,000 USDC sits in escrow, controlled by code, awaiting the outcome.

### Why Escrow Changes Everything

In traditional bilateral agreements, consideration is a promise. You trust your counterparty to pay if they lose. That trust is backed by reputation, legal recourse, or simply hope.

Here, consideration is immediate and irrevocable. The moment Marcus accepts, both parties have already paid. The only question remaining is who receives the funds at resolution.

This eliminates counterparty credit risk entirely. Sarah doesn't need to evaluate Marcus's ability to pay. Marcus doesn't need to worry about Sarah's willingness to honor the bet. The funds exist. They're locked. Settlement is a matter of outcome, not negotiation.

---

## Stage 4: Acceptance

With both stakes deposited, the market activates. The contract is now binding.

On-chain, the market status changes from "Pending" to "Active." The encrypted terms remain private—observers can see that a market exists between two addresses, with 100,000 USDC at stake, but the subject of the bet remains invisible.

Sarah and Marcus go about their work. The pharmaceutical merger progresses through regulatory review. Neither needs to check the platform daily. The market will wait.

### What Observers See vs. What Participants Know

| Visible On-Chain | Private to Participants |
|-----------------|------------------------|
| Participant wallet addresses | Prediction question |
| Stake amounts (50,000 USDC each) | Resolution criteria |
| Market status (Active) | Deadline details |
| Creation and acceptance timestamps | Any custom terms |

This balance is intentional. The blockchain needs enough information to enforce settlement—but not enough to reveal trading thesis or strategic intent.

For Sarah and Marcus, this means their firms' research remains proprietary. Competitors see two addresses with a locked position. They don't see the pharmaceutical merger, the Q3 deadline, or anything that would expose the underlying conviction.

---

## Stage 5: Execution

August arrives. The Meridian-Vantage merger receives regulatory approval and closes on August 28—before the September 30 deadline.

Sarah was right.

Now the market needs to resolve. Private markets offer three mechanisms:

**Option A: Creator Resolution**
Sarah, as creator, can trigger resolution by attesting to the outcome. This works for informal bets between trusted parties. Marcus would see the resolution and could dispute if he disagreed.

**Option B: Designated Arbitrator**
At creation, Sarah could have specified a neutral third party—perhaps a mutual colleague or professional arbitrator—who would determine the outcome. The arbitrator's address would be recorded on-chain, and only they could trigger resolution.

**Option C: Auto-Pegging**
The most elegant solution: Sarah could have linked her private market to a public prediction market tracking the same merger. When the public market resolves, the private market automatically inherits the outcome.

This eliminates trust entirely. Neither Sarah nor Marcus determines who wins. The public market's resolution—verified by its own oracle mechanism—becomes the binding outcome.

Sarah chose Option C. The linked public market resolves "Yes" on August 29. Her private market immediately inherits this resolution.

### Automatic Settlement

The smart contract executes. No human intervention required. No escrow release approval. No waiting for the counterparty to transfer funds.

100,000 USDC moves to Sarah's wallet.

She didn't need to file a claim, engage lawyers, or rely on Marcus's goodwill. The contract executed itself because the conditions were met.

For Marcus, the loss is clean. He backed his view, the outcome went against him, and settlement was immediate. No lingering disputes, no awkward follow-up conversations, no counterparty risk on either side.

---

## The Cryptographic Foundation

Sarah and Marcus's experience was seamless, but significant engineering enables this simplicity.

### Wallet-Derived Identity

When Marcus signed that initial message to access Sarah's offer, he wasn't just authenticating. He was generating his encryption identity.

The signature—unique to his wallet—is mathematically transformed into an encryption keypair. The same wallet signing the same message always produces the same key. This means:

- **No separate key management**: Marcus's wallet backup is his encryption backup.
- **No central authority**: The platform never holds master keys. Decryption happens entirely in Marcus's browser.
- **Session convenience**: Once signed, the key is cached for the browser session. Marcus accesses all his private markets without repeated prompts.

### Why X-Wing and ChaCha20-Poly1305?

The envelope encryption uses algorithms designed for long-term security:

- **X-Wing** for key exchange—a hybrid combining classical X25519 with post-quantum ML-KEM-768
- **ChaCha20-Poly1305** for symmetric encryption—authenticated encryption that detects tampering
- **HKDF-SHA256** for key derivation—NIST-recommended, deterministic, and auditable

### Post-Quantum Protection

Here's a scenario that keeps cryptographers awake at night: an adversary records Sarah and Marcus's encrypted market terms today. The encryption is unbreakable with current computers. But in fifteen years, a sufficiently powerful quantum computer could theoretically crack the key exchange and reveal those terms.

This "harvest now, decrypt later" attack is particularly relevant for private markets. The terms Sarah and Marcus agreed to might still be sensitive years later—competitive intelligence doesn't always have an expiration date.

X-Wing addresses this by combining two key exchange mechanisms:

1. **X25519**: The same elliptic curve cryptography that secures Signal and modern TLS. Fast, well-audited, and secure against classical computers.

2. **ML-KEM-768**: A lattice-based key encapsulation mechanism from the NIST post-quantum standardization process. Believed to be secure against both classical and quantum computers.

The hybrid construction means Sarah and Marcus's market is protected if *either* algorithm remains secure. If quantum computers never materialize, X25519 provides proven classical security. If quantum computers arrive but ML-KEM holds, the market remains protected. The encryption only fails if both algorithms are broken—an exceedingly unlikely scenario.

**Key sizes are larger**: X-Wing public keys are 1,216 bytes compared to 32 bytes for pure X25519. The ciphertext overhead per participant increases from ~80 bytes to ~1,200 bytes. For typical private markets with 2-10 participants, this remains negligible—a few extra kilobytes in exchange for decades of quantum resistance.

**Performance remains practical**: Key generation and encapsulation add a few hundred microseconds. For the scale of private market operations—creation, acceptance, adding participants—this is imperceptible.

### Backward Compatibility

Markets created before the X-Wing upgrade remain fully readable. The envelope format includes a version field, and the system automatically uses the appropriate decryption path. Old markets use X25519; new markets use X-Wing. Participants don't need to manage this—it happens transparently.

### Forward Secrecy

Each envelope uses a fresh ephemeral key. If Marcus's main key were somehow compromised next year, markets created before the compromise remain secure. The ephemeral keys that sealed those envelopes are long discarded.

### Versioned Terms

Regulatory requirements evolve. The message users sign when generating encryption keys may need to incorporate new disclosures or acknowledgments.

The system handles this through versioned signing. New markets use updated terms. Old markets remain accessible—the version is stored in each envelope, ensuring backward compatibility forever.

Sarah's market with Marcus will be decryptable in ten years, regardless of how the signing terms evolve.

---

## Where This Applies

Sarah and Marcus's pharmaceutical merger bet illustrates 1v1 private prediction based on public information. The pattern extends to other legitimate use cases where privacy protects competitive intelligence rather than concealing improper conduct:

**Macroeconomic and Policy Forecasting**: Two analysts with differing views on interest rate decisions, election outcomes, or regulatory policy changes—all based on public data and published analysis—structure a private wager without revealing their firms' positioning.

**Technology and Product Timing**: Professionals tracking public product announcements, patent filings, and conference presentations disagree on launch timing. A private market lets them back their analysis without signaling to competitors.

**Sports, Entertainment, and Public Events**: Colleagues create private prediction markets on publicly observable outcomes—championship results, box office performance, award show winners—with automatic settlement.

**Negotiation Alignment**: Two companies in partnership discussions create a private market on deal terms. Whoever's projections prove more accurate wins a stake—incentivizing honest forecasting rather than negotiation posturing.

**Research Validation**: Academic or industry researchers with competing hypotheses about publicly measurable outcomes structure prediction markets to test their models against each other.

*Note: Use cases involving material non-public information, securities subject to trading restrictions, or outcomes where participants have undisclosed influence are not appropriate for prediction markets of any kind. Participants must ensure compliance with all applicable regulations and professional ethics requirements.*

---

## Comparison to Alternatives

| Feature | Traditional OTC | Public Prediction Market | Private Prediction Market |
|---------|-----------------|-------------------------|---------------------------|
| Position Privacy | High | None | High |
| Settlement Guarantee | Counterparty-dependent | On-chain | On-chain |
| Terms Confidentiality | Contract required | None | Cryptographic |
| Settlement Timing | Negotiated | Immediate | Immediate |
| Counterparty Credit Risk | Full exposure | None (escrowed) | None (escrowed) |
| Auditability | Limited | Full | Selective (participants only) |

---

## Honest Limitations

No system is without boundaries. In the interest of informed decision-making:

**Regulatory Compliance Remains Your Responsibility**: Privacy is not anonymity, and confidentiality is not impunity. Participants remain subject to all applicable securities laws, professional conduct rules, and regulatory requirements. The encryption protects terms from public observers—it does not shield illegal activity from legal process. Wallet addresses are recorded on-chain and can be linked to identities through standard investigative and compliance procedures.

**Participant Visibility**: Wallet addresses are visible on-chain. An observer can see that two addresses have a private market, even without knowing the terms. For Sarah and Marcus, this means their counterparty relationship is public—the subject is not.

**Irrevocable Access**: If Marcus is removed from a market after viewing the terms, he may have saved the content. Cryptographic removal prevents future access but cannot erase past knowledge.

**Wallet Security**: If Marcus's wallet is compromised, the attacker can derive his encryption keys. Hardware wallets provide stronger protection for high-stakes participants.

---

## Conclusion

Sarah and Marcus wanted something simple: a private bet with public enforceability. Terms that only they could see, but settlement that neither could escape.

Private prediction markets deliver this through a familiar structure—the five-stage contract lifecycle—enhanced with cryptographic privacy and automatic execution.

**Creation** encrypts terms for specified participants. **Offer** lets counterparties review with cryptographic assurance. **Consideration** escrows stakes immediately and irrevocably. **Acceptance** activates a binding, self-enforcing contract. **Execution** settles automatically when conditions are met.

The envelope encryption underneath enables efficient multi-party privacy. The wallet-derived identity eliminates central key management. And the smart contract removes counterparty risk entirely.

For technology and capital markets participants seeking private, trustless mechanisms for structured agreements—built on public information and compliant with applicable regulations—this is no longer theoretical.

Sarah collected her winnings. Marcus honored his conviction. Neither needed lawyers, escrow agents, or trust. Both operated within the bounds of their professional obligations, using privacy to protect competitive intelligence rather than to conceal improper conduct.

Just cryptography, code, and legitimate forecasting.

---

*For technical implementation details, see the [Envelope Encryption Specification](../developer-guide/envelope-encryption-spec.md). For user-focused guidance, see [Private Market Encryption](../user-guide/private-market-encryption.md).*
