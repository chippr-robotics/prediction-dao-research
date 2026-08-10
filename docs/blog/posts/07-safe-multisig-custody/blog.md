# Shared Vaults Where No One Person Can Move the Money

*How FairWins lets a group hold a shared treasury and act as the group — using battle-tested multisig wallets, and nothing but the blockchain to coordinate*

---

| | |
|---|---|
| **Series** | Custody & Multisig (part 1 of 2) |
| **Part** | 7 of 34 |
| **Audience** | Founders, product managers, and the crypto-curious |
| **Tags** | `multisig`, `shared-treasury`, `custody`, `self-custody` |
| **Reading time** | ~7 minutes |

> **Note**: FairWins wagers are peer-to-peer forecasts on publicly available information. Nothing here changes that: money that moves out of a shared vault passes the same sanctions and membership checks as a personal-wallet action, and everyone involved remains subject to applicable law.

---

## Several People, One Vault, No Server

The Ethereum Classic Cooperative holds its money the way most serious on-chain organizations do: in a **multisig** — a shared wallet where several people must approve before any money moves. No single keyholder can drain it. If one laptop is stolen or one person goes rogue, the funds are still safe, because a spend needs, say, two of the three owners to sign off.

We wanted groups to do exactly this inside FairWins: hold a shared treasury, then place a wager or send a payment *as the group*, with a spend only going through once enough co-owners approve. The shared wallet itself was the easy part. We use **Safe**, the most widely used multisig on Ethereum and its cousins — audited for years, already deployed on the networks we care about. Rolling our own would have been the single worst security decision available to us.

The hard part was everything around the wallet. The usual way people coordinate a Safe assumes a hosted server in the middle: it stores proposed transactions, collects approvals, and feeds them to the wallet's screen. FairWins has a firm rule against exactly this — **no company server the app depends on**. The app has to keep working, and members must never be locked out of their own money, even if every piece of FairWins-run infrastructure disappeared tomorrow.

So the real question was: how do the co-owners of a shared vault discover a pending transaction, check that it's legitimate, approve it, and execute it — using nothing but the blockchain itself? The answer needed surprisingly little new code: one tiny contract that holds no money and has no power.

## Why Safe, and Which Version

A "vault" in FairWins is a standard Safe multisig — not a fork, not a wrapper. Vaults you create work with the rest of the Safe ecosystem, and an existing Safe (like the Cooperative's) can be loaded just by its address.

The version we picked mattered more than we expected. We chose the release whose official contracts sit at the **same addresses on every network we support** — Ethereum Classic, its Mordor test network, and Polygon. One consistent set of addresses everywhere means far less that can go wrong, and it let us confirm each contract was really deployed by asking the chain directly rather than trusting a list. When those contracts aren't present on a network, the app honestly says the feature is unavailable. The app also carries no heavyweight Safe software library — the standard toolkit assumes the hosted server we refuse to run, and the little we actually need is stable enough to talk to directly.

## Approving Without a Middleman

A Safe can authorize a transaction two ways: owners can sign it off-chain and someone gathers the signatures, or each owner can register their approval **directly on the blockchain**. We use only the second. In plain terms:

1. **Build** the exact transaction the group wants to make.
2. **Fingerprint** it — reduce it to a unique hash, a short code that stands in for the full transaction and can't be forged.
3. **Approve** — each owner sends a small on-chain transaction that says "I approve the transaction with this fingerprint." The blockchain itself becomes the record of who has approved.
4. **Execute** — once enough approvals exist to meet the threshold, any owner triggers the transaction. The Safe checks the on-chain approvals and runs it.

No signatures are collected off-chain, and the same approval can't be counted twice. Best of all, this flow can never strand anyone: the vault's own on-chain state *is* the coordination, so if FairWins vanished, any standard Safe tool could read those same approvals and finish the job.

## The Missing Piece: Knowing What You're Approving

On-chain approvals create one real gap. When an owner is asked to approve, all the blockchain shows is the fingerprint — a meaningless-looking code that reveals nothing about where the money is going. The full details don't appear on-chain until the transaction executes, far too late to review.

The hosted server most people run exists largely to fill this gap. Our replacement is a deliberately tiny contract — think of it as a public bulletin board. When someone proposes a transaction, they post its full details there, and everyone else's app watches for proposals affecting their vault.

The clever part is that the board holds no trust. Each co-owner's app takes the posted details, **re-computes the fingerprint itself, and refuses to approve anything whose details don't match the fingerprint being claimed**. A tampered or spoofed proposal produces a different fingerprint and dies inside the co-owner's own app; the worst a bad actor can do by posting junk is waste their own transaction fee. The board carries information, never authority.

And because even this contract is optional, there's a fallback: a proposer can export the full transaction as a signed file and share it as a link or QR code. The co-owner imports it, checks the same fingerprint, and approves — working even on a network where the board was never deployed.

## "Operate As the Vault"

A custody tab that only sends simple transfers is just a basic Safe client, not a real integration. The whole point is that a member can *become* the vault: create a wager staked from the vault's funds, or pay someone from it, with the action held until the co-owners approve. Originally the app only knew you as your personal connected wallet. Rather than teach every feature about shared vaults, every money-moving action now flows through **one shared checkpoint**:

- **Personal mode**: send from your own wallet, exactly as before.
- **Vault mode**: assemble the group transaction, post it to the bulletin board, record your own approval — and return a *pending proposal*, never a completed action.

A persistent banner shows which identity is active, and a pending vault action shows up *only* in the vault's own queue — never as a phantom entry in your wager list or payment history until the blockchain confirms it. Implying money moved when it hasn't is exactly the dishonesty the design refuses.

One honest wrinkle surfaced along the way. Inbound movements — receiving funds, or a refund owed to the vault — need no group approval, since the contract routes that money to the recorded party no matter who asks. But *claiming a winning payout* is different: the contract insists the winner themselves claim it, so a vault that *wins* a wager must claim through the normal group-approval path. We documented that as a known exception rather than pretend a single owner could pull the payout alone.

## A Socket for Rules

Everything above makes the vault usable; it doesn't yet make it *governable* beyond "enough people approved." A multisig has exactly one control — a set number of owners agree — and once that bar is cleared it will send any amount, anywhere. Safe's answer is a **transaction guard**: a contract the Safe consults before executing anything, which can veto a transaction that breaks the rules. This feature ships the wiring so a brand-new vault can be rule-governed from its very first transaction. What those rules look like — spending limits and allowlists enforced at execution time, so even a quorum of compromised signers can't break them — is the subject of part 2.

## Design Decisions

- **Adopt a proven multisig, don't build one.** Years of audits and a whole ecosystem of compatible tools, for free — and we picked the version whose official addresses match across all three of our networks.
- **No hosted coordination.** On-chain approvals replace the middleman server. Each approval is a small fee-paying transaction; in exchange, the blockchain is the single source of truth and no one can ever be locked out.
- **A bulletin board that carries data, never trust.** Every proposal is re-verified inside each co-owner's own app, and the signed-file fallback means zero required infrastructure.
- **Honesty over convenience.** Every money-moving flow reroutes through one well-reviewed checkpoint, pending vault actions live only in the vault queue, backups store addresses and labels but never key material, and the vault-won-payout exception is documented rather than papered over.

## Further reading

- Safe, the multisig wallet used here — https://safe.global
- The EIP-712 standard for human-readable, signable transaction data — https://eips.ethereum.org/EIPS/eip-712
- EIP-1271, how smart-contract accounts prove a signature — https://eips.ethereum.org/EIPS/eip-1271
