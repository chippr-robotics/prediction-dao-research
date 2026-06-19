# Address Book & Screening

The **Address Book** lets you save the people you wager with under friendly
names so you never have to paste a long `0x…` address again. It also screens
saved and entered addresses against sanctions/compliance lists and warns you
before you transact.

Your address book is stored **only on your device** (in your browser), scoped to
the connected wallet. FairWins never uploads your contacts to a server.

## Where to find it

- **My Account → Address Book** — the full manager, where you add, edit, delete,
  search, import, and export contacts.
- **Anywhere you enter an address** (for example, the opponent or arbitrator field
  when creating a wager) — an **address-book icon button** sits next to the QR
  scan button. Tap it to search and pick a saved contact.

## Managing contacts

Each contact has:

- a **nickname** (e.g. "Alex");
- one or more **addresses** — a friend may use several wallets, so you can group
  them all under one name;
- a **network** for each address (defaults to the network you are on); and
- optional **notes**.

A single address is identified by the pair *(address, network)*, so the same
address can be saved for more than one network, and the book warns you if you try
to save a duplicate.

### Adding an address by QR code

When adding or editing a contact, each address row has a **QR scan button**.
Tap it to open your camera and scan a wallet QR code (a raw address, an
`ethereum:` URI, or a FairWins share link). The scanned address fills that row
automatically.

## How screening works

Every saved or entered address is checked against the on-chain
sanctions/compliance oracle. Results appear as small tags:

| Tag | Meaning |
|-----|---------|
| *(no tag)* | The address screened **clear** on this network. |
| **Restricted** | The address is flagged by sanctions screening. |
| **Unscreened** | The address could not be checked (see "Fails closed" below). |

Four principles govern screening:

1. **Advisory only.** The tags in the app are a convenience pre-check. They do
   **not** block anything by themselves.
2. **The on-chain guard enforces.** FairWins' smart contracts independently
   screen every participant when a wager is created or accepted. A restricted
   address is blocked on-chain **even if the app shows no warning** — the contract
   is the source of truth, not the UI.
3. **Fails closed.** If an address cannot be screened — for example the guard is
   not configured on the current network, or the check fails — it is shown as
   **Unscreened**, never as clear. Treat "Unscreened" as "unknown, proceed with
   caution."
4. **Network-scoped.** A screening result applies only to the network it was
   checked on. The same address may screen differently on a different network, so
   the network is always part of the result.

Results are cached briefly during your session to avoid repeated on-chain reads,
then re-checked the next time you open the book or pick an address.

## Portability: encrypted export & import

You can move your address book between devices:

- **Export** produces an encrypted file. The encryption key is derived from a
  signature from your wallet, so the file contains **no readable** names,
  addresses, or notes.
- **Import** on another device (or after clearing your browser) restores your
  contacts — but only with the **same wallet** that created the export, since the
  decryption key comes from that wallet's signature. There is no separate
  passphrase to remember.
- Importing **merges** additively: new addresses are added, existing ones are
  kept (no duplicates), and where a nickname or note differs you are asked which
  to keep. Nothing is silently deleted.

If you import a file created by a different wallet, or a corrupted file, the
import fails safely and your existing book is left unchanged.

## Privacy notes

- Contacts live in your browser's local storage, keyed to your wallet address.
  Clearing your browser data removes them — export a backup first.
- Different wallets on the same device have separate, isolated address books.
