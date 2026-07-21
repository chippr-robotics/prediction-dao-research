# Minting Tokens From Vetted Templates, Not Arbitrary Code

*How FairWins lets approved issuers create their own tokens without ever deploying code nobody reviewed — and what that one constraint buys everyone downstream.*

| | |
|---|---|
| **Series** | FairWins Engineering |
| **Audience** | Founders, product teams, and the crypto-curious — no Solidity required |
| **Tags** | `tokens`, `security`, `compliance`, `plain-english` |
| **Reading time** | ~7 minutes |

---

## The token nobody audited

An issuer on the platform wants to spin up a token — say, a points balance for a community, or a restricted instrument only vetted wallets are allowed to hold. The obvious path is the familiar one: write a smart contract, deploy it, and hope it does what its author claims.

That path becomes a problem the moment more than one person relies on it. Whose eyes were actually on that code? Does its transfer logic check the sanctions list, or quietly skip it? When the platform later shows a "Holders" tab for that token, is it reading a real, well-behaved token — or something that merely *looks* like one until the third transfer does something surprising?

Letting anyone deploy arbitrary code means every new token is a fresh, un-reviewed attack surface — and everything downstream, from the wallet interface to the compliance screen, has to defensively assume the worst about every token it encounters.

FairWins takes the opposite stance. On each network there is exactly one contract authorized to bring tokens into existence, and it does not accept code. You cannot hand it a program and say "deploy this." Instead, it stamps out copies from a small, fixed set of templates that the platform team wrote, audited, and locked in — and it presses a sanctions check into every single one on the way out the door.

This post walks through what that template model gives up, why it's worth it, and how the fixed menu grows when it needs to.

## One authority, a short menu

Think of the token factory as a licensed mint. It is the single, upgradeable contract responsible for issuance, and everything it produces is a permanent, unchangeable copy of a template. That split is deliberate: the *mint* can be improved over time; the *coins* it stamps out can never rewrite their own rules afterward.

The menu is intentionally short. It covers the standard token types a platform actually needs — a plain fungible token (think community points), a standard collectible/NFT, and a *restricted* token that can enforce an eligibility list and freeze or block specific holders. Each comes in two variants: a simpler single-owner version and a more flexible role-based version.

That's the entire menu. An issuer picks a type and fills in a few parameters — name, symbol, supply, a cap, an eligibility list — and gets back a token. They never choose *code*. Ask for a type that has no template configured and the request simply fails.

The copying mechanism itself is a well-established Ethereum pattern called a minimal proxy (the ERC-1167 standard): each new token is a tiny, cheap stub that borrows its behavior from one shared, already-audited master copy. The master is permanently locked against being initialized or hijacked itself — it can only be *copied from*, never taken over.

## What gets pressed in on the way out

The factory's issuance path is not a rubber stamp. Before any token is created, it enforces three things no issuer can opt out of: the name and symbol can't be empty, a template must exist for the requested type, and the issuer themselves must pass the platform's shared sanctions screen — the same fail-closed check the rest of FairWins uses, not a bespoke parallel one. On top of that, the ability to issue at all is a permission the platform grants deliberately; simply holding a wallet isn't enough.

The screening doesn't stop at creation. Every template carries that same sanctions check *into* the token it stamps out, and every one of those tokens re-runs the check on every transfer — screening both sender and recipient, and stepping aside only for the mint-and-burn endpoints, where there's just one real party.

Here is the payoff, and it's the whole reason for refusing arbitrary code: because the template is the *only* code an issuer can deploy, the platform *knows* this check exists in every token it has ever minted. A property proven once on a template holds for the entire population of copies. Sanctions aren't non-bypassable because of a policy memo — they're non-bypassable because there is no code path that omits them.

The restricted token type pushes the same idea one step further. Before offering a transfer, a well-built interface asks the token "would this transfer succeed?" and the token, at the moment of transfer, decides whether to allow it. A whole class of bug lives in the gap between those two answers — the preview says "yes," the transfer then says "no." The restricted template forecloses that by construction: the preview and the enforcement run through the *exact same* internal check, evaluated most-restrictive-first (sanctioned, then frozen, then not-eligible). What you're told will happen is what happens.

## Discovery you don't have to trust the tokens for

Copying solves creation. The other half is discovery: if tokens are just addresses floating around on-chain, how does the app list "everything this issuer minted," and how does anything know a given address genuinely came from the factory rather than an impostor?

The factory keeps its own registry. Every successful creation records the token — its type, address, issuer, metadata, and timestamp — and indexes it by issuer. So the app can answer "show me my tokens" straight from the chain, even on networks without a separate indexing service. And a simple lookup — is this address in the registry? — is a proof of provenance: a "yes" means this really is a factory-minted token, not something dressed up to look like one. Importantly, that registry entry is written only *after* the token is fully and successfully created, so a failed creation never leaves a phantom record behind.

## Why we built it this way

**Templates instead of arbitrary code.** The obvious cost is flexibility: an issuer can't ship a token with some exotic novel behavior. The benefit is that the platform can make and *keep* guarantees across every token it has ever issued — sanctions are enforced, the transfer preview matches reality, the data the app loads matches the token it's loading. For a platform whose wallet, search, and compliance surfaces all consume these tokens, that uniformity is worth more than open-ended expressiveness. Arbitrary deployment pushes the audit burden onto every reader; templates pay it once.

**Immutable tokens, an upgradeable mint.** Only the factory itself can be upgraded, and only in a careful append-only way. The tokens it issues are frozen — a holder's token can never have its rules changed out from under them by a later upgrade. Improving a template means registering a *new* one for *future* mints, never rewriting tokens already in circulation. The role-based variants were added exactly this way: new templates appended for new issuance, existing tokens untouched.

**Growing the menu is an admin act, reviewed and deliberate.** Adding or replacing a template is restricted to the platform admin and is treated as what it is: a considered, audited, one-way addition. The new template is written, put through the same automated security tooling as everything else, deployed once as a locked master, and only then made available. The audit story works *because* the surface is small — a handful of token types is something a human can actually review, unlike an open firehose of user-supplied code.

**Saying "not yet" instead of shipping something shaky.** One more advanced token type — a permissioned security-token standard — is intentionally *not* offered yet, because the mature, canonical implementation of it isn't yet compatible with the library versions this platform is pinned to. Rather than ship a downgraded version, its slot is reserved so the registry stays forward-compatible, and it'll land when a solid implementation exists. Honest absence beats a template nobody can stand behind.

## Where it runs

The token factory runs on the networks FairWins supports, with its addresses recorded as the source of truth. The app simply hides its token-issuance feature on any network where the factory isn't deployed, so there's never a button promising something the underlying system can't actually do.

The template model isn't glamorous. It says no to a lot of things an issuer might want. But it's precisely that refusal — no arbitrary code, one screened way in, a short and auditable menu of what comes out — that lets everything downstream treat a FairWins-minted token as a known, trustworthy quantity.

## Further reading

- [ERC-1167 Minimal Proxy Contract](https://eips.ethereum.org/EIPS/eip-1167) — the cheap-clone pattern behind each minted token
- [ERC-1404 Simple Restricted Token Standard](https://erc1404.org/) — the restricted-transfer model
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/5.x/) — the audited, open-source building blocks the templates are built on
