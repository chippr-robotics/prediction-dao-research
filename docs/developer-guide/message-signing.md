# Message signing and verification (Protect ▸ Verify)

Members can sign an arbitrary message to prove they control an account, and check somebody else's
proof. It lives in **Protect** as a third area next to *On chain* and *Off chain*, and it is the
only part of Protect that is never gated by the connected network — verification needs no contract
deployed anywhere.

Nothing here moves funds, and nothing here is written to a chain.

## Shape of the surface

The area is **two entry rows** — a title, a one-line current state, one button each. Both forms
live in the shared `ActionSheet` (a bottom sheet on mobile, a centred card on desktop). Inline,
they made Protect roughly 3,000 px tall and pushed the vault sections far below the fold; as rows
they cost about 300 px.

Three consequences to preserve when changing this:

- **The row's summary is state, not decoration.** It carries the last verdict's tone and, when the
  account cannot sign, the refusal reason — so the answer is legible without opening anything.
- **The drafts live in `VerifySection`, not in the forms.** `ActionSheet` unmounts its children
  when closed, so form-local state would silently discard a half-typed message, and a returning
  member would find a signed document with no message under it (the sign form only renders a
  document that still matches the text on screen).
- **The sheet's header is pinned** for these two callers via `ActionSheet`'s `className` prop.
  `.action-sheet` scrolls as a whole, so on a form this long the close button scrolled out of
  reach. Both forms also scroll their result into view when it arrives, feature-detected because
  jsdom has no `scrollIntoView`.

## Where the code is

| Concern | Module |
|---|---|
| The portable document (build / serialize / parse) | `frontend/src/lib/verify/signedMessage.js` |
| How the current identity signs | `frontend/src/lib/verify/signMessage.js` |
| Whether a claim holds | `frontend/src/lib/verify/verifyMessage.js` |
| React wiring | `frontend/src/hooks/useMessageSigning.js` |
| Surface | `frontend/src/components/custody/{VerifySection,SignMessageForm,VerifyMessageForm}.jsx` + `Verify.css` |
| Shared fixtures | `frontend/src/test/fixtures/signedMessages.js` |
| Visual harness | `scripts/ui/capture-verify.mjs` → `specs/084-message-signing-verify/screenshots/` |

## Rule 1 — verification has THREE outcomes, never two

```
'valid'         we checked and the claim holds
'invalid'       we checked and the claim does NOT hold — a definite negative
'unverifiable'  we could not complete the check
```

The binary (valid / invalid) is dishonest here, because the ERC-1271 leg is a network read. An RPC
timeout is not a forged signature, and rendering one as the other tells a member their counterparty
lied when in fact nobody looked. A negative is reported **only** when it is knowable — ECDSA
recovered someone else *and* the claimed address holds no code on the named chain, or the account
contract itself said no. Everything else degrades to `unverifiable` with the reason named, and the
UI gives that state its own colour, its own glyph and the sentence "this is not a failed check".

The corollary that is easy to get wrong: a mismatching ECDSA recovery is **not** promoted to a
negative when the on-chain leg could not run. A smart-account owner key recovering instead of the
account it controls is exactly what a legitimate ERC-1271 signature looks like from the outside.

### The verify seam never rejects

`useMessageSigning.verify` catches everything and turns a throw into an `unverifiable` verdict.
This is a contract, not a convenience. It used to be `try/finally` with no `catch`, and the form
does not await it — so anything that threw beneath it produced no verdict, no error, and no
change on screen. The member pressed Check and nothing happened, which is the one outcome this
surface must never produce.

Review #1163 found two separate malformed inputs that reached that path. Two in one review is the
signal that guarding inputs one at a time is the wrong shape of fix: the seam has to be safe by
construction so the third input nobody thought of degrades honestly instead of silently.

## Rule 2 — the message is carried and signed verbatim

No trimming, no template, no appended nonce, no domain wrapper. A member proving control of a key
is usually answering a challenge somebody else composed, and altering one byte of it makes the
resulting proof useless to the person who asked. Whitespace and Unicode round-trip exactly through
the document, which is why the transport is JSON rather than a hand-rolled block format.

## Rule 3 — `scheme` is a hint, never authority

The document records how the signature was produced (`eip191` | `erc1271`) so a verifier can try
the likely path first. `verifyMessage` still tries both and reaches its own verdict: a document
that lies about its scheme verifies exactly as well — or as badly — as one labelled honestly.
There is a test for that.

## The document

```json
{
  "format": "fairwins-signed-message/1",
  "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "chainId": 137,
  "scheme": "eip191",
  "message": "FairWins verification: I control this account.\nNonce: 8f31c0",
  "signature": "0x…",
  "signedAt": "2026-08-13T12:00:00.000Z"
}
```

`chainId` is **required** for an ERC-1271 signature — there is no way to check one without knowing
which chain hosts the account — and `buildSignedMessage` refuses to emit one without it. For
EIP-191 it is provenance only; verification never consults it.

Pasting the whole document into either text box on the check panel fills every field and says so.
That is the common case, and hand-copying four fields out of JSON is how a wrong chain id ends up
attached to a good signature.

## The three identities

| Identity | How it signs | How it is checked |
|---|---|---|
| Classic wallet | `signer.signMessage` → EIP-191 ECDSA | offline, by anyone, anywhere |
| Recovered legacy account (spec 062) | the unlocked in-memory key, so the proof is attributed to the recovered address | same as above |
| Passkey smart account (spec 041) | one WebAuthn ceremony through `passkeyIntentSigner.signMessage` — `hashMessage(m)` wrapped in the account's `replaySafeHash`, returned as the ERC-1271 envelope | `isValidSignature` on **its** chain |
| Safe vault (spec 043 operate-as) | **refused, with the reason stated** | — |

The vault refusal is deliberate and load-bearing. A Safe has no signing key: proving control of one
takes a threshold of its owners approving an on-chain message, which is a proposal flow, not a
signature box. Signing anyway would prove control of the member's *own* account while the UI said
"vault" — the exact misattribution this surface exists to prevent.

`passkeyIntentSigner` gained `signMessage` alongside its existing `signTypedData`; both go through
one private `signDigest`, so a change to the envelope can never apply to one caller and miss the
other.

## Adding to this surface

- Never introduce a fourth verdict, and never collapse `unverifiable` into `invalid`. If a new leg
  can fail for network reasons, it degrades to `unverifiable`.
- Never normalize the message anywhere — not in the form, not in the document, not before hashing.
- A capability that cannot sign renders its reason **in place of** the button. There are no dead
  controls here.
- Fixtures live in one place. If a suite needs a signature, import it from
  `frontend/src/test/fixtures/signedMessages.js`; a hand-pasted hex drifts from its message the
  moment either is edited, and a verification suite whose fixture has drifted passes for the wrong
  reason.

## Running the visual harness

```bash
npm run dev --workspace frontend -- --port 5199
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright   # once
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-verify.mjs http://127.0.0.1:5199
```

Playwright is resolved from wherever the operator installed it, never from a workspace manifest
(spec 075). Both stubs are loopback and every other request is aborted, so a run cannot quietly
depend on the internet. Review findings are recorded in the screenshots README.
