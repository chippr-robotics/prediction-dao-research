# Wager Tags

A **wager tag** is a short, memorable handle for your wallet — shown with a `%`
prefix, like `%chipprbots`. Instead of sharing a long `0x…` address, you can give
someone your tag and they can find you instantly when creating a wager, sending a
transfer, or adding you to their address book.

Wager tags are **completely optional** and are a perk of **Gold membership and
above**. You never need a tag to wager — you can always create, accept, and settle
with a raw address — but a tag makes you easier to find and recognise.

## What a tag is (and isn't)

- A tag maps **one handle to one wallet**. `%chipprbots` always resolves to the
  address that owns it.
- Tags are **unique** — no two wallets can hold the same tag.
- A wallet can hold **one tag at a time**.
- The tag ↔ address mapping is **public and on-chain**. This is different from your
  [address book](address-book.md), which lives only on your device. Anyone can look
  up the address behind a tag, so pick a handle you're comfortable being public.

## Where to find it

**My Account → Membership → Wager tag.** If you hold Gold (or Platinum), you'll see
the panel where you can register, change, or release your tag. If you're below Gold,
the panel shows an upgrade prompt instead — tags are a membership perk, so it points
you to the Membership page rather than blocking you with a dead control.

## Choosing a tag

A valid tag is:

- **3 to 20 characters** long;
- **lowercase letters `a–z` and digits `0–9`**;
- with **single hyphens allowed inside** (not at the start or end, and never two in a
  row).

Anything you type is lowercased for you, so `%ChipprBots` and `%chipprbots` are the
same tag. Some names — platform and brand terms like `admin`, `support`, `official`,
and FairWins' own names — are **reserved** and can't be registered.

## Registering your tag

Registration is a **two-step** process, which protects your chosen name from being
snatched by someone watching the network:

1. **Reserve** — you pick a tag and submit a reservation. The app checks it's valid
   and available first.
2. **Confirm** — after a short waiting period (about a minute) you complete the
   registration. Your reservation is saved locally, so it's fine to refresh the page
   between the two steps.

Once confirmed, the tag is yours and resolves to your wallet everywhere in the app.

## Using someone's tag

Anywhere you'd type an address — the opponent or arbitrator field on a wager, a
transfer recipient, a pool invite, an address-book entry — you can type a `%tag`
instead. The app resolves it and shows you the **full address it points to** so you
can confirm before anything of value happens.

- Only an **active** tag is usable. If a tag is being moved, released, or has been
  suspended, the app tells you it isn't currently usable rather than sending funds
  somewhere unexpected.
- A **verified** tag (see below) shows a check mark so you can tell a genuine
  business apart from a look-alike.
- If the registry can't be reached, address fields quietly fall back to accepting raw
  addresses and ENS names — a tag never gets in the way of a normal transaction.

## How you appear to others

When someone sees you across the app — on a wager card, in a roster, in their activity
feed — FairWins shows the most personal name it can, in this order:

1. a **nickname you've saved** for them in your address book;
2. their **wager tag** (`%tag`), if they have one;
3. their **ENS name**;
4. a generated placeholder name.

So once you register a tag, people who haven't saved you under a nickname will see your
`%tag` instead of an anonymous address.

## Managing your tag

From the same panel you can:

| Action | What happens |
|--------|--------------|
| **Change tag** | Swap to a new handle. The old one goes into quarantine (below). You can change again after a **30-day cooldown**. |
| **Release tag** | Give up your tag. It enters a **90-day quarantine** during which *no one* (including you) can re-register it. This can't be undone. |
| **Change linked address (repoint)** | Move your tag to a **different wallet** — for example when you migrate wallets. For your security this takes effect only after a **48-hour delay**, during which the tag can't be used for value, and you can cancel any time before it finalises. The destination wallet must itself hold Gold. |

Every one of these is protected by the same wallet authorization as your other
account actions. **No one — not even platform operators — can move your tag to a
different wallet on your behalf.**

## If your membership lapses

Your tag is tied to Gold membership. If your membership expires and you drop below
Gold, your tag keeps working through a **12-month grace period**. After that, if you
still haven't renewed, the tag becomes reclaimable and can be released back into the
pool for others. Renew before the grace period ends to keep your handle.

## Verified tags (for businesses)

Businesses and notable accounts can apply for a **verification badge** through an
operator review. A verified tag shows a check mark wherever it appears, so users can
trust that `%chipprbots` is the real business and not an impersonator. Verification is
granted to a specific reviewed identity — if a verified tag is ever moved to a new
wallet, the badge is cleared and must be re-earned.

## Staying safe

- **Always confirm the full address.** The app shows the address behind a tag before
  any value-bearing action — check it.
- **Report abuse.** If a tag is impersonating someone or being used abusively, use the
  **Report** link shown next to a resolved tag. It opens a pre-filled message to the
  operator moderation team.
- **Suspension never touches funds.** If operators suspend an abusive tag, it simply
  stops resolving and displaying — the owner's wallet, balances, and everything else
  are untouched, and the tag is never handed to someone else.

## Related

- [Address Book & Screening](address-book.md) — device-only nicknames and sanctions checks.
- [Membership Vouchers](membership-vouchers.md) — how membership (including Gold) works.
- [FAQ](faq.md)
