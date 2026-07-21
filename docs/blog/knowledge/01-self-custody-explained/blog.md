# What "Be Your Own Bank" Actually Means

*Self-custody in plain English: what a key is, why "not your keys, not your coins" caught on, and the responsibility that comes with the freedom*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Wallets & Keys |
| **Level** | Beginner |
| **Audience** | Curious newcomers who use a bank app but have never held crypto |
| **Tags** | `self-custody`, `wallets`, `keys`, `security`, `basics` |
| **Reading time** | ~5 minutes |

## Who holds the vault key?

Think about the money in your bank account. You can see the balance in an app, tap to send some, and trust that it will be there tomorrow. But you are not the one actually holding it. The bank holds it. If you forget your password, the bank can reset it. If someone drains your account, the bank can often claw the money back. That safety net exists because a company sits in the middle, holding your money on your behalf.

That arrangement is called **custody** — someone else has custody of your funds. It is comfortable and familiar. It also means the bank can freeze your account, decline a payment, or close your access if it decides to.

Crypto offers a different arrangement, and it has a name that sounds bold: **self-custody**. It means *you* hold your own money directly, with no company standing in the middle. People sometimes call this "being your own bank." This primer is about what that really involves — the freedom and the responsibility, honestly.

## What self-custody actually is

In crypto, your money lives on a shared public ledger — a giant, tamper-resistant record that thousands of computers keep in sync. Nobody "has" your coins in a drawer. Instead, the ledger says a certain balance belongs to a certain account, and the only way to move that balance is to prove you control the account.

You prove it with a **key** — think of it as a secret password that also acts as a signature. Whoever holds the key can move the money. There is no manager to appeal to, no "forgot password" button that a company can press for you. The key *is* the ownership.

That is the whole idea. Self-custody means the key lives with you, not with a company. In older wallets, that key was often shown to you as a list of twelve or twenty-four words — a **seed phrase** — that you were told to write on paper and never lose. (Newer wallets, including FairWins, replace that with your phone's built-in security — more on that in the next primer.)

## Why people care: "not your keys, not your coins"

You will hear this phrase everywhere in crypto: **"not your keys, not your coins."** It is a warning, and it comes from hard experience.

When you leave your crypto on an exchange or app that holds the keys for you, you are trusting that company the same way you trust a bank — except most crypto companies are not banks and have none of a bank's protections. Several large ones have collapsed or been hacked, and people who thought they "owned" coins there discovered they only owned an IOU that the company could no longer honor.

The phrase means: if you do not personally hold the keys, you do not truly own the coins — you own a promise. Self-custody removes the middleman and the promise. Your money cannot be frozen by a company, cannot vanish in someone else's bankruptcy, and does not require anyone's permission to move.

## The trade-off, stated honestly

Freedom has a price, and it would be dishonest to skip it: **with self-custody, you are responsible for your own keys.** There is no support line that can undo a mistake.

- If you lose the only key and have no backup, the money is gone. Not "frozen pending review" — gone.
- If someone tricks you into revealing your key or signing something you did not understand, they can take everything, and no one can reverse it.
- Nobody can help you recover access the way a bank can, precisely because nobody else has your key.

This is not meant to scare you off. Millions of people self-custody safely by doing two simple things: keeping a backup so a single lost device is not the end, and slowing down before approving anything involving money. The rest of this track is about making those two things easy.

## How this shows up in FairWins

FairWins is a self-custody app. When you join, an account is created that only *you* control — the keys never touch a FairWins server, and the company holds no master switch over your funds. That is a deliberate design choice: it is what lets FairWins honestly say your money is yours.

FairWins tries to keep the good part of self-custody (you are in control) while softening the scary part (one mistake ends everything). It does this two ways worth knowing now. First, it uses your phone's own security hardware instead of a seed phrase you have to write down. Second, it strongly encourages you to add a **backup controller** — a second way to get into your account — *before* anything goes wrong, so a lost or broken phone is an inconvenience, not a catastrophe. The app will nudge you until you have one, on purpose.

## What to watch out for

- **A backup is not optional.** The single most common way people lose self-custodied money is having exactly one way in, then losing it. Set up a backup early, while everything is working.
- **No one legitimate ever needs your key or recovery words.** Anyone who asks — "support," a giveaway, a friend in a hurry — is trying to rob you. Real apps never ask.
- **Read before you approve.** Signing a transaction is like signing a check that cannot bounce or be cancelled. FairWins shows you exactly what you are approving before you approve it; take the extra second to look.
- **Self-custody is a responsibility, not a personality test.** If you are not ready for it on day one, that is fine — just do not keep more on any app than you would be comfortable managing.

## Related deep-dive

Want the engineering details? Read [Losing Every Passkey Shouldn't Mean Losing the Account](../../posts/05-account-recovery-unified-connect/blog.md) — how FairWins makes a self-custody account recoverable without bringing back the seed phrase.

## Learn more

- What is a crypto wallet? (Ethereum.org): <https://ethereum.org/en/wallets/>
- Custodial vs. non-custodial wallets, explained (Coinbase Learn): <https://www.coinbase.com/learn/crypto-basics/what-is-a-crypto-wallet>
- Self-custody, in plain terms (MetaMask Learn): <https://learn.metamask.io/lessons/what-is-a-crypto-wallet>
