# Contract: the signed-message record

This is the feature's only external interface. Everything else is internal to the SPA, but this
record leaves the product entirely — a member pastes it into a chat, an email, a support ticket —
and may come back weeks later, or be read by a tool that is not this one. That makes it a contract.

## Format

```json
{
  "format": "fairwins-signed-message/1",
  "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "chainId": 137,
  "scheme": "eip191",
  "message": "FairWins verification: I control this account.\nNonce: 8f31c0",
  "signature": "0x652a891e8b92…",
  "signedAt": "2026-08-13T12:00:00.000Z"
}
```

## Guarantees to a reader

1. **`message` is exactly the bytes that were signed.** Nothing trimmed, wrapped, re-encoded or
   appended. A reader may hash it directly.
2. **`signature` is `0x`-prefixed hex of even length.** Its length is *not* fixed: a wallet
   signature is 65 bytes, a contract-account signature is arbitrary.
3. **`chainId` is present whenever it is needed.** A record declaring `scheme: "erc1271"` without a
   chain is never produced, because it would be unverifiable by construction.
4. **Unknown keys may appear.** A reader must ignore fields it does not recognise rather than
   rejecting the record; this is how the format grows without breaking existing readers.

## Non-guarantees — read these before writing a reader

1. **`scheme` is not authoritative.** It records what the producer believed. A reader MUST determine
   the signature type from the signature itself and MUST NOT branch on this field for a security
   decision. This implementation tries both paths regardless, and there is a test asserting a record
   that misdeclares its scheme verifies identically.
2. **`address` is a claim, not a fact.** It is the thing being checked, never an input to trust.
3. **`signedAt` is producer-supplied and unattested.** It is not covered by the signature and can say
   anything. Treat it as a display hint. A reader needing trustworthy freshness must put a nonce or
   a timestamp *inside* `message`, where the signature covers it — which is why the message is
   signed verbatim.

## How a reader verifies

**Steps 1 is offline and settles the common case. Step 2 is a separate, deliberate action.**

1. If `signature` is 65 bytes, recover the EIP-191 signer of `message` and compare to `address`.
   Match ⇒ **valid**, and no network is needed. A mismatch is a FACT worth reporting ("produced by
   0xB") but is not yet a verdict — see step 3.
2. Otherwise, or on a mismatch, ask the account: `eth_call isValidSignature(hashMessage(message),
   signature)` at `address` on `chainId`. Only `0x1626ba7e` counts as acceptance.
3. If step 2 cannot be completed — no chain given, no route, node unreachable, call reverted — the
   result is **not determinable**. It is not a negative. A mismatching recovery in step 1 is not a
   negative either while step 2 is unresolved: a smart-account owner key recovering instead of the
   account it controls is exactly what a legitimate contract-account signature looks like from
   outside.

## Versioning

`format` gates parsing. Additive fields do **not** change the version — readers ignore unknowns
(guarantee 4). Bump the suffix (`/2`) only when an existing field changes meaning or is removed, at
which point a `/1` reader will correctly refuse rather than misread.
