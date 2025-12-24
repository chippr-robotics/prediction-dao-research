# Security Model

Understanding how the Prediction DAO platform preserves trust, protects participants, and maintains system integrity.

## Philosophy of Security

Security in a decentralized governance system requires more than technical safeguards. It demands a thoughtful blend of cryptographic protection, economic incentives, and transparency. The Prediction DAO platform approaches security through layers that work together to create a resilient environment where honest participation becomes the rational choice.

Think of the security model as a series of concentric circles. At the core lies the smart contract code itself, written carefully and audited thoroughly. Around that sits a layer of cryptographic privacy tools that shield individual positions while keeping aggregate data transparent. Further out, economic mechanisms create skin-in-the-game that discourages manipulation. Finally, time delays and governance checks provide humans with the breathing room needed to catch problems before they cause harm.

## Understanding the Threats

Before diving into defenses, let's talk about what we're defending against. Prediction markets face unique challenges because they sit at the intersection of money and information. Several threat categories matter here:

**Market manipulation** occurs when someone tries to move prices artificially rather than letting them reflect genuine beliefs. Imagine a large trader buying huge amounts of PASS tokens not because they believe a proposal will work, but to create the illusion of support.

**Oracle manipulation** targets the system's connection to reality. Since markets resolve based on welfare metric values reported by oracles, a dishonest reporter might submit false data to benefit their position. The challenge is ensuring oracles tell the truth even when lying could be profitable.

**Vote buying and collusion** threaten the core premise that market prices aggregate genuine knowledge. If participants can be bribed or coordinate to manipulate outcomes, the system loses its predictive power. This becomes especially problematic in governance contexts where decisions affect real resources.

**Smart contract exploits** represent technical vulnerabilities in the code itself. Unlike traditional systems where bugs can be patched quickly, blockchain code is immutable once deployed. A single overlooked vulnerability could compromise the entire system.

**Front-running** exploits the public nature of blockchain transactions. When someone sees your trade in the mempool before it executes, they might rush to front-run you by submitting a transaction with higher gas fees, profiting from the price movement your trade will cause.

Some threats fall outside our scope. We don't defend against nation-state level attacks on the underlying blockchain, physical coercion of participants, or complete network compromise. These require different approaches at the infrastructure layer.

## How User Data Stays Private

Privacy in a public blockchain context seems paradoxical at first. Every transaction gets recorded permanently and publicly. Yet participants in prediction markets need privacy to prevent coordination, vote buying, and social pressure from corrupting their honest assessments.

The platform solves this through two complementary systems borrowed from cutting-edge research: Nightmarket for position encryption and MACI for anti-collusion.

### Position Encryption with Nightmarket

When you trade on a prediction market, your exact position size and direction remain hidden even though the trade gets recorded on-chain. Here's how that works in practice.

Imagine you want to buy 100 PASS tokens for a proposal. Instead of broadcasting "Alice buys 100 PASS tokens," your wallet creates a cryptographic commitment. This commitment acts like a sealed envelope that proves you made a valid trade without revealing the details inside.

The commitment uses a Poseidon hash, which is specially designed to work efficiently with zero-knowledge proofs. Your wallet generates a proof that demonstrates several things simultaneously: you have sufficient balance, you're not double-spending, and your trade falls within valid parameters. All of this happens without revealing your identity, position size, or trading direction.

These encrypted positions get submitted to the PrivacyCoordinator contract, which batches them together with other trades in the same epoch. An epoch lasts one hour, and all positions within that epoch get processed together. This batching prevents timing analysis where observers might correlate the timing of your on-chain transaction with price movements to infer your position.

From the public perspective, the blockchain shows aggregate data: total trading volume, the overall price movement, the number of positions submitted. Individual positions remain private, viewable only by you through your private keys.

### Key Changes to Prevent Vote Buying

The MACI (Minimal Anti-Collusion Infrastructure) component addresses a more subtle problem. Even with encrypted positions, someone might try to bribe you by saying "show me your private key after you vote for my preferred outcome, and I'll pay you."

MACI makes this unenforceable through key-change messages. When you register with the system, you submit a public key. All your encrypted positions use this key. But at any time, you can submit a key-change message (encrypted with your old key so only you can create it) that establishes a new public key.

This key change invalidates all your previous positions. So if someone bribes you to vote a certain way, you can accept their payment, vote as you actually believe, then change your key. The briber cannot verify whether you kept your promise because your key change makes your original encrypted positions unverifiable.

