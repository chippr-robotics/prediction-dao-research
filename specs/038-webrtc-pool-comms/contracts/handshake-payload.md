# Contract: Out-of-Band Handshake Payload (`fwpc-hs/1`)

The pairing payload members and the creator exchange by copy-paste or QR to
establish a channel session. Two payload kinds: `offer` (member → creator) and
`answer` (creator → member). Implemented by `frontend/src/lib/pools/channel/
handshake.js` + `sdpCompact.js`.

## Wire format

```
FWPC1-<kind>-<base64url(deflate(json))>-<crc8hex>
```

- `FWPC1` — version tag; parsers MUST reject other versions with a clear
  "incompatible version" message.
- `kind` — `O` (offer) or `A` (answer).
- Payload is deflate-compressed JSON, base64url (no padding).
- `crc8hex` — 2-hex-char checksum of the base64url body; catches truncated
  copy-paste before JSON parsing.
- Size budget: ≤ ~1.8 KB total (QR-scannable with `qrcode.react` defaults;
  validated by spike R12). The UI always offers copyable text alongside QR.

## JSON fields (both kinds)

| Field | Type | Purpose |
|---|---|---|
| `chainId` | number | scope; receiver MUST match active network |
| `pool` | address | scope; receiver MUST match open pool |
| `role` | `"member"` \| `"creator"` | asserted role; drives verification path |
| `nonce` | hex(16B) | single-use; `sessionId = keccak(offerNonce ‖ answerNonce)` |
| `sessionPubKey` | base64(32B) | ephemeral tweetnacl signing pub key (envelope auth) |
| `boxPubKey` | base64(32B) | ephemeral tweetnacl box pub key (claim-code encryption; creator answer only, optional in offer) |
| `dtls` | string | DTLS certificate fingerprint (`a=fingerprint`) |
| `ice` | object | `{ufrag, pwd, candidates[]}` — compact ICE parameters (see sdpCompact) |
| `auth` | object | signature block, per role (below) |

`sdpCompact` candidate entries keep only: foundation, component, protocol,
priority, address (incl. mDNS hostnames), port, type, and relatedAddress/port
where present. Receiver reconstructs a canonical SDP; reconstruction MUST be
deterministic and covered by round-trip unit tests.

## Authentication block

Signed message (both roles), exact byte layout defined in `handshake.js` and
kept stable:

```
"FairWins Pool Channel v1" ‖ chainId ‖ pool ‖ role ‖ nonce ‖ dtls ‖ sessionPubKey [‖ boxPubKey]
```

- **Member offer**: `auth = {commitment, sig}` where `sig` is a Semaphore
  identity signature (`Identity.signMessage`). Verifier (creator) MUST:
  1. verify `sig` against `commitment` (`Identity.verifySignature`);
  2. check `commitment` ∈ pool's on-chain member set;
  3. reject reused `nonce` (session table).
  The offer MUST NOT contain any wallet address (FR-020a).
- **Creator answer**: `auth = {sig}`, an EIP-191 wallet signature. Verifier
  (member) MUST recover the address and require it equals the pool's on-chain
  `creator()`.

A session opens only when: both signatures verified, scopes matched, DTLS
fingerprint of the actual connection equals the signed `dtls`, and the data
channel's first message (`hello` envelope) verifies under `sessionPubKey`.
Any mismatch → session torn down with a truthful error (no silent retry loop).

## Prohibited content

Payloads MUST NEVER contain: claim codes, identity secrets, wallet addresses
(member payloads), or material valid for another pool/session (single-use
nonces enforce this) — FR-020a, FR-014.

## Failure handling (edge cases from spec)

| Condition | Required behavior |
|---|---|
| Checksum/parse failure | "code looks incomplete — re-copy/rescan" retry prompt |
| Version mismatch | explicit incompatible-version message |
| Wrong pool/network scope | named mismatch (which pool/network it was for) |
| Signature invalid / non-member | "not a verified member of this pool" (FR-002) |
| Stale (nonce already used) | "this pairing code was already used — generate a new one" |
| ICE never connects | truthful "could not connect" + manual-flow fallback (FR-023) |
