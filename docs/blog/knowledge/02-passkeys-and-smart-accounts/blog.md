# Passkeys and Smart Accounts: A Wallet With No Password to Write Down

*What a passkey is, what a "smart-contract wallet" means, and why together they let you have a real crypto account without ever seeing a seed phrase*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Wallets & Keys |
| **Level** | Beginner |
| **Audience** | Newcomers who unlock their phone with Face ID and want to know what's under the hood |
| **Tags** | `passkeys`, `smart-accounts`, `webauthn`, `wallets`, `basics` |
| **Reading time** | ~6 minutes |

## The twelve words nobody wants to write down

If you have tried a crypto wallet before, you may remember the moment it handed you twelve random words and told you, sternly, to write them on paper and never lose them, never photograph them, never type them anywhere. That list — called a **seed phrase** — is the master key to the account. Lose it and your money is gone; let someone see it and they can take everything.

For most normal people, that is where crypto ends. Guarding twelve words like a launch code is nobody's idea of a fun Tuesday night.

Here is the good news: you almost certainly already use a better system every day, and you probably do not even think of it as security. It is the fingerprint or face scan that unlocks your phone and signs you into apps. This primer explains that system — called **passkeys** — and the second piece that lets it control real money: a **smart account**.

## What a passkey is

A **passkey** is a login credential built into your device that you unlock with your face or fingerprint instead of a password. It is the everyday name for a technology called WebAuthn, the same standard behind Face ID sign-in and fingerprint logins on banking and shopping sites you already trust.

Here is the part that makes it powerful. When you create a passkey, your phone generates a secret key and stores it inside a tiny, tamper-resistant security chip. That secret **never leaves the chip** — not to the app, not to a server, not even to you. When something needs approval, the chip proves it is you (after your face or fingerprint check) without ever revealing the secret itself.

Compare that to a seed phrase or a password, which you can be tricked into typing into a fake website or reading aloud to a scammer posing as support. A passkey has nothing to type and nothing to hand over — there is simply no secret sitting around for a thief to phish. That is exactly the security property crypto wallets have wanted for years.

## What a smart account is

So passkeys are a great way to prove it is you. But there is a catch when you try to point one at a crypto account.

An ordinary crypto account is basically a single key and nothing else — a plain lockbox with one lock. It expects signatures written in one specific mathematical "handwriting." Your phone's security chip signs in a *different* handwriting. The two do not recognize each other, so a passkey cannot directly open an old-style account.

The fix is to make the account itself a little smarter. Instead of a plain lockbox, your account becomes a small program that lives on the blockchain — a **smart account** (you may also hear "smart-contract wallet" or "account abstraction"). Because it is a program, it can be taught to read your passkey's handwriting and check your phone's signatures directly.

That upgrade quietly unlocks conveniences a plain account never could:

- **No seed phrase.** Your face or fingerprint is the key. There is nothing to write on paper.
- **More than one way in.** A smart account keeps a *list* of approved controllers, not a single fixed key. You can add a second passkey on your tablet, or link an existing wallet as a backup — any of them can get you in.
- **It can protect itself.** Because it is a program, the account can enforce its own rules — for example, refusing to remove its very last controller so you cannot accidentally lock yourself out forever.

Think of an old account as a padlock, and a smart account as a small, programmable door with a guest list you can update as your life changes.

## How the two fit together

Put them side by side and the experience clicks. The **passkey** is who you are — proven by your face or fingerprint, backed by a secret that never leaves your phone. The **smart account** is where your money lives — a program on the blockchain that recognizes that passkey and follows rules you can trust. You unlock it the same way you unlock your phone: the account confirms the approval came from a passkey on its guest list, and only then does anything move. No password, no seed phrase, no browser extension.

## How this shows up in FairWins

When you join FairWins, this is exactly what happens — usually in a few seconds and without you thinking about any of it. Your face or fingerprint creates a passkey, and a smart account is set up that recognizes it. There is no twelve-word phrase to record, because there isn't one.

FairWins leans on the smart account's guest-list design in a friendly, practical way. It encourages you to add a backup controller — a second passkey or a linked wallet — so that if your phone is lost or broken, another approved device can still get you in. Adding one is a single face or fingerprint approval. And when you link something as a backup, the app tells you plainly that a backup controller has *full* control of the account, because on the guest list everyone is an equal peer.

## What to watch out for

- **A passkey is only as safe as your device's backup.** Most phones automatically sync passkeys to your cloud account (iCloud Keychain, Google Password Manager), so a new phone restores them. But a passkey made in a browser profile that wasn't syncing can be genuinely lost — which is exactly why adding a *second* controller in the app matters.
- **"No seed phrase" is not "no responsibility."** You still hold your own account. The responsibility shifted from guarding a paper phrase to keeping a backup way in. Do that early.
- **Anyone with a controller has full power.** Only link a wallet or add a passkey you actually trust and control. The app says so, and means it.
- **Your face and fingerprint never leave your phone.** The biometric check happens on your device to unlock the passkey; FairWins never sees it.

## Related deep-dive

Want the engineering details? Read [Passkey Smart Accounts: A Wallet You Open With Your Fingerprint](../../posts/04-passkey-smart-accounts/blog.md) — how FairWins turned Face ID into a real, self-custodial account with no seed phrase.

## Learn more

- What passkeys are, in plain terms (FIDO Alliance): <https://fidoalliance.org/passkeys/>
- Passkeys / WebAuthn overview (Ethereum.org): <https://ethereum.org/en/wallets/>
- Account abstraction, explained (Ethereum.org): <https://ethereum.org/en/roadmap/account-abstraction/>