The beauty of this approach is that it makes vote buying economically irrational for the briber. They have no way to enforce the agreement, so rational actors won't pay for unverifiable votes.

### Preventing Front-Running

Traditional exchanges suffer from front-running because pending transactions sit visibly in the mempool. Bots monitor the mempool and submit competing transactions with higher gas fees to execute first, profiting from the price movement they know is coming.

The batch processing approach naturally prevents this. Your encrypted position goes into a batch with dozens of others, and the batch gets processed atomically. No one can see your specific trade to front-run it. They only see the aggregate effect after the epoch closes.

## Economic Security Through Bonds

The platform uses financial stakes to align incentives with honest behavior. This bond system creates a situation where honesty becomes the most profitable strategy.

When you submit a proposal, you post a 50 ETC bond. This bond gets returned if your proposal goes through the process in good faith, even if it ultimately gets rejected by the markets. But if you submit spam or clearly malicious proposals, the bond gets slashed.

This creates a simple calculation: is the potential gain from spamming the system worth losing 50 ETC? For genuine proposers, the bond represents a recoverable deposit. For spammers, it becomes an expensive barrier.

This creates a simple calculation: is the potential gain from spamming the system worth losing 50 ETC? For genuine proposers, the bond represents a recoverable deposit. For spammers, it becomes an expensive barrier.

Oracle reporters face a similar dynamic but with higher stakes. Reporting welfare metric values requires a 100 ETC bond. If the community accepts your report, you get the bond back. If someone successfully challenges your report as inaccurate, you lose the bond.

The interesting part comes with challenges. To challenge an oracle report, you must post a 150 ETC bond that exceeds the reporter's stake. This asymmetry serves a purpose. Challenging should be accessible enough that false reports get caught, but expensive enough that frivolous challenges don't clog the system.

If your challenge succeeds, you get your bond back plus a portion of the slashed reporter bond as a reward. If your challenge fails because the original report was accurate, you lose your bond. This creates a two-sided incentive: reporters want to tell the truth to keep their bond, and challengers want to only challenge when they have strong evidence.

### Access Controls and Timelock Protection

The system includes a guardian multisig that can trigger an emergency pause. This represents a pragmatic balance between security and decentralization during the early phases.

Initially, the guardian multisig requires 5 signatures out of 7 total guardians. These guardians have limited powers: they can pause the system in response to a discovered vulnerability, but they cannot modify proposals, steal funds, or change outcomes.

Every proposal includes a 2-day timelock before execution. This delay serves multiple purposes. First, it gives the community time to review the proposal one last time and notice any issues. Second, it opens a window for the ragequit mechanism, allowing dissenting token holders to exit with their proportional share of the treasury if they strongly disagree with an approved proposal.

Spending limits add another layer of defense. No single proposal can request more than 50,000 ETC, and the daily aggregate across all proposals caps at 100,000 ETC. These limits prevent a compromised system or malicious proposal from draining the entire treasury at once.

### Progressive Decentralization Over Time

Security doesn't mean keeping control centralized forever. The guardian powers decrease on a fixed schedule, eventually disappearing entirely as the system proves its resilience.

In year one, guardians have full emergency pause authority. They can respond quickly to threats while the system is new and more vulnerable. During year two, the multisig threshold increases to 6-of-7, making emergency actions require broader consensus among guardians.

By year three, guardian authority shrinks to pause-only powers. They lose the ability to make parameter changes or upgrades, even in emergencies. By year four and beyond, the guardian multisig dissolves completely, leaving the system fully under community control through the futarchy mechanism itself.

This timeline balances security with the eventual goal of decentralization. New systems carry higher risks that justify more centralized safeguards. As the system matures and proves robust, those safeguards can fade away safely.

## Oracle Security and Truth

Oracles connect prediction markets to reality. When a proposal's trading period ends, an oracle determines the actual welfare metric values under both the PASS and FAIL scenarios. This connection to ground truth makes oracle security critical.

The platform uses a multi-stage process designed to encourage accurate reporting while making manipulation expensive and risky.

### Designated Reporting Phase

Anyone can become the designated reporter by being first to submit a report with the required 100 ETC bond. This report includes welfare metric values for both scenarios (what would happen if the proposal passes, what would happen if it fails) along with evidence supporting those values.

The evidence typically takes the form of an IPFS hash pointing to a detailed document showing methodology, data sources, calculations, and timestamps. This transparency allows the community to verify the reporter's work.

