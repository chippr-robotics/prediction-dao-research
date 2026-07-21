# What Is Sanctions Screening? (And Why an App Checks Your Wallet)

*Why a crypto app looks up wallet addresses against a blocklist — and how it does that without collecting your name, ID, or personal data*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Security & Custody |
| **Level** | Beginner |
| **Audience** | Anyone curious about crypto, no technical background needed |
| **Tags** | `sanctions`, `compliance`, `privacy`, `security`, `basics` |
| **Reading time** | ~5 minutes |

## A quick everyday scene

When you open a bank account, the bank runs a check in the background. It's making sure you're not on a government list of people and organizations that businesses are legally forbidden from doing business with — think terrorist financiers, drug cartels, and sanctioned regimes. You never see this happen. You just fill out the form, and either the account opens or it doesn't.

Crypto apps have the same legal obligation. But they have a very different tool to work with, because in crypto there often isn't a "form" full of your personal details — there's just a wallet. So the check looks different, too. This is called **sanctions screening**, and once you understand it, you'll know exactly what's happening the moment an app checks your wallet.

## What it actually is

A **sanction** is a legal restriction a government places on doing business with a specific person, company, or country. Governments publish these as public lists. In the United States, the main one is kept by an office of the Treasury Department called OFAC (the Office of Foreign Assets Control). If someone is on that list, businesses are not allowed to move money for them — full stop.

**Sanctions screening** is simply the act of checking a customer against those lists before doing business. It's the same idea whether you're a bank, an airline, or a crypto app.

The twist in crypto is *what* gets checked. A traditional bank checks your name and date of birth. A crypto app usually checks your **wallet address** — the long string of letters and numbers that identifies your account on the blockchain, a bit like an email address for money. Investigators and governments have publicly flagged certain wallet addresses as belonging to sanctioned people or to stolen-funds operations. Screening asks one narrow question: *is this particular address on a known blocklist?*

## Why it exists (and why apps take it seriously)

Two reasons, and they reinforce each other.

**The legal one.** Sanctions law is strict. It generally doesn't matter whether a business *meant* to help a sanctioned party — if the money moved, the violation happened. That makes screening a hard requirement, not a nice-to-have. An app that skips it is exposed no matter how good its intentions were.

**The keep-the-neighborhood-clean one.** Blocking known-bad addresses keeps stolen funds, scam proceeds, and sanctioned money from flowing through the app. That protects every honest user, because it keeps the platform from becoming a laundromat for criminal money — which is bad for everyone who uses it legitimately.

## How it works — the "guest list at the door" model

Picture a doorkeeper with a clipboard. The clipboard holds a list of addresses that are not allowed in. When you try to do something that moves money — join, deposit, place a wager — the doorkeeper glances at your wallet address and checks the list. Not on it? You go through, no fuss. On it? The action is refused.

Here's the part that surprises people: **this check doesn't need to know who you are.** A wallet address isn't a name, an email, or a passport number. The doorkeeper isn't asking "what's your identity?" — it's asking "is this specific address flagged?" It's more like a bouncer checking whether your ticket number was reported stolen than checking your ID against a photo.

Where does the list come from? Usually a specialized service that publishes, right on the blockchain, whether a given address matches the official government sanctions lists. The app reads that answer. A careful app also adds a rule for when the list can't be reached: if the answer isn't available, it blocks by default rather than waving everyone through. Better to pause than to accidentally let a forbidden transaction slip past. In security terms this is called **failing closed** — when in doubt, deny.

## How it shows up in FairWins

FairWins screens wallet addresses at the moments money enters the system — creating or accepting a wager, joining a pool, buying or renewing a membership. The check runs quietly in the background against a public sanctions blocklist. It doesn't ask for your name, your ID, or any personal documents; it looks at the wallet address, which you're already using anyway.

One deliberate design choice is worth calling out, because it's the fair one: screening blocks *new* money going **in**, but never blocks you from taking **out** what's already yours. If an address became blocked while its funds were still sitting in the app, freezing those funds would be a much heavier act than simply declining new business. So refunds and payouts of your own money are always allowed to leave. The check guards the entrance, not the exit.

## What to watch out for

- **Screening is not the same as identity verification (KYC).** Checking an address against a blocklist is a narrow, privacy-preserving check. It is *not* the app collecting your passport or building a profile of you. Don't assume one means the other.
- **A block isn't always a personal accusation.** Addresses can be flagged for reasons that have nothing to do with the current holder — for example, funds that passed through a sanctioned service. If you're ever unexpectedly blocked, it's worth understanding your wallet's history.
- **It's one layer, not a force field.** Screening keeps known-bad actors out; it doesn't make an app risk-free or vouch for anyone who *isn't* on the list. Keep your normal guard up.

The good news for the everyday user: a legitimate wallet passes screening invisibly. You'll almost never notice it — which is exactly how a well-built compliance check is supposed to feel.

## Related deep-dive

Want the engineering details? Read [Sanctions Screening as a Shared Building Block](../../posts/03-sanctions-compliance-gating/blog.md).

## Learn more

- [OFAC Sanctions List Service (US Treasury)](https://ofac.treasury.gov/sanctions-list-service) — the official source of US sanctions lists
- [Chainalysis sanctions screening oracle](https://go.chainalysis.com/chainalysis-oracle-docs.html) — how sanctioned wallet addresses are published on-chain
- [What are economic sanctions? (Investopedia)](https://www.investopedia.com/terms/s/sanctions.asp) — plain-language background
