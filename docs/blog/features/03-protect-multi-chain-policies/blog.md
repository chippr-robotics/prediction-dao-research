# Rules Your Vault Actually Enforces: Protect Goes Multi-Chain

*Shared vaults on every network you use, and spending rules the chain enforces — "Alice and Bob together, or Charlie alone", daily limits per token, and an approved list of contracts. Written in plain language, ordered by you, and changeable only with the same approvals that move money.*

---

A shared vault used to give you exactly one control: enough owners approve, and the transaction goes through. Any amount, to anyone, at any time. That is fine for two people who talk daily. It is not how a trading desk runs a treasury, and it is not how a family shares savings.

**Protect** — now in **Tools**, not Finance, because it is a security tool rather than a place you spend — answers both. Your vaults appear together across every network, and each one can carry a policy the chain itself enforces.

## Every vault, every network, one list

Open Protect and you see all your vaults at once, each with its network on the row. Not "your vaults on the network you happen to be connected to" — all of them. A vault on Polygon and a vault on Ethereum Classic sit side by side, each badged, testnet vaults visibly marked so you never confuse one for its mainnet twin.

Select a vault on a network you are not connected to and it opens read-only, with one button to switch. Nothing that changes state is offered until you are on the right chain, and the check runs **again** the moment you confirm — so if your wallet switched networks while you were reading, the action stops rather than landing somewhere unintended.

If a network cannot be reached, that row says so. It does not quietly disappear, and it does not claim your vault is gone.

**Loading a vault** searches every supported network. Paste an address and Protect finds it, wherever it lives — you do not have to know, or guess by switching networks until one sticks. If it is a vault on more than one chain, you are shown all of them and pick. If some network could not be reached, you are told which, because "not found here" and "could not look there" are different answers.

Protect is live on **Ethereum Classic, Mordor, Polygon, Base, Optimism and Arbitrum**.

## Rules, in the order you set them

A policy is a numbered list. **001** is checked before **002**. The first rule that covers a transaction decides it — and the list says so, in your language, not in code.

Each rule answers four questions:

- **Who must approve** — name any owners you like. All of them, or any two of them, or just one.
- **What can move** — any asset, the network coin, or one specific token.
- **How much** — a limit per transaction, and optionally per 24 hours.
- **Where it can go** — leave it open, or list the only destinations allowed.

Combine those and the arrangements people actually asked for fall out:

**"Alice and Bob together, or Charlie alone, up to 10,000 USDC."** Two rules. Rule 001 names Alice and Bob and requires both. Rule 002 names Charlie alone. When Alice and Bob both sign, 001 governs. When only Charlie signs, 001's requirement is not met and the rule immediately below it — covering exactly the same ground — takes over. Nothing else falls through: an amount over the limit is refused by the rule that governs it, not quietly passed down the list to a rule that would allow it.

**"Either of us up to 1,000, both of us up to 25,000."** Two rules with amount bands. Small transactions land in the first, larger ones in the second, and the second needs both signatures.

**"At most 500 USDC per transaction and 2,000 a day."** One token-scoped rule. Your limits on USDC say nothing about your limits on anything else.

**"Only Uniswap and this lending market."** Pick the services from a per-network list; add any other address by hand, with a plain warning that hand-added addresses are not ones we have checked. Approving a contract never exempts it from your amount limits — a rule's destinations and its limits apply together, always.

Reorder by dragging, or with the up and down buttons on every rule — the keyboard path is not an afterthought, because a list you cannot safely reorder is a list you are stuck with.

## Nothing changes without the same approvals that move money

Adding, editing, removing and reordering rules are all one proposal, approved by the same threshold that approves a transfer. Before you propose it, you see your current policy and the proposed one side by side, in order.

You cannot lock yourself out. Changing the policy is never blocked by the policy — if you set something too strict, the owners can always loosen it. That is a property of the contract, not a promise in a help page.

Two things the interface will tell you plainly, because they are easy to get wrong:

- **A rule that can never apply.** If rule 003 covers only what rule 001 already covers, it is flagged. It would never fire, and a rule you believe is protecting you but never runs is worse than no rule.
- **A rule naming someone who has left.** If an owner is removed while a rule still requires their approval, that rule is marked broken and transactions it governs cannot execute until you amend it. We would rather stop than quietly treat "the remaining owners" as consent from someone who is gone.

And one thing worth saying directly: **once a vault has rules, anything no rule covers is refused.** Rules are a list of what is allowed, not a list of exceptions. If you want a fallback, add a final catch-all rule — the composer will tell you when a policy would refuse everything.

## Where the enforcement actually happens

On the chain, not in the app.

Approvals are read from your vault's own on-chain record of who approved what. The rules live in a contract that has no owner, no admin, and no upgrade switch — nobody at FairWins can change your policy, pause it, or move your funds. That is deliberate: an upgrade key over a policy engine would be a way around every rule you set.

It also means new rule types arrive as a **new** engine that your owners choose to adopt, never as a silent change to the one already guarding your funds. Vaults on the earlier rules keep working exactly as before, and their policies are shown as they always were, until the owners decide otherwise.

The app's preview is advisory and says so. It checks amounts and destinations before you propose, and tells you which rule would refuse a transaction — but who has approved is checked when the transaction actually runs. When something is refused, you are told the rule number and why, not "transaction failed".

## Getting started

**Tools → Protect.** Create a vault — the flow states which network it will live on before you deploy — or load an existing one by pasting its address. Owners are entered with the same address field as the rest of the app: paste, scan a QR code, or pick from your address book.

A vault with no policy behaves exactly as it always has. Add rules when you want them.

---

*Protect's vaults are Safe multisigs; FairWins never holds your keys or your funds. Policy rules are enforced by an on-chain guard with no admin and no upgrade path. Testnet vaults are marked as such — assets there are not real.*