For three days, the report sits in a settlement window. During this time, the community can examine the evidence and decide whether it looks accurate.

### Challenge Period

Following settlement, a two-day challenge period begins. If someone believes the report is inaccurate, they can challenge it by posting a 150 ETC bond and providing counter-evidence.

The higher bond requirement for challenges prevents cheap griefing while ensuring serious challenges can proceed. If you genuinely believe a report is false and you have strong evidence, risking 150 ETC to correct it and potentially earn rewards makes sense. If you're just hoping to delay things or cause trouble, the high cost deters you.

### Escalation and Final Resolution

If a challenge appears, the dispute escalates to UMA, a decentralized truth oracle that uses token holder voting to resolve disagreements. UMA voters examine both sides' evidence and vote on which is more accurate.

This escalation mechanism provides a final arbiter while keeping most resolutions simple. The vast majority of reports should be straightforward and uncontested, with escalation happening only when genuine disagreement exists.

Bonds get distributed based on the outcome. If the original report stands, the challenger loses their bond, and the reporter keeps theirs. If the challenge succeeds, the reporter loses their bond, the challenger gets theirs back plus a reward, and the market resolves using the corrected values.

### Time-Weighted Average Pricing

For metrics like treasury value, the system uses time-weighted average price (TWAP) oracles rather than spot prices. TWAP calculates the average price over a period, making manipulation much more expensive.

A manipulator would need to maintain an artificial price for the entire averaging period, not just manipulate a single moment. This dramatically increases the cost of manipulation while providing more stable, representative values for governance decisions.

## Smart Contract Security Practices

The smart contract code itself represents the foundation of security. Several practices minimize the risk of vulnerabilities.

### Established Patterns and Audited Libraries

Wherever possible, the contracts use OpenZeppelin libraries. These libraries have been audited extensively and battle-tested across thousands of projects. Rather than reinventing core functionality like access control or token handling, building on OpenZeppelin reduces the surface area for bugs.

### Reentrancy Guards

All functions that involve external calls or value transfers include reentrancy guards. These guards prevent the classic attack where a malicious contract calls back into your contract during execution, potentially executing critical functions multiple times in an unexpected way.

### Integer Overflow Protection

Solidity 0.8 and later includes built-in overflow checking, automatically reverting transactions that would overflow or underflow. This eliminates an entire class of vulnerabilities that plagued earlier contracts.

### Integer Overflow Protection

Solidity 0.8 and later includes built-in overflow checking, automatically reverting transactions that would overflow or underflow. This eliminates an entire class of vulnerabilities that plagued earlier contracts.

### Comprehensive Access Control

Every sensitive function checks that the caller has appropriate permissions. Only the FutarchyGovernor can activate proposals. Only registered reporters can submit oracle values. Only the system itself can resolve markets and distribute rewards.

### Audit Requirements and Bug Bounties

Before any mainnet deployment, the platform requires a minimum of two independent security audits from reputable firms. These audits involve expert security researchers examining the code line-by-line, looking for vulnerabilities, testing edge cases, and verifying that the implementation matches the specification.

Following audits, a bug bounty program with 100,000 USD in ETC reserves rewards security researchers who find and responsibly disclose vulnerabilities. This ongoing incentive helps catch issues even after deployment.

Formal verification of critical functions uses mathematical proofs to guarantee certain properties hold under all possible conditions. While formal verification can't catch every bug, it provides extremely high confidence in core invariants like "the total bond pool always equals the sum of individual bonds."

## Real-World Security Scenarios

Understanding security mechanisms in theory helps, but seeing them work through concrete examples makes the picture clearer.

### Scenario: Attempted Market Manipulation

Consider a wealthy trader, Alice, who wants to manipulate a proposal's market to make it look more popular than it deserves. She starts buying large amounts of PASS tokens, trying to push the price up and create the illusion of community support.

The LMSR market maker handles this gracefully. As Alice buys more PASS tokens, the price increases, but with bounded impact. The logarithmic cost function means each additional token costs more than the last, making manipulation increasingly expensive. Alice might be able to move the price somewhat, but she cannot push it arbitrarily high without spending astronomical amounts.

Meanwhile, other traders see the artificially high price and recognize an opportunity. If they believe Alice's assessment is wrong, they can sell PASS tokens or buy FAIL tokens at what they consider favorable prices. The market self-corrects as rational traders take the other side of Alice's position.

