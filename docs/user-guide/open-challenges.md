# Open Challenges

An **open challenge** is a wager you post with **no named opponent**. Instead of
sending it to one specific address, you get a **four-word code** to share with
whoever you like — and the first person to take it with that code becomes your
opponent.

It's the difference between *"hey Alice, 10 USDC says it rains tomorrow"* and
*"10 USDC says it rains tomorrow — first taker gets the other side, here's the
code."*

## How it works at a glance

1. You create an open challenge and the app gives you a **four-word code**
   (e.g. `river tiger kite zoo`).
2. You share that code however you like — text, DM, QR, a deep link.
3. Anyone with the code can look up the challenge, read its terms, and **take
   the other side** by staking the matching amount.
4. Once taken, it's a normal wager — it resolves and pays out exactly like any
   other.

The code does three jobs: it **finds** the challenge, **decrypts** its private
terms, and **authorizes** acceptance. It is generated in your browser and never
sent to any server.

!!! warning "Save your code — it cannot be recovered"
    The four-word code is the **only** way to find, read, or take your
    challenge. We don't store it and it can't be reset. If you lose it, no one
    can take the challenge (you can still cancel it to get your stake back).
    Anyone you give the code to can take the other side, so share it only with
    the people you intend to.

## Who can create and take one

- **Creating** an open challenge requires a **Silver** membership or above.
- **Taking** one requires **any** active membership tier (Bronze and up).

## Creating an open challenge

1. From the Dashboard choose **Open Challenge**.
2. Enter the wager **description**, the **stake** (each side stakes the same
   amount — equal stakes only), and **how it's resolved**:
    - *Either side submits the outcome*, or
    - *A named third-party arbitrator decides* (enter their address).

    Single-party self-resolution (*Me* / *Them*) isn't offered for open
    challenges, because the opponent is unknown when you post it.
3. Confirm the wallet prompts — **approve** your stake, then **create**. Your
   stake moves into escrow immediately.
4. The app shows your **four-word code** plus a **QR code / link**. Save the
   code now (see the warning above), then share it.

## Taking an open challenge

1. Open the app and choose **Take a challenge** (or open the link / scan the QR
   someone sent you — the code is filled in for you).
2. Enter the **four words** and select **Find challenge**. The app looks it up
   and shows the (decrypted) terms.
3. Select **Accept challenge**. Taking the other side escrows your matching
   stake, so acceptance is a short, guided sequence:
    1. **Approve** the stake token — lets the wager contract escrow your stake.
    2. **Sign** to authorize acceptance with your code (a free signature, no gas).
    3. **Confirm** the acceptance transaction — your stake joins the creator's
       in escrow.

    The app shows this as a checklist and highlights the active step.

!!! note "Why three steps?"
    The approval is a separate token transaction that lets the contract pull
    your stake; the signature proves you hold the code and binds acceptance to
    *your* wallet so no one can replay it. If you ever see
    *"transfer amount exceeds allowance"*, the approval step didn't go
    through — retry and approve the token.

## After it's taken

The wager is now **Active** and behaves like any other:

- It resolves per the type you chose (either side, or the named arbitrator).
- The winner claims the full pot; a draw returns each side's stake.
- If it never resolves by the deadline, either party can claim a refund.

See [Resolving a Wager](resolve-wager.md) for the settlement and refund paths.
**Keep your code** even after acceptance — it's how you re-read the private
terms later.

## Cancelling an un-taken challenge

If no one has taken your challenge yet, you can withdraw it from *My Wagers* and
your stake is returned. Open challenges can't be *declined* by a taker — only
you, the creator, can withdraw one before it's taken.
