# Moving Your Data Between Devices — Without a Server That Can Read It

*How FairWins backs up your address book and settings to public storage, locked with a key only your own wallet can reproduce*

| | |
|---|---|
| **Series** | Privacy Architecture (part 3) |
| **Audience** | Product, founders, and the privacy-curious |
| **Tags** | `privacy`, `backup`, `plain-english` |
| **Reading time** | ~7 minutes |

## The data that lives in one browser

A member has used FairWins on their laptop for six months. They've built up a curated address book — contacts with nicknames and notes — and tuned their settings: favorite markets, saved searches. Then they open the app on their phone. Everything is empty.

This isn't a bug. FairWins deliberately has no backend of its own — the whole system is your browser, public file storage, and the blockchain. There is no company database to sync from, which is exactly why the platform can promise it never reads your data: it never holds it. The flip side is that everything you personally created lives inside one browser, tied to your wallet. A second device can't see it, and clearing your browser wipes it for good.

The usual fix is a sync server. The company stores each member's data, devices pull it down — except now there's a database of every member's contact list, and a company that can read it, lose it, or be forced to hand it over. That trade was never on the table.

The answer keeps the no-backend promise intact. Your device gathers your data, locks it with a key **only your wallet can reproduce**, uploads the locked file to public storage, and writes a tiny pointer to it on the blockchain. Any device holding the same wallet can walk that trail backwards — read the pointer, fetch the file, re-create the key, unlock. The "server" here is public infrastructure that only ever holds a scrambled file and a fingerprint of it. Let's walk each stage.

## A key that travels with you, stored nowhere

The hard part of this kind of backup isn't the locking — it's the key. If the key lives on your laptop, your phone can't unlock anything. If it lives on a server, you've rebuilt the thing you were trying to avoid. If you have to write down a recovery code, you'll lose it.

FairWins sidesteps storage entirely: the key is *re-created on demand* from something you already carry — your wallet. Your wallet signs one fixed message, and that signature is turned into the lock's key.

This works because of a well-established property of standard wallets: signing the same message with the same wallet produces the exact same signature every time, on any device. Sign it on your laptop to lock your data; sign it on your phone and you hold the identical key. Nothing is stored, sent, or handed to anyone. It's the same idea part 1 used for wager keys — but the message is deliberately different, so your backup key can never accidentally match any other key your wallet produces.

Passkey accounts (the Face ID / fingerprint sign-in standard) don't sign messages the same way, so a matching path produces the same key from the account's own secure seed. Either way the key comes out the same for a given account, so a backup made in a wallet session restores fine in a passkey session, and vice versa. And it fails *honestly*: a wallet that can't reproduce its own key gets a clean "no usable backup" message — never a garbled, half-decrypted mess presented as your real data.

## The bundle: one file, every network

What actually gets locked is a single bundle per wallet, assembled from a short, explicit list of things worth syncing. Each item declares how to load itself, how to combine on restore, and — importantly — whether it belongs to a specific network. Today the list holds five kinds of data:

- **Address book** — merged additively, so restoring never deletes contacts; every saved address remembers its network.
- **Preferences** — your global settings; newest wins.
- **Vault references** — pointers to your custody vaults.
- **Activity ledger** — a private, on-device record of things that can't be rebuilt from the blockchain; restores always add rather than delete, since quietly erasing your own history would break its whole purpose.
- **Recovery codes for open challenges** — carried through as an already-sealed blob that never travels in readable form, written back only if the new device has none of its own.

The network tagging matters more than it looks. A backup made while connected to one network has to restore each contact to the *right* network. So every network-specific item carries its network label inside the one bundle — and a bundle missing a required label is rejected before it can touch your device. Data that can simply be rebuilt from the blockchain (balances, caches, transaction history) is deliberately left out: back up what *you* authored, not what the chain can regenerate. Adding a future kind of data later is one more entry on that list — no rebuilding the machinery.

## Lock, upload, point

The backup flow has four steps: gather the bundle, re-create the key, lock the bundle, then save it in two places — once to public file storage, once to the blockchain. The locking uses the same authenticated encryption as elsewhere in the series, with the format version bound in so a file can never be silently reinterpreted as a different format.

Uploading the locked file returns a content address — a fingerprint that doubles as its retrieval handle. But a fingerprint alone recreates the original problem: your phone doesn't know it. So the final step writes that handle to a tiny, almost aggressively boring contract on one canonical network. It holds no money, has no special roles, and lets only a wallet set its own pointer. Writing an empty value clears it — that's how "delete my backup" works: the trail is cut, and the stored file is left to expire.

Restoring runs the pipeline in reverse, with no transaction and no fee: read the pointer (a free lookup that works whatever network you're connected to), fetch the locked file, re-create the key, unlock, check it, and apply it. Before anything is written, you choose **merge** (add to what's here, the default) or **replace** (a confirmed, destructive overwrite). A restore that silently clobbered a newer address book would cause the very loss the feature exists to prevent.

## Honest state, everywhere

A backup feature earns trust through how it behaves when things go wrong. This one is strict about three distinctions:

- **"No backup" versus "couldn't check."** An empty pointer means there's genuinely nothing to restore; an unreachable network means we don't know yet. The app says "nothing to restore" for one and "try again later" for the other — never dressing up "couldn't reach it" as "you have nothing."
- **"Backed up" means both saves confirmed.** Success shows only after the file upload *and* the pointer transaction both go through — no optimistic checkmarks.
- **Can't unlock means don't touch.** A wrong key, tampered file, or foreign format fails its integrity check and is reported as "no usable backup." Your local data — the working source of truth the whole time — is never overwritten with garbage.

## Trade-offs

**The pointer is public by design.** Anyone can see that a wallet has a backup, where it points, and when it last changed. That metadata is the accepted price of retrieving your data without trusting anyone — every alternative was worse: a self-resolving name was too unreliable, a member-held recovery code is easy to lose, a company lookup service would break the no-backend rule. The *contents* stay locked, so the metadata never reveals anything personal.

**Manual, not automatic.** This is deliberate backup and restore, not silent background sync — which would mean a fee on every little change, always-on tracking, and your data leaving the device without a decision from you. Nothing leaves until you trigger it, and you're told the small on-chain cost before you approve. Background sync could come later, on this same foundation.

**Lose the wallet, lose the backup.** There's no recovery path without your key material, by design. A broad social-recovery scheme is out of scope for now; a plain encrypted export file remains as an offline fallback for members who'd rather not transact at all.

**One canonical network.** Backups cost a few cents of network fees and require switching to that network; restore reads are free from anywhere.

The sum is a sync system where every storage layer is public — files anyone can fetch, a pointer anyone can read — yet none of it is readable by anyone but you. The key exists nowhere at rest; it exists wherever you are.

## Further reading

- [Deterministic ECDSA signatures (RFC 6979)](https://datatracker.ietf.org/doc/html/rfc6979) — why the same wallet re-creates the same key every time
- [ChaCha20-Poly1305 authenticated encryption (RFC 8439)](https://datatracker.ietf.org/doc/html/rfc8439)
- [WebAuthn / passkeys](https://www.w3.org/TR/webauthn-2/) — the Face ID / fingerprint sign-in standard
- [Content addressing on IPFS](https://docs.ipfs.tech/concepts/content-addressing/) — how the "fingerprint that doubles as a retrieval handle" works