The privacy mechanisms prevent Alice from targeting or bribing specific traders. She cannot see who holds large positions that could counteract hers. She cannot offer targeted bribes because she cannot verify whether someone actually changed their position after accepting payment.

Finally, the multi-day trading period (7-21 days) means Alice would need to maintain her manipulation for an extended period while other traders have time to respond. This makes manipulation not just expensive but unsustainable.

### Scenario: False Oracle Report

Bob becomes a designated reporter and submits welfare metric values. He posts the required 100 ETC bond and provides an IPFS hash to his evidence. But Bob has made a critical error in his calculations, or perhaps he is deliberately trying to manipulate the outcome.

During the three-day settlement window, community member Carol reviews Bob's evidence. She notices the error and gathers correct data showing the actual welfare metric values differ significantly from Bob's report.

Carol decides to challenge the report. She posts a 150 ETC bond and submits her counter-evidence with corrected calculations. The dispute escalates to UMA's oracle system.

UMA token holders examine both sides' evidence. Carol's evidence includes raw data, correct methodology, and independently verifiable calculations. Bob's evidence contains the error. UMA voters recognize Carol's submission as accurate and vote accordingly.

As a result, Bob loses his 100 ETC bond (slashed for false reporting), Carol gets her 150 ETC back plus a portion of Bob's slashed bond as a reward, and the market resolves using the correct values Carol provided.

This outcome accomplishes several things. Bob faced real financial consequences for his error or attempted manipulation. Carol got compensated for doing the work to correct the record. Future reporters see that accuracy matters and sloppy or malicious reporting carries costs. The market participants ultimately get the correct resolution despite Bob's initial false report.

### Scenario: Attempted Vote Buying

David holds governance tokens and sees a proposal coming up for vote. Eve, who stands to benefit significantly if the proposal passes, approaches David with an offer. "Vote for this proposal," she says, "show me your encrypted private key after voting so I can verify you did it, and I'll pay you 1 ETH."

David accepts the offer and registers a public key with the system. He submits encrypted positions buying PASS tokens, using Eve's payment to fund the purchase. Eve monitors the blockchain and sees encrypted positions being submitted during the right timeframe.

After the epoch closes, David sends Eve what appears to be his private key. Eve thinks she can verify his vote. But David has been clever. Before sending the key, he submitted a key-change message using his actual key. This message, encrypted so only he could create it, established a new public key and invalidated all his previous positions.

The "private key" David sent to Eve is actually a decoy. Even if Eve tries to decrypt his positions with it, she gets garbage data or positions that no longer matter because they were invalidated by his key change. David then uses his real key to submit new positions reflecting his actual beliefs about the proposal.

Eve realizes she has no way to verify whether David kept his promise. She cannot distinguish between David changing his vote after accepting payment or David never voting for her proposal in the first place. This uncertainty makes vote buying economically irrational for future buyers like Eve. They're paying for promises they cannot verify.

### Scenario: Smart Contract Vulnerability Discovered

Frank, a security researcher, finds a potential vulnerability in the market making contract. Instead of exploiting it, he responsibly discloses it to the team through the security email.

The guardian multisig receives the report and evaluates the severity. This looks like a real issue that could allow manipulation under specific conditions. The guardians trigger an emergency pause, freezing proposal submissions and trading while preserving all existing positions and bonds.

The development team creates a fix and deploys it using the UUPS proxy upgrade mechanism. The fix goes through expedited review by the auditors who examined the original code. Once verified, the upgrade transaction gets queued with appropriate timelock.

After the timelock period passes without issues, the upgrade executes. The guardians unpause the system. Frank receives a bug bounty reward for his responsible disclosure. The team publishes a post-mortem explaining what happened, how it was fixed, and what steps are being taken to prevent similar issues.

This incident actually strengthens trust in the system. The vulnerability got caught and fixed before any exploitation. The response was transparent and professional. Frank's reward incentivizes other researchers to look for issues rather than exploit them.

## Monitoring and Response

Security is not a one-time achievement but an ongoing process requiring constant vigilance.

### What Gets Monitored

The system tracks several key metrics that could indicate security issues:

Unusual trading volumes might suggest manipulation attempts or system gaming. Rapid price movements inconsistent with genuine information could indicate front-running or coordination. Failed transactions clustered together might reveal someone probing for vulnerabilities.

Bond forfeiture rates provide insight into the health of the incentive system. If many proposers or reporters lose their bonds, either the system is working correctly to punish bad behavior, or the bond amounts might need adjustment.

