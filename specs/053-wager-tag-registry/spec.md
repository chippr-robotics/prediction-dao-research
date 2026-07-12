# Feature Specification: Wager Tag Naming Registry

**Feature Branch**: `053-wager-tag-registry`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Wager tag naming registry: members can register a short unique handle (\"wager tag\", displayed with a % prefix, e.g. %chipprbots) tied to their membership, used for fast identity lookup and address entry across pools, wagers, and the address book. Resolution priority becomes address book > wager tag > ENS > random name. Must include abuse/fraud protections against impersonation and accidental account takeover, follow industry standards for naming registries, and support both individual users and businesses."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register a Wager Tag (Priority: P1)

An active member opens their account settings and claims a short, unique handle — their "wager tag" — such as `%chipprbots`. The tag is bound to their account, and from that moment other users can find and interact with them by tag instead of by wallet address. Registration is only available to accounts with an active membership, so every tag is anchored to a real, screened platform identity.

**Why this priority**: Nothing else in the feature works without registered tags. It is also the membership perk that motivates the feature: a benefit users get for purchasing membership.

**Independent Test**: Can be fully tested by having a member claim an available tag, verifying the tag is recorded against their account, and verifying a second account cannot claim the same tag. Delivers value on its own as a claimable, unique membership handle even before lookup surfaces exist.

**Acceptance Scenarios**:

1. **Given** an account with an active membership and no existing tag, **When** the member submits an available, valid tag name, **Then** the tag is registered to their account and displayed everywhere as `%<tag>`.
2. **Given** a tag that is already registered, **When** another member attempts to register the same tag (in any letter casing), **Then** registration is rejected with a clear "tag unavailable" message.
3. **Given** an account without an active membership, **When** the user attempts to register a tag, **Then** registration is refused and the user is directed to membership purchase.
4. **Given** a member entering a tag that violates format rules (too short, too long, forbidden characters, leading/trailing separator), **When** they submit, **Then** the system rejects it and explains the allowed format before anything is committed.
5. **Given** a member who begins claiming an available tag, **When** a third party observes the in-progress claim and tries to register the same tag first, **Then** the registration process prevents the third party from hijacking the claim (the original claimant either completes their claim or no one does).

---

### User Story 2 - Send and Interact by Tag (Priority: P1)

Anywhere the app accepts a wallet address — inviting an opponent to a wager, adding a pool participant, sending funds, saving a contact — a user can type a wager tag (with or without the `%` prefix) and the app resolves it to the owner's wallet address. Before anything is committed, the user sees exactly who the tag resolved to (tag, full address, and verification status) and must confirm.

**Why this priority**: Tag lookup is the core utility of the registry — fast, error-resistant address entry. It ships together with registration as the minimum useful product.

**Independent Test**: Can be tested by registering a tag on account A, then on account B typing `%<tag>` into an address entry field and confirming it resolves to account A's address with a confirmation step showing the full address.

**Acceptance Scenarios**:

1. **Given** a registered tag, **When** a user enters `%<tag>` (or `<tag>`) into any address entry field, **Then** the field resolves it to the owner's current wallet address and displays both the tag and the resolved address for confirmation.
2. **Given** a tag that does not exist, **When** a user enters it, **Then** the app reports "no such tag" and does NOT silently substitute a similar or partial match.
3. **Given** a resolved tag, **When** the user proceeds to a value-bearing action (stake, transfer, pool join invitation), **Then** the confirmation step shows the full resolved address alongside the tag so the user can verify before committing.
4. **Given** a tag whose owning address is blocked by sanctions screening, **When** a user resolves it for a value-bearing action, **Then** the action is blocked exactly as it would be for the raw address.

---

### User Story 3 - Tag-Aware Display Names (Priority: P2)

When the app shows a counterparty (wager cards, pool member lists, activity ledger, address book), the display name now resolves in this priority order: the viewer's own address-book nickname first, then the counterparty's wager tag, then their ENS name, then the generated two-word fallback name. Tags render with the `%` prefix so they are visually distinct from nicknames and ENS names.

**Why this priority**: Display integration makes tags visible across the product and gives owners the recognition benefit, but the registry is already useful for entry/lookup without it.

**Independent Test**: Can be tested by viewing a counterparty that has a registered tag but no address-book entry and confirming the tag is shown; then adding an address-book nickname and confirming the nickname takes over.

**Acceptance Scenarios**:

1. **Given** a counterparty with a registered tag and no address-book entry for the viewer, **When** their identity is displayed, **Then** the wager tag is shown (as `%<tag>`) instead of ENS or the generated name.
2. **Given** the viewer has saved an address-book nickname for the counterparty, **When** the identity is displayed, **Then** the address-book nickname wins over the tag.
3. **Given** a counterparty with no tag, **When** their identity is displayed, **Then** the existing behavior (address book > ENS > generated name) is unchanged.
4. **Given** a displayed tag, **When** the underlying address's tag registration is released or reassigned, **Then** subsequent displays reflect the current registry state rather than a stale cached tag.

---

### User Story 4 - Change or Release a Tag Safely (Priority: P2)

A tag owner can change their tag or release it entirely. To prevent fraud and accidental account takeover, changes are rate-limited, require explicit authorization by the owning account, and a released (or replaced) tag enters a quarantine period during which nobody else can register it — so payments and invitations aimed at the old tag cannot be silently captured by a stranger.

**Why this priority**: Lifecycle management with takeover protection is what makes the registry safe to rely on, but it can ship after basic register + lookup.

**Independent Test**: Can be tested by releasing a tag and verifying that (a) lookups for it now fail, (b) another account cannot register it until the quarantine period elapses, and (c) the previous owner's change cooldown is enforced.

**Acceptance Scenarios**:

1. **Given** a tag owner, **When** they release or change their tag, **Then** the action requires the same level of authorization as other account-controlling actions (no one else — including platform operators — can reassign a tag to a different wallet on the owner's behalf).
2. **Given** a tag was released or replaced, **When** any other account attempts to register that tag during the quarantine period, **Then** registration is refused.
3. **Given** a tag was released or replaced, **When** a user attempts to resolve the old tag during quarantine, **Then** resolution fails with a clear "tag no longer active" outcome rather than resolving to the previous owner or anyone else.
4. **Given** an owner who changed their tag recently, **When** they attempt another change inside the cooldown window, **Then** the change is refused with the date the next change becomes available.
5. **Given** a member's membership lapses, **When** their tag is viewed or resolved, **Then** the tag remains bound to their account (it is not silently freed for others to claim), though registering a *new* tag requires active membership.

---

### User Story 5 - Business Tags and Impersonation Protection (Priority: P3)

Businesses on the platform can hold a wager tag and receive a verification marker after an operator review, so users can distinguish `%chipprbots` (verified business) from a look-alike. The registry blocks impersonation vectors: names confusable with existing tags, platform-reserved terms (e.g. official/support/admin/brand names), and visually deceptive characters are not registrable. Users can report abusive tags, and operators can suspend a tag from lookup — but suspension never transfers the tag or the account's funds to anyone else.

**Why this priority**: Verification and moderation harden trust for commerce, but require the base registry to exist and an operator process to be defined.

**Independent Test**: Can be tested by attempting to register reserved terms and confusable variants of an existing tag (mixed case, substituted look-alike characters) and confirming rejection; and by suspending a tag and confirming lookups fail while ownership is untouched.

**Acceptance Scenarios**:

1. **Given** an existing tag `%chipprbots`, **When** another account attempts to register a confusable variant (e.g. differing only by look-alike characters or casing), **Then** registration is refused.
2. **Given** the reserved-terms list (platform brand names, `admin`, `support`, `official`, and similar), **When** any account attempts to register a reserved term, **Then** registration is refused.
3. **Given** a verified business tag, **When** it is displayed anywhere in the app, **Then** the verification marker is shown; unverified tags never display the marker.
4. **Given** a tag reported for abuse and suspended by an operator, **When** users attempt to resolve it, **Then** resolution fails — but the tag is not reassigned, and the owning account's assets and other functionality are unaffected.

---

### Edge Cases

- Two members submit registration for the same available tag at nearly the same moment — exactly one succeeds; the other gets "tag unavailable", never a partial or split state.
- A user types a tag with the `%` prefix, without it, or with surrounding whitespace/mixed case — all normalize to the same lookup.
- A tag lookup happens while the owner is mid-change (old tag released, new tag pending) — the old tag must not resolve; the new tag resolves only once registration completes.
- A viewer's address-book nickname for an address disagrees with that address's tag — the viewer's own nickname wins (their private label is authoritative for them), but confirmation screens still show the tag and address.
- A tag owner's wallet is rotated/recovered (e.g. passkey account controller change) — the tag follows the account per the account's normal recovery process; it must not be claimable by a third party during recovery.
- The registry is unreachable or lookup fails transiently — address entry falls back to requiring a raw address; display falls back to the existing name chain (address book > ENS > generated); no surface blocks on tag resolution.
- A tag that quarantine has expired for is re-registered by a new owner — any user who previously saved the old owner via tag-based entry has the *address* (not the tag) in their address book, so their saved contact still points at the original person.
- A user attempts to resolve their own tag or register a tag identical to their address-book nickname for someone else — allowed; nicknames are private and tags are global, and confirmation screens always disambiguate.

## Requirements *(mandatory)*

### Functional Requirements

**Registration & eligibility**

- **FR-001**: System MUST allow an account with an active membership to register exactly one wager tag bound to that account.
- **FR-002**: System MUST enforce global uniqueness of tags, case-insensitively: at most one account holds any given tag at any time.
- **FR-003**: System MUST enforce a tag format of 3–20 characters, restricted to lowercase letters `a-z`, digits `0-9`, and single non-leading/non-trailing hyphens; input in other casings is normalized to lowercase before validation and storage. The `%` prefix is a display/entry convention only and is never part of the stored tag.
- **FR-004**: System MUST reject registration of reserved terms (platform brand and product names, operational terms such as `admin`, `support`, `official`, `help`, and an operator-maintained reserved list).
- **FR-005**: System MUST reject registration of names confusable with an existing tag or reserved term (the restricted character set in FR-003 plus case-insensitive matching is the primary mechanism; no visually deceptive characters are registrable).
- **FR-006**: The registration process MUST prevent claim-sniping: a third party observing an in-progress claim MUST NOT be able to register the observed name ahead of the original claimant.
- **FR-007**: System MUST refuse tag registration for accounts that fail the platform's existing sanctions screening.

**Resolution & lookup**

- **FR-008**: System MUST resolve a tag to the owning account's current wallet address (forward resolution) and support finding the tag for a given address (reverse resolution). Reverse resolution MUST only ever report a tag whose forward resolution points back to that same address.
- **FR-009**: Every address entry surface in the app (wager opponent, pool participant, transfers, address book contact creation, open-challenge lookup) MUST accept a wager tag — with or without the `%` prefix — as an alternative to a raw address.
- **FR-010**: Tag resolution MUST be exact-match only after normalization; the system MUST NOT auto-substitute similar, partial, or historical matches.
- **FR-011**: Before any value-bearing action addressed via a tag is committed, the user MUST be shown the tag together with the full resolved wallet address (and verification status, where applicable) and MUST explicitly confirm.
- **FR-012**: All existing address-level protections (sanctions screening, membership checks) MUST apply to the resolved address exactly as if it had been entered directly.
- **FR-013**: When tag resolution is unavailable (registry unreachable, lookup error), affected surfaces MUST degrade gracefully: address entry still accepts raw addresses and display falls back to the existing naming chain; no user flow may hard-block on tag resolution.

**Display integration**

- **FR-014**: Counterparty display names MUST resolve in the priority order: viewer's address-book nickname > wager tag > ENS name > generated two-word name.
- **FR-015**: Tags MUST render with the `%` prefix wherever displayed, visually distinguishing them from nicknames and ENS names.
- **FR-016**: Displayed tags MUST reflect current registry state; a released, changed, or suspended tag MUST NOT continue to appear for its former address beyond ordinary short-lived caching.

**Lifecycle & takeover protection**

- **FR-017**: Only the owning account MUST be able to change or release its tag, using authorization at least as strong as the account's other self-controlled actions. Platform operators MUST NOT be able to transfer a tag to a different account.
- **FR-018**: Tags MUST be non-transferable between accounts; the only path to a new owner is release, quarantine expiry, and fresh registration.
- **FR-019**: A released or replaced tag MUST enter a quarantine period of 90 days during which it cannot be registered by any account and does not resolve.
- **FR-020**: Tag changes MUST be rate-limited to at most one change per 30 days per account.
- **FR-021**: A lapsed membership MUST NOT free the account's existing tag for others; registering a new or changed tag MUST require an active membership.
- **FR-022**: System MUST keep an auditable history of tag registrations, changes, releases, and suspensions sufficient to investigate fraud reports.

**Businesses, verification & moderation**

- **FR-023**: System MUST support a verification marker on tags, granted through an operator review process (intended for businesses and notable accounts), and MUST display verification status wherever the tag appears in confirmation and profile contexts.
- **FR-024**: Users MUST be able to report a tag for abuse or impersonation.
- **FR-025**: Operators MUST be able to suspend a tag (it stops resolving and displaying) in response to abuse; suspension MUST NOT reassign the tag, seize funds, or affect the account's non-tag functionality. Suspension actions MUST be logged (FR-022).

### Key Entities

- **Wager Tag**: A globally unique, normalized handle (3–20 chars, restricted charset) bound to exactly one account; displayed as `%<tag>`. Attributes: name, owning account/address, registration time, verification status, active/suspended state.
- **Tag Owner (Member Account)**: A platform account with (at registration time) an active membership; may be an individual or a business. Holds at most one tag.
- **Reserved Term**: An operator-maintained name that can never be registered (brand terms, operational terms).
- **Quarantined Tag**: A previously registered tag inside its 90-day post-release window; resolves to nothing and cannot be registered.
- **Tag History Record**: Append-only record of a tag lifecycle event (registered, changed, released, suspended, verified) used for audit and fraud investigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member with active membership can register an available tag in under 2 minutes end-to-end.
- **SC-002**: Entering a known tag in any address entry surface resolves and displays the confirmation (tag + full address) in under 2 seconds under normal conditions.
- **SC-003**: 100% of registration attempts for reserved terms and confusable variants of existing tags (test corpus including casing and look-alike substitutions) are rejected.
- **SC-004**: Zero successful registrations of a released tag by a different account during the quarantine period, and zero resolutions of a released tag during quarantine (verified by test).
- **SC-005**: Tag resolution is exact-match only: 100% of lookups for unregistered tags return "not found" with no substitute suggestions applied automatically.
- **SC-006**: In display contexts, counterparties with a tag and no address-book nickname show the tag (not ENS or generated name) in 100% of sampled surfaces; adding a nickname flips display to the nickname.
- **SC-007**: 100% of value-bearing flows addressed by tag present the full resolved address for confirmation before commitment.
- **SC-008**: No user flow hard-fails when tag resolution is unavailable — all affected surfaces degrade to raw-address entry and the existing naming chain.

## Assumptions

- Tag registration is included with an active membership at no additional charge, and each account may hold exactly one tag. Paid/premium tags, auctions, and paid renewals are out of scope for v1.
- Tags are non-transferable in v1; a secondary market or transfer flow is explicitly out of scope.
- Default protection windows: 90-day quarantine after release/change, 30-day cooldown between changes. These are policy parameters and may be tuned before launch without changing the feature's shape.
- The character set is intentionally ASCII-only (lowercase letters, digits, single interior hyphens) as the primary defense against homoglyph/confusable impersonation, following the same tradeoff mainstream handle systems make. Unicode tag support is out of scope.
- Business verification is a manual operator review in v1; automated verification (e.g. domain proof) is a possible follow-up.
- Tags are public information by design (they exist to be looked up); the feature intentionally does not interact with the pools' anonymity/nickname system — pool two-word nicknames remain client-side and unchanged where anonymity is the point.
- The registry is "in house": operated by the platform as the authoritative source of truth for tags, independent of ENS. ENS remains a lower-priority display fallback only.
- The existing membership system is the eligibility gate; no new identity verification is introduced for basic (unverified) tags beyond what membership purchase already enforces.
- Existing address-book behavior is unchanged: the viewer's saved nickname remains the top display priority, and address book entries continue to store addresses (not tags), so a tag changing hands never silently redirects a saved contact.
