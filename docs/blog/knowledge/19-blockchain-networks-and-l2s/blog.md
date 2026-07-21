# Blockchain Networks and "Layer 2s," Explained Simply

*What a blockchain network actually is, why some are cheaper and faster than others, and why Bitcoin is a different animal from Ethereum*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Identity, Privacy & Networks |
| **Level** | Beginner |
| **Audience** | Anyone curious about crypto who has a phone and a bank app |
| **Tags** | `networks`, `layer-2`, `ethereum`, `polygon`, `bitcoin`, `basics` |
| **Reading time** | ~6 minutes |

---

## "Which network?" — the question that keeps popping up

You go to send some money in a crypto app, and before it lets you, it asks a question that sounds a little strange: *which network?* Ethereum? Polygon? Something called Bitcoin? Maybe there's a warning that fees will be higher on one than another.

If you've ever wondered what that choice actually means, this primer is for you. The good news: the idea underneath is simpler than the jargon makes it sound.

## What a blockchain network is

A **blockchain** is a shared record book that thousands of computers around the world keep at the same time. Instead of one bank holding the official copy of who owns what, every participant holds a matching copy, and they constantly agree on updates. Once something is written in — you sent money, you joined a group — it's extremely hard to secretly change, because everyone would have to be fooled at once.

A **network** is simply *one particular* shared record book, run by its own crowd of computers. Ethereum is one network. Bitcoin is another. Polygon is another. They are separate systems, each with its own record, its own rules, and its own community of computers keeping it honest. Money and information on one network don't automatically exist on another — the same way an account at one bank isn't automatically an account at a different bank.

That's really the whole idea. A "network" is a self-contained ledger with its own crowd running it.

## Why "layer 2" exists — and why it's cheaper

Here's the catch. A popular network like Ethereum can get crowded. Because every computer has to process and agree on every transaction, there's only so much room. When lots of people want in at once, they effectively bid against each other for space, and the **fee** — the small charge you pay to get your transaction recorded — goes up. On a busy day, a simple action on Ethereum can cost real money in fees alone.

A **layer 2** (often written "L2") is a clever fix. Think of Ethereum as a busy courthouse where every case is heard one at a time, slowly and expensively, but with ironclad authority. A layer 2 is like a fast side office that handles a big batch of everyday paperwork quickly and cheaply, then periodically walks a single summary back to the courthouse to be stamped as official.

Because the layer 2 bundles up many transactions and only settles a compact summary onto the main network, everyone shares the cost of that one trip to the courthouse. The result: **transactions that are much cheaper and much faster**, while still leaning on the security of the big network underneath.

**Polygon** is the most familiar example you'll meet in this app. It behaves almost exactly like Ethereum — same style of wallet, same kind of addresses — but transactions cost a tiny fraction as much and confirm in seconds. For everyday-sized activity, that difference is night and day.

## Why an app supports more than one network

If Polygon is cheaper, why not use it for everything? Because different networks are good at different things. Some features and communities live on **Ethereum** specifically. **Polygon** is ideal for frequent, everyday-sized actions where you don't want fees eating into small amounts. And **Bitcoin** is where many people prefer to hold and move value (more on that below).

Supporting several networks lets an app meet you where your money and your community already are, instead of forcing everything onto one. The trade-off is that *you* pick the right lane for each task — and a well-built app makes that choice clear rather than hiding it.

## Bitcoin is a genuinely different kind of network

Ethereum, Polygon, and several others belong to one big family. In that family, a network is essentially "a number with programmable contracts on it." These networks run little programs called **smart contracts** — self-operating agreements that live on the chain — and they're often called **EVM** networks, after the shared "engine" (the Ethereum Virtual Machine) they all run. Because they speak the same dialect, a wallet or app can treat them very similarly.

**Bitcoin is not in that family.** It's **non-EVM** — a different design with different rules:

- It doesn't run general smart contracts. It's built to do one thing exceptionally well: hold and move Bitcoin securely.
- It doesn't track balances as a running total in an account. Instead it holds value in discrete chunks of coins, a bit like carrying specific bills and coins in a wallet rather than a single account balance.
- Its addresses are meant to be **used once and rotated**, and its fees are priced by the size of the transaction rather than by "gas."

None of this makes Bitcoin better or worse — just fundamentally *different*. It's why an app can't simply treat Bitcoin as "one more Ethereum network." It has to speak a second language entirely.

## How this shows up in FairWins

When you use FairWins, that "which network?" moment is the choice we've been describing. Most everyday activity happens on Polygon, where fees are small and confirmations are quick. Some features connect to Ethereum, where certain communities and tools live. And Bitcoin appears as its own thing — a straightforward wallet to hold, send, and receive Bitcoin — rather than pretending to do everything the EVM networks do.

The app tries to make each network's strengths and limits honest: a feature that isn't available on a given network says so, instead of quietly failing.

## What to watch out for

- **Networks don't automatically talk to each other.** Sending Bitcoin to an Ethereum-style address (or vice versa) can lose your funds. Always match the network to the destination.
- **Fees are real, and they vary.** Cheaper isn't always available for every task. A good app shows you the exact cost before you approve — never approve a transaction whose fee you can't see.
- **"Layer 2" doesn't mean "no risk."** It means cheaper and faster, still anchored to a big network's security. It's a scaling tool, not a magic shield.

## Related deep-dive

Want the engineering details? Read [Adding Bitcoin to an App That Was Never Built for It](../../posts/25-bitcoin-non-evm/blog.md) — how FairWins added its first non-EVM network without breaking the assumptions built around the old ones.

## Learn more

- [ethereum.org: What is Ethereum?](https://ethereum.org/en/what-is-ethereum/) — a plain-language introduction
- [ethereum.org: Layer 2 explained](https://ethereum.org/en/layer-2/) — why L2s make transactions cheaper and faster
- [Polygon: official site](https://polygon.technology/) — the layer-2 network you'll use most here
- [Bitcoin.org: How Bitcoin works](https://bitcoin.org/en/how-it-works) — the original, non-EVM network in its own words
