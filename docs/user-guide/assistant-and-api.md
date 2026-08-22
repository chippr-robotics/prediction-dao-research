# Assistant & API Access

Two optional tools for members with an active membership:

- the **Assistant**, an in-app helper you can ask questions about FairWins, and
- **API access**, private keys that let a program — including an AI agent — read your FairWins
  data on your behalf.

Both are **off until you turn them on**, and neither can move your money. Nothing in either
feature can sign a transaction, spend from your wallet, or send funds. Signing always happens in
your own wallet, in the app, with you looking at it.

---

## The Assistant

### Turning it on

**My Account → Settings → Assistant.**

The card shows its own state. Before you enable it, the summary line reads *"Off — nothing is
sent."* That is literal: while the assistant is off, nothing you type anywhere in the app is sent
to us or to anyone else, and the assistant button does not appear.

Turn on the master toggle to enable it. A small chat button then appears above the bottom
navigation on every screen.

### What happens when you use it

The first time you open the assistant after enabling it, you are asked to **authorise a session**.
You sign a short message in your wallet that grants a 24-hour, read-only permission. This does not
approve any spending — there is no token approval, no transaction, and no cost. The permission is
held in your browser's memory only and disappears when you disconnect, switch accounts, or close
the tab.

Once authorised, what you type is sent to the FairWins gateway and on to our model provider, which
generates the reply and sends it back. That is the only thing that leaves your device.

### What the assistant will and will not do

- It **explains** surfaces, fees, deadlines and options, and links you straight to the right screen.
- It **never signs anything and never submits anything.** Every reply carries that reminder.
- It **will never ask you for a private key, a seed phrase, or a recovery word list.** If anything
  in this app ever asks you for those, it is not us — stop and report it.
- It can be **wrong.** It is generated text. Verify anything consequential before you act on it,
  and never treat a number it states as the number you are about to sign.

If the service is unreachable, the assistant says so and offers a retry. **It never invents a
reply** — an answer you cannot trust is worse than no answer.

### Memory, and clearing it

If you leave memory retention on, your recent conversation is kept **on this device only**, capped
at the last 50 messages. It is not sent to us for storage, is not part of your encrypted backup,
and does not follow you to another device or browser.

**Settings → Assistant → Clear conversation memory** wipes it. The button shows how many entries
are stored before you press it.

### Turning it off

Flip the master toggle off. The button disappears immediately and nothing further is sent. Clearing
your memory is a separate action — do both if you want no trace left.

---

## API access

### What an API key is here

An API key is a **capability you sign** with your own wallet. It is not a password we issue, and we
do not store it — the key itself carries the permission, cryptographically, and we simply check the
signature when a program presents it.

That has three consequences worth understanding:

- **You choose exactly what it can do.** You tick the permissions when you create it: your profile,
  your wagers, your membership, live fee rates, building unsigned transactions, and the assistant.
  Every one of those is a read or a quote. **None of them can spend, transfer, or sign.**
- **You choose when it expires.** 7, 30 or 90 days. The expiry is signed into the key, so it is
  binding — nobody can extend it, including us.
- **We only ever see it when it is used.** There is no key list on our side to be leaked.

### Creating one

**My Account → Settings → API access.**

1. Give the key a label, so you can recognise it later. The label is for your eyes only.
2. Tick the permissions the program actually needs. Give the smallest set that works.
3. Pick an expiry.
4. Sign in your wallet. This is a signature, not a transaction — it costs nothing and confirms
   nothing on chain.

**The token is shown once.** Copy it then. We cannot show it again, because we never had it. If you
lose it, revoke it and create another.

The panel keeps a note of the key's label, permissions and expiry so you can see what you have
outstanding. **The token itself is never stored** — not in the app, not in your backup.

### Guard the token like a password

Anyone holding your token can read whatever you granted it, for as long as it lasts. Treat it as a
credential:

- Paste it into a configuration file or a password manager, never into a chat, an issue, or a
  screenshot.
- Give a separate key to each program, so you can revoke one without breaking the others.
- Prefer short expiries. A key that expires on its own is one you cannot forget about.

### Revoking a key

Press **Revoke** and sign. Read the confirmation carefully, because it tells you two different
things:

- The revocation is registered on the **live gateway** and takes effect immediately.
- The revocation is **not permanent by itself.** If our gateway restarts, it forgets the revocation
  and the key works again **until its expiry date**, which the panel shows you.

If a key has been exposed and its expiry is far away, revoke it and then contact support — and in
the meantime, assume it may still be usable for reads. This is why short expiries are worth the
minor inconvenience.

---

## Connecting an AI agent (MCP)

FairWins publishes an **MCP server**, which is the standard way to give an AI assistant such as
Claude access to a tool. It uses the key you created above, and it inherits exactly the permissions
you granted — no more.

The API access card generates the configuration snippet for you. It looks like this:

```json
{
  "mcpServers": {
    "fairwins": {
      "command": "node",
      "args": ["/path/to/services/mcp-server/src/server.js"],
      "env": {
        "FAIRWINS_API_URL": "https://relay.fairwins.app",
        "FAIRWINS_API_TOKEN": "fw1.…"
      }
    }
  }
}
```

Paste it into your MCP client's configuration, correct the path to wherever you put the server, and
restart the client. The server needs Node 20 or newer and installs nothing — it has no dependencies
at all, which is deliberate: it is a program that holds your key, so there is nothing else in it.

What the agent can then do: read your profile, membership, wagers and live fee rates, look up
public prediction markets and perpetual-futures pairs, and **prepare** an unsigned transaction for
you to review.

What it cannot do: sign, submit, spend, transfer, or change anything. A prepared transaction comes
back to you, and you sign it yourself in your wallet. **The server has no key** and no way to
acquire one.

If a read fails — a network is down, an index is unavailable — the agent is told the read failed.
It is not given a zero. That matters: an agent that is handed "0 open wagers" will tell you that
you have none.

---

## What leaves your device

| While… | What is sent | Where it goes |
|---|---|---|
| The assistant is **off** and you have **no API key** | Nothing | — |
| The assistant is **on** | The messages you type in it | FairWins gateway → our model provider, for the reply only |
| The assistant is **on** | Your conversation memory | **Nowhere.** It stays on this device. |
| You hold an **API key** and a program uses it | Your wallet address, the key's id, its permissions and expiry — and the data you granted access to | FairWins gateway, to the program holding the key |

We do not collect your name, email, or identity documents for either feature. Full detail is in the
[Privacy Policy](https://fairwins.app/privacy) — see §2 *What We Process* and §5 *Sharing*.

---

## Opting out completely

1. **Settings → Assistant** — turn the master toggle off, then **Clear conversation memory**.
2. **Settings → API access** — revoke every key you are not using, and note each remaining key's
   expiry date.
3. Remove the FairWins entry from any MCP client configuration and delete the token from it.

After that, nothing about either feature is active for your account, and nothing is sent.

---

## Related

- [Privacy Policy](https://fairwins.app/privacy) — what is processed and who processes it
- [Risk Disclosure](https://fairwins.app/risk) §13 — AI and automation risk
- [Terms & Conditions](https://fairwins.app/terms) §4.6 — automated and AI components, and your responsibility for keys
- [FAQ](faq.md)
