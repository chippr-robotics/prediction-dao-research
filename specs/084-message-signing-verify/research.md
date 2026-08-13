# Research: Message Signing and Verification (Protect ▸ Verify)

Phase 0. Each entry is a decision that shaped the design, with what was rejected and why.

## R1 — How many verification outcomes?

**Decision**: Three — `valid`, `invalid`, `unverifiable`. `invalid` is reported only when the
contradiction is established; anything that prevents completing the check resolves to
`unverifiable` with the reason named.

**Rationale**: One of the two verification paths is a network read. An unreachable node, an absent
route, or a chain the record never named are all common, and none of them is evidence about the
signature. A two-state model has to map them onto one of the two states, and both mappings are
lies: mapping to `valid` accepts unproven claims, mapping to `invalid` tells a member their
counterparty forged a signature when nobody looked. Constitution III makes the second one a
principle violation, not a UX preference.

**Alternatives considered**:

- *Boolean plus a separate error channel.* This is the shape that produced the actual bug found in
  review (#1163): errors that fall outside the anticipated set end up in neither channel and
  render as nothing at all. A verdict type that can express "no verdict" cannot have that gap.
- *Boolean, treating unreachable as invalid.* Rejected: it is the failure this feature exists to
  prevent, and it is worse than useless — a confidently wrong accusation.
- *Boolean, treating unreachable as valid.* Rejected outright: fails open on an identity claim.

## R2 — What actually travels between two members?

**Decision**: A JSON record carrying the message, the signature, the claimed address, the network,
a timestamp, and a format tag. Not a bare signature.

**Rationale**: A signature alone is not checkable. A contract-account signature does not recover to
anything, so a verifier needs the address to ask *and* the chain to ask it on; without the chain
the only honest answer is `unverifiable` (R1). Bundling them is the difference between a proof and
a blob. JSON because the message must survive byte-for-byte and JSON round-trips whitespace and
Unicode exactly — the property FR-002 depends on.

**Alternatives considered**:

- *Bare signature hex.* Rejected: unverifiable for contract accounts, and it makes the member
  hand-copy three more fields, which is where the chain id gets lost.
- *A signed-message block format* (the `-----BEGIN-----` convention). Rejected: a hand-rolled
  parser with escaping rules is exactly how a trailing newline silently changes and invalidates a
  good signature.
- *A downloadable file.* Rejected as the primary form: members exchange this in chats and tickets.
  Copyable text goes everywhere a file does not, and nothing precludes adding a file later.

## R3 — Is the record's declared signature type authoritative?

**Decision**: No. It is a hint recorded for the reader; verification tries both paths and reaches
its own conclusion.

**Rationale**: The field is attacker-controlled — it arrives inside the document being checked.
Trusting it would let a record steer verification down a path that suits it. Deciding from the
signature costs one cheap recovery attempt, so honesty is also the cheap option here.

**Alternatives considered**: *Trust the field to skip a step.* Rejected: it saves a sub-millisecond
computation in exchange for making a security-relevant decision from untrusted input. There is a
test asserting a record that lies about its type verifies identically.

## R4 — How does each identity sign?

**Decision**: Route by identity, and refuse where refusal is correct.

| Identity | Path |
|---|---|
| Classic wallet | ethers `signMessage` → EIP-191 ECDSA. Checkable offline by anyone. |
| Recovered legacy account (spec 062) | the unlocked in-memory key, so the proof is attributed to the recovered address the member is presenting |
| Passkey smart account (spec 041) | one WebAuthn ceremony → the account's ERC-1271 envelope. Checkable only on its own chain. |
| Safe vault (spec 043 operate-as) | **refused, with the reason stated** |

**Rationale for the refusal**: a Safe has no signing key. Proving control of one requires a
threshold of owners approving an on-chain message — a proposal flow, not a signature box. Signing
with the connected key while the UI says "vault" would produce a proof that attributes the
member's *personal* key to the vault: a truthful-looking, false claim. That is precisely the
misattribution the feature exists to prevent, so refusing is the security behaviour.

**Alternatives considered**:

- *Sign with the connected key and label it.* Rejected — see above; a label does not travel with
  the record.
- *Implement the Safe `signMessage` proposal flow.* Rejected as out of scope (YAGNI): it is a
  multi-owner approval flow with its own lifecycle, and this feature does not need it to be
  useful. The refusal names the situation, so the door stays open.

## R5 — Extend the passkey signer or write a new one?

**Decision**: Add `signMessage` to the existing `passkeyIntentSigner`, alongside `signTypedData`,
with both delegating to one private `signDigest`.

**Rationale**: The ceremony is identical apart from which digest goes in — `hashMessage(m)` instead
of the EIP-712 hash. A second implementation would mean two copies of the replay-safe-hash wrap,
the WebAuthn assertion, and the signature-wrapper encoding, and a future change to the envelope
would land on one and miss the other. One private helper makes that drift impossible.

**Alternatives considered**: *A separate personal-message signer module.* Rejected as duplication
of security-relevant encoding.

## R6 — Where does the surface live, and in what shape?

**Decision**: A third subsection of the Protect panel, rendered as two entry rows whose forms open
in the shared `ActionSheet`.

**Rationale**: Protect is already long (vault list, policies, proposals). Inline, the two forms
added roughly 3,000 px and pushed the vault sections below the fold — measured, not estimated, in
the first round of the visual review. As rows the area costs about 300 px, independent of how much
has been typed, and each form gets a focused surface. `ActionSheet` is the platform's existing
sheet: bottom sheet on phones, centred card on desktop, focus-trapped, scroll-locked, and already
correct.

**Consequences that had to be designed for**:

- The sheet unmounts its children when closed, so both drafts are hoisted into `VerifySection`.
  Otherwise closing the sheet silently discards a half-typed message, and a returning member sees a
  signed record with no message under it (the sign form only renders a record matching the text on
  screen).
- `.action-sheet` scrolls as a whole, taking its own header and close control with it. Hence the
  opt-in pinned header (see plan Complexity Tracking).
- A result arriving below the fold reads as nothing happening, so results are scrolled into view.

**Alternatives considered**:

- *Inline forms.* Rejected on the measurement above.
- *An accordion.* Tried first. Better than inline, still ~2× the page height of rows, and it puts a
  long form in the middle of a scrolling page rather than on a surface of its own.
- *A separate nav destination.* Rejected: the spec places this in Protect, and a whole tab for two
  forms is not warranted.

## R7 — Which networks may the check offer?

**Decision**: The build's cohort (`cohortChainIds()`), never the full supported list.

**Rationale**: Constitution III forbids reads crossing the testnet/mainnet boundary. Offering a
mainnet chain in a testnet build would let a member check a claim against an estate that build must
not touch. Providers come from the shared read-provider factory so the member's own RPC settings
(spec 069) apply, rather than a hand-built provider that would ignore them.

## R8 — Verifying without a stated address

**Decision**: Support it, and be explicit about its limit.

**Rationale**: "Who signed this?" is a genuinely useful question and costs nothing for a wallet
signature. But it cannot be answered for a contract-account signature, which is a confirm/deny
oracle rather than a recovery: with no address there is nobody to ask. Reporting `unverifiable`
with that explanation is more useful than hiding the option.

## R9 — Fixtures for signatures

**Decision**: One shared fixture module, with signatures **computed** at import from a published
test key. Imported by the vitest suites and by the Playwright capture harness.

**Rationale**: A pasted signature hex and the message it covers drift apart the moment either is
edited, and a verification suite whose fixture has drifted passes for the wrong reason —
green while proving nothing. Computing removes the failure mode. Sharing with the capture harness
means screenshots show records that genuinely verify, rather than posed ones.

**Alternatives considered**: *Per-suite inline constants.* Rejected: that is the drift above, three
times over.
