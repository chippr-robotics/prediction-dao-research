# Private and Encrypted: How a Public Blockchain Can Still Keep a Secret

*What encryption and "end-to-end" really mean in everyday terms — and how an app built on a public ledger can still keep the terms of a private wager confidential.*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Identity, Privacy & Networks |
| **Level** | Beginner |
| **Audience** | Crypto-curious beginners — no technical background needed |
| **Tags** | `encryption`, `privacy`, `end-to-end`, `plain-english` |
| **Reading time** | ~5 minutes |

## A locked box on a public shelf

Picture a glass display case in the middle of a busy train station. Anyone walking by can see what's inside. Now picture putting a small locked strongbox *inside* that case. Everyone can see the box is there. Nobody but the keyholder can see what's in it.

That's the situation a blockchain app lives in. A **blockchain** is a public, shared ledger — a record that everyone can read and no one can secretly rewrite. It's the glass case: transparency is the whole point, and it's what lets a smart contract hold your money honestly without a bank in the middle.

But some things you genuinely don't want the whole station to see. If you and a colleague make a private wager on a public outcome, you might not want the *terms* of that bet broadcast to the world. So how do you keep a secret on a shelf everyone can see? You put it in a locked box. That box is **encryption.**

## What encryption is

**Encryption** is scrambling information so that only someone with the right key can unscramble it. Locked, it looks like meaningless noise. Unlocked with the correct key, it snaps back into the original message.

A useful mental model: encryption turns your message into a locked box, and the "key" is a secret only the right people hold. Anyone can carry the box around, photograph it, store it, even keep a copy forever — and it's still just a lump of metal to them. Without the key, there's nothing to read.

You already rely on this constantly. When your browser shows a little padlock, when your messaging app protects your chats, when your phone locks its contents behind your Face ID — that's encryption working quietly in the background.

## What "end-to-end" adds

You'll often hear the phrase **end-to-end encryption**, and it's worth understanding because it's stronger than plain encryption.

Imagine sending a locked box through the postal service. Plain encryption might mean the post office *can* open the box in the middle if it wants to — it holds a master key "for your convenience." End-to-end encryption means the box can only be opened by **you and the person you're sending it to** — the two *ends*. The postal service, the app maker, the servers in between: none of them hold a key. They carry a sealed box they physically cannot open.

The difference is *who holds the keys.* If a company can read your message, it can be forced to hand it over, or leak it in a breach. If only the two ends hold keys, there's no master key to steal, subpoena, or lose. The trade-off is real: if *you* lose your key, no help desk can recover the contents, because nobody else ever had it.

## How it works, without the math

The clever part is how a secret gets shared between exactly the right people. Here's a correct mental model:

1. When a private message is created, the app makes up one brand-new random key and locks the message with it. Now it's a sealed box.
2. That single key then gets **re-wrapped separately for each person allowed to read it** — locked again inside a little envelope only *that* person's wallet can open.
3. The sealed box and those personal envelopes get stored. The public ledger keeps only a tiny reference — a claim ticket pointing at the box — not the contents.

So the message is encrypted *once*, but the key to it is handed out privately to each participant, wrapped so only their own wallet can unwrap it. No central service ever holds a master key. If a third party grabs everything that's stored, they get a locked box and a pile of envelopes they can't open.

## How it shows up in FairWins

FairWins settles wagers on a public blockchain — the escrow, the payouts, the fact that a wager exists are all transparent, exactly as they should be. But the **private terms** of a confidential wager don't need to be shouted to the world. Two people can back opposing views of a public outcome without publishing their reasoning or positioning on a public board.

The way that works matches the model above: the sensitive details are sealed with encryption and only the participants hold keys derived from their own wallets. What lives on the public chain is the money-handling and a small reference — not the confidential contents. The platform never holds a master key to your private terms, which is the point: privacy that doesn't depend on trusting the platform to keep quiet.

One honest boundary worth stating plainly: this kind of privacy protects your *competitive information* — your strategy, your terms — from onlookers. It is not a tool for hiding illegal activity, and all participants remain subject to applicable law. FairWins wagers are meant as skill-based forecasting on publicly available information, not a way around the rules.

## What to watch out for

- **"Encrypted" is only as strong as key custody.** The real question is always *who holds the key.* End-to-end means only the ends do — which is safest, but also means losing your key can mean losing access for good.
- **Public chain, private contents — both are true at once.** A blockchain being public does not mean *everything* about you is exposed. The ledger can show that a transaction happened while its sensitive details stay sealed.
- **Privacy is not anonymity.** Keeping the *terms* of a wager confidential is different from hiding *who* you are. Wallet activity can often still be observed, even when the contents can't be read.
- **Encryption doesn't excuse anything.** Confidentiality protects legitimate privacy; it doesn't place you above the law. Treat it as a shield for your strategy, not a cloak for misconduct.

## Related deep-dive

Want the engineering details? Read [Private Prediction Markets: Confidential Terms with Trustless Settlement](../../posts/18-envelope-encryption/blog.md).

## Learn more

- [What is encryption? (Cloudflare Learning)](https://www.cloudflare.com/learning/ssl/what-is-encryption/)
- [What is end-to-end encryption? (Cloudflare Learning)](https://www.cloudflare.com/learning/privacy/what-is-end-to-end-encryption/)
- [Encryption, explained (Electronic Frontier Foundation — Surveillance Self-Defense)](https://ssd.eff.org/module/what-should-i-know-about-encryption)