Challenge rates on oracle reports indicate whether the reporting system functions properly. Too few challenges might mean reports are accurate, or it might mean the challenge bond is too high. Too many challenges might indicate widespread disputes about data or attempts to grief reporters.

### Incident Response

When something goes wrong, the response follows a structured process rather than chaotic improvisation.

Detection happens through automated monitoring and community reports. The monitoring system alerts guardians when metrics cross certain thresholds. Community members can also report suspicious activity or discovered vulnerabilities.

Assessment involves the guardians evaluating severity and determining the appropriate response. Is this a critical issue requiring immediate pause? A medium issue that needs addressing but not emergency action? Or a false alarm that requires no response?

Response actions depend on severity. Critical issues trigger the emergency pause while the team investigates and develops a fix. Medium issues might get addressed through the normal upgrade process. Minor issues get documented and queued for the next regular maintenance.

Resolution includes implementing the fix, testing it thoroughly, deploying through appropriate channels (expedited for emergencies, normal governance process for non-critical issues), and verifying the fix resolves the issue.

Finally, post-mortem reports document what happened, what the root cause was, how it was fixed, and what steps prevent similar issues in the future. This transparency builds trust and helps the entire ecosystem learn from incidents.

## Best Practices for Users

Security tools only work when users employ them correctly. Here are practical recommendations for different types of participants.

### For Everyone

Hardware wallets provide the strongest protection for significant holdings. While convenient, browser extension wallets remain more vulnerable to phishing and malware. For amounts worth protecting, hardware wallets offer reasonable cost-benefit tradeoffs.

Verify contract addresses before interacting with them. Phishing sites often look identical to legitimate ones but interact with malicious contracts. Double-checking the address against official sources takes seconds and prevents most scams.

Never share private keys, seed phrases, or password-encrypted key files. Legitimate services never ask for these. Anyone requesting them is trying to steal your funds.

Watch for phishing attempts in email, social media, and chat. Attackers often impersonate team members, create fake support channels, or promote scam versions of legitimate sites. Verify through official channels before trusting communications from unfamiliar sources.

### For Traders

Start with small positions while you learn the system. Experimenting with amounts you can afford to lose lets you understand the mechanics without risking serious capital. Scale up as you gain confidence and understanding.

Use key changes if anything feels suspicious. If someone approaches you about coordinating trades, if you suspect vote buying attempts, or if you just want additional privacy, submitting a key-change message takes moments and invalidates any previous commitments.

Monitor your positions regularly through the interface. While positions remain private, you can see your own holdings and verify that trades executed as expected.

Report anomalies you observe. If you notice unusual behavior, suspicious patterns, or potential vulnerabilities, reporting helps protect the entire community.

### For Proposers

Provide accurate, complete information in your proposals. Misleading the community might seem advantageous short-term, but it risks your bond and your reputation while harming trust in the system.

Respond to questions and concerns during the review period. Engagement shows good faith and helps the community make informed assessments. Going silent often raises suspicions.

Avoid promising unrealistic outcomes. Markets work best when participants make honest predictions about effects, not when proposers oversell benefits or hide costs.

Engage honestly with the community throughout the process. The goal is not just getting your proposal approved but building trust and demonstrating competence that benefits future endeavors.

## Looking Toward Mainnet

Current deployments are research code on testnet. Before mainnet launch, several additional security measures become critical.

Two independent security audits from reputable firms provide professional review of the codebase. Different auditors catch different issues, and multiple perspectives improve coverage.

The bug bounty program with 100,000 USD in ETC reserves rewards ongoing security research. This incentive helps discover vulnerabilities before attackers can exploit them.

Formal verification of critical functions provides mathematical proofs that certain properties always hold. While expensive and time-consuming, formal verification offers the highest confidence for core components.

A 30-day community review period after audits complete gives the entire ecosystem time to examine findings, test fixes, and raise concerns before launch.

Extended testnet deployment under conditions mimicking mainnet helps discover issues that only appear under real-world usage patterns. The testnet phase should include stress testing, attempts at manipulation, and exploration of edge cases.

## For More Details

The [Privacy Mechanisms](privacy.md) documentation covers cryptographic implementations in depth.

The [Introduction](introduction.md) provides system overview context.

The [How It Works](how-it-works.md) guide explains operational details.

The [Governance](governance.md) documentation describes the decentralization roadmap.

For security concerns requiring confidential disclosure, email security@example.com with detailed description and reproduction steps. Responsible disclosure earns bug bounty eligibility and credit for improving the system's security.

