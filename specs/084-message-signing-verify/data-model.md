# Data Model: Message Signing and Verification

Phase 1. Two shapes cross module boundaries; neither is persisted anywhere.

## Signed message record

The portable proof. Produced by the signing surface, consumed by the checking surface, and carried
between two people by whatever channel they already use.

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | string | yes | `fairwins-signed-message/1`. Gates parsing; bump the suffix only for a breaking field change. |
| `address` | string | yes | The claimed signer, checksummed on build. |
| `chainId` | number \| null | conditional | **Required** when the signature is a contract-account signature — there is no way to check one without it. Provenance only for a wallet signature. |
| `scheme` | `'eip191'` \| `'erc1271'` \| null | no | How the signature was produced. **A hint, never authority** (research R3). An unrecognised value parses to `null` rather than failing. |
| `message` | string | yes | The signed text, byte-for-byte. Never trimmed, wrapped or normalized. |
| `signature` | string | yes | `0x`-prefixed hex of **even** length. |
| `signedAt` | ISO 8601 string | no | Displayed in the reader's own locale, not raw. |

### Validation rules

- Build refuses an `erc1271` record with no `chainId` — it would be unverifiable by construction.
- Build refuses a missing address, a non-string message, or an empty signature.
- Parse refuses: non-JSON, a non-object, an unrecognised `format`, a missing message or signature,
  or a malformed address. Each refusal names the problem; none is silently defaulted, because a
  defaulted field would be checked against something the signer never signed.
- Parse **accepts** unknown extra keys, so a record from a later version stays readable.
- Parse never throws: the input is member-pasted text, so failure is a return value.

### Lifecycle

Built on a successful signing ceremony → serialized to the clipboard → pasted by the recipient →
parsed → verified. It is never stored, never transmitted by the product, and never reused: editing
the message retires the record on screen, because a proof must not sit under text it does not
cover.

## Verification outcome

| Field | Type | Notes |
|---|---|---|
| `status` | `'valid'` \| `'invalid'` \| `'unverifiable'` | The verdict. Exactly three (research R1). |
| `method` | `'eip191'` \| `'erc1271'` \| null | How the conclusion was reached. |
| `signer` | string \| null | The address recovered from the signature, where one could be. **Evidence, not verdict** — reported alongside a negative and alongside `unverifiable`, because "signed by 0xother" is far more useful than "no". |
| `reason` | string \| null | Member-facing explanation. Always present on `invalid` and `unverifiable`. |

### Decision table

| Situation | status | Why |
|---|---|---|
| Recovered address == claimed address | `valid` | Settled offline; no network involved. |
| No address claimed, signature recovers | `valid` | Answers "who signed this?" — `signer` carries it. |
| Claimed account's contract returns the ERC-1271 magic value | `valid` | The account itself accepted it. |
| Recovery mismatches **and** the chain confirms the claimed address holds no code | `invalid` | Nothing at that address could have produced it. |
| The claimed account's contract declines (any non-magic return, or an empty return) | `invalid` | The account itself said no. |
| Signature is not even-length hex, or the address is malformed | `invalid` | Knowable without any network. |
| No chain given and the signature does not recover to the claim | `unverifiable` | The claim may be a contract account we were never told where to find. |
| No route configured for the chain / node unreachable / call reverted | `unverifiable` | We could not look. Never a claim about the signature. |
| No address claimed and the signature does not recover | `unverifiable` | Nobody to ask; nothing to recover. |
| Anything throws internally | `unverifiable` | Silence is not a permitted outcome (FR-014). |

**The invariant**: a `unverifiable` result asserts something about *us*, never about the signature.
A `invalid` result is only ever produced by a completed check.

## Signing capability

Resolved eagerly from the active identity, so the surface can disclose up front what the account
can do rather than failing on click.

| Field | Type | Notes |
|---|---|---|
| `canSign` | boolean | Gates the control entirely. |
| `kind` | `'eoa'` \| `'passkey'` \| `'vault'` \| `'legacy'` \| `'none'` | Which identity was resolved. |
| `scheme` | string | Present when `canSign` — what the resulting record will declare. |
| `reason` | string | Present when **not** `canSign` — shown in place of the control, and on the entry row so it is legible without opening anything. |
| `sign` | function | Present when `canSign`. Takes the message, returns signature bytes. |
