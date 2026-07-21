# Losing Every Passkey Shouldn't Mean Losing the Account

*How FairWins made passkey accounts recoverable — without bringing back the seed phrase — and folded connecting, controlling, and recovering into one simple screen*

| | |
|---|---|
| **Series** | Accounts & Keys (part 2) |
| **Audience** | Product folks, designers, founders, and developers new to wallets |
| **Tags** | `account-recovery`, `passkeys`, `self-custody`, `ux`, `onboarding` |
| **Reading time** | ~7 minutes |

## The phone in the river

Someone signs up for FairWins with a passkey. No seed phrase, no browser extension — Face ID creates the credential, and a smart-contract account springs from it. The onboarding passkeys always promised: nothing to write down, nothing to lose.

Then the phone goes in the river. Or the browser profile gets wiped, or the laptop dies. Most of the time your phone's built-in sync (iCloud Keychain, Google Password Manager) has quietly backed the passkey up and you're fine — but not always. A passkey created in a browser profile that wasn't syncing is simply gone. With an old-style wallet, recovery was brutal but obvious: retype your twelve words. Passkeys deliberately removed those words. So what's the recovery story now?

There was a second, quieter problem that made the recovery question moot: even *connecting* was broken. The app offered three different places to connect, each with different options, and one couldn't even reach the passkey option. Worse, two real bugs locked passkey users out: on some browsers, signing back in left every transaction crashing, and one browser would silently sign you into your *first* passkey no matter which account you picked.

The insight was to treat all of this as one thing. Connecting, managing who controls your account, and recovering after a lost device are really the same lifecycle — so they should live behind one door. This post walks through how that works, and why none of it touched the account contracts.

## The account already knew how to be recovered

Remember from the previous post: a FairWins passkey account doesn't have a single owner. It keeps a *list* of owners, each of which can be a passkey or an ordinary wallet address. They're equal peers — any one can add or remove the others.

That is the entire recovery mechanism, hiding in plain sight. If a second controller exists when your phone dies, recovery is a single action: that controller adds a fresh passkey. And because a linked ordinary wallet can do this with a plain everyday transaction, recovery needs no special infrastructure — no relayer, no service, nobody's permission but your own. The account also protects itself: it refuses to remove its last remaining owner, and it only accepts changes from a genuine current owner.

So the real work was never in the contracts. It was in getting people to actually *have* that second controller before disaster, and making the app honest and reliable enough to use it.

## One front door for connecting

The first fix was a single connect screen. Every entry point now opens the same dialog; nothing else renders its own list of choices. The options are ordered passkey first, then WalletConnect, then browser-extension wallets, and the app checks up front whether each is actually available — showing an honest "not detected" or "not supported" instead of failing after you tap.

It also runs only one connection attempt at a time, so a background attempt to restore your previous session can never barge in and override one you started yourself — which is what used to produce those stuck states.

## The two bugs that made passkeys unusable

A single front door only helps if the passkey path behind it is solid. Two root-cause fixes shipped alongside it, both app-side bugs against perfectly correct contracts.

**The half-saved credential.** When you first *signed up*, the app recorded everything it needed about your passkey. When you later *signed back in*, it didn't record the same details — and that missing information was exactly what the transaction machinery needed, causing the crash-on-every-transaction bug. The fix: repair the record on every sign-in, and if it's still incomplete, catch it early with a clear "please sign in again with your passkey" message instead of letting it explode deep in the signing code later.

**The passkey the app didn't choose.** When a browser holds several passkeys and the app makes an unspecific request, some browsers just grab the *first* one — locking multi-account users into account number one. The fix was to always tell the browser exactly which passkey this session should use, and, when several exist, show the app's own account picker before the biometric prompt rather than letting the browser guess.

A third, subtler fix falls out of recovery: once an account can gain new controllers, the app can no longer assume your passkey is "owner number one." It now reads the account's real owner list on-chain and matches your credential to its actual position — and if your credential isn't in the list, it stops rather than sign blindly.

## Linking before disaster

Recovery depends on having a second controller *while you still have passkey access*. So the account screen lists every current controller and lets you add a second passkey, link an external wallet, or remove one — each a single biometric approval.

Two honesty rules govern linking. First, the app states plainly that a linked wallet gains **full control** — equal peers means equal power. Second, every wallet you try to link is screened against sanctions lists before anything goes on-chain, and it fails closed: flagged *or* impossible to screen means refused. Any account still down to a single controller gets a persistent "link a backup before you lose this device" warning.

## Recovery without FairWins

There's also a wallet-only recovery flow for the worst case: your passkeys are gone, but you linked a wallet earlier. You connect that wallet — no passkey anywhere — and the app walks you through it:

1. **Which account?** The blockchain has no "look up my accounts by owner" index, so the app asks for the account address, suggesting ones your browser has previously associated with passkeys.
2. **Prove ownership.** The app confirms the address is a real, deployed account, then that your connected wallet really is an owner, before letting you continue.
3. **Create and authorize.** You make a fresh passkey on the new device, and your linked wallet sends one ordinary transaction adding it as an owner. Only once that confirms does the app save the new credential — so your very next sign-in can transact.

Because the account is a standard, publicly documented smart contract, this same recovery works with generic, off-the-shelf tools even if FairWins the company vanished. Your funds were never dependent on us being around.

## Why we built it this way

**No guardians, no social recovery.** Recovery is strictly "any controller you linked ahead of time can act." An account whose only passkey lived on a lost, un-synced device is unrecoverable *by design* — no one, including FairWins, can help. That's a hard trade, made on purpose: guardian schemes reintroduce trusted third parties, and phone sync already covers the common case. The answer is gentle pressure to link a backup early, not a custodial safety net that would compromise self-custody.

**Equal owners, not thresholds.** Every controller is a full peer. That's simpler to reason about and it's what makes wallet-only recovery a single transaction — but it means linking a wallet hands over full control, which the app says out loud. People who want "2-of-3"-style shared custody have a separate multisig option.

**Recovery restores control, not secrets.** The owner list guards your funds, but encrypted private features use a separate master seed. A freshly recovered controller that never held that seed can't read old encrypted data until the keys are re-shared to it. Getting your funds back and getting your encrypted history back are two different steps, and the app is upfront about that.

**A frontend fix for a frontend problem.** Fixing both bugs in the app — with clear error messages instead of crashes — kept the audited account contracts untouched.

The result: connecting has one front door, every passkey prompt is pinned to the account you actually chose, and losing every passkey becomes an inconvenience instead of an ending — as long as you linked a backup first. Making sure you did is the app's whole job.

## Further reading

- Passkeys / WebAuthn (W3C): <https://www.w3.org/TR/webauthn-2/>
- What passkeys are, in plain terms (FIDO Alliance): <https://fidoalliance.org/passkeys/>
- The ERC-4337 account-abstraction standard (smart-contract wallets): <https://eips.ethereum.org/EIPS/eip-4337>
- Coinbase Smart Wallet (open source): <https://github.com/coinbase/smart-wallet>
