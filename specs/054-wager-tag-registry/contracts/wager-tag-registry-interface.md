# Contract Interface: `IWagerTagRegistry` (spec 054)

New file `contracts/interfaces/IWagerTagRegistry.sol`; implemented by
`contracts/naming/WagerTagRegistry.sol` (UUPS proxy: `UUPSManaged` + `SignerIntentBase`).
Signatures below are the binding surface; NatSpec and errors are elaborated in
implementation.

```solidity
enum TagStatus { NONE, ACTIVE, REPOINTING, QUARANTINED, SUSPENDED, LAPSED_RECLAIMABLE }

struct TagInfo {
    address owner;
    string  tag;            // canonical form, no '%'
    TagStatus status;
    bool    verified;
    address pendingOwner;   // nonzero only while REPOINTING
    uint64  repointEffectiveAt;
    uint64  quarantinedUntil; // nonzero only while QUARANTINED
}

interface IWagerTagRegistry {
    // ---- Registration (commit–reveal, research R3) ----
    function makeCommitment(string calldata tag, address owner, bytes32 salt)
        external pure returns (bytes32);
    function commit(bytes32 commitment) external;
    function register(string calldata tag, bytes32 salt) external;
    /// Atomic release-old + register-new under one cooldown check (FR-020).
    function changeTag(string calldata newTag, bytes32 salt) external;
    function release() external;

    // ---- Repointing (FR-022) ----
    function requestRepoint(address newOwner) external;
    function cancelRepoint() external;
    /// Callable by anyone once the delay has elapsed (moves owner + reverse index).
    function finalizeRepoint(bytes32 tagHash) external;

    // ---- Lapse reclamation (FR-021, permissionless) ----
    function reclaimLapsed(bytes32 tagHash) external;

    // ---- Resolution (FR-008/FR-010) ----
    function resolve(string calldata tag) external view returns (TagInfo memory);
    function tagOf(address account) external view returns (string memory); // "" if none/inactive
    function getTagInfoByHash(bytes32 tagHash) external view returns (TagInfo memory);
    function isAvailable(string calldata tag) external view returns (bool);

    // ---- Moderation / curation / verification (roles, research R6) ----
    function setReserved(bytes32[] calldata tagHashes, bool isReserved) external; // CURATOR
    function setSuspended(bytes32 tagHash, bool isSuspended) external;            // MODERATOR
    function setVerified(bytes32 tagHash, bool isVerified) external;              // VERIFIER

    // ---- Admin (bounded policy params, research R10) ----
    function setPolicyParams(
        uint64 minCommitmentAge, uint64 maxCommitmentAge, uint64 quarantinePeriod,
        uint64 changeCooldown, uint64 repointDelay, uint64 lapseGrace
    ) external;
    /// Membership eligibility gate: which role's tier is checked and the minimum tier.
    /// `tier` is hard-bounded >= Tier.Gold so the gate can never be relaxed below Gold.
    function setMembershipGate(bytes32 role, IMembershipManager.Tier tier) external; // ADMIN
}
```

**Gasless twins** (`SignerIntentBase`, spec 035 pattern): `commitWithSig`,
`registerWithSig`, `changeTagWithSig`, `releaseWithSig`, `requestRepointWithSig`,
`cancelRepointWithSig`. `finalizeRepoint` and `reclaimLapsed` are permissionless — no twin
needed. EIP-712 schemas in [intent-eip712-schemas.md](./intent-eip712-schemas.md).

**Events** (complete audit trail, FR-023): `TagCommitted(commitment)`,
`TagRegistered(tagHash, tag, owner)`, `TagReleased(tagHash, owner, quarantinedUntil)`,
`TagChanged(oldTagHash, newTagHash, owner)`, `TagRepointRequested(tagHash, from, to, effectiveAt)`,
`TagRepointCancelled(tagHash)`, `TagRepointFinalized(tagHash, from, to)`,
`TagReclaimed(tagHash, formerOwner)`, `TagSuspended/TagUnsuspended(tagHash)`,
`TagVerificationSet(tagHash, verified)`, `TagsReserved(count, isReserved)`,
`PolicyParamsSet(...)`.

**Registration guards** (in `register` / `changeTag`): canonical-form bytes validation
(FR-003), not reserved (FR-004), not registered/quarantined (FR-002/FR-019), caller holds
no tag (FR-001), **Gold-tier-or-above membership** via
`uint8(IMembershipManager.getActiveTier(caller, membershipRole)) >= uint8(minTier)` else
revert `InsufficientMembershipTier` (FR-001; `getActiveTier` returns `None` when expired, so
this one check covers absent/expired/too-low), sanctions-clear via `ISanctionsGuard`
(FR-007), commitment aged within `[minCommitmentAge, maxCommitmentAge]` (FR-006), cooldown
satisfied for changes (FR-020). `requestRepoint` intentionally does NOT apply the tier guard
(FR-022 — a holder can always move their own identity). This mirrors the live Silver+ gates
at `WagerRegistry.sol:270` / `ExternalDAORegistry.sol:67`.

> Frontend: the `InsufficientMembershipTier` selector is already mapped to *"requires a
> Silver membership or above"* copy (`useOpenChallengeCreate.js:214`); the tag surfaces MUST
> add a distinct Gold-specific message so the revert reads *"requires a Gold membership or
> above"* rather than reusing the Silver wording.

**Optionality** (FR-001a): the gate above only executes on a *voluntary* register/change.
No contract function requires a tag as a precondition of any other action, and the frontend
lib never blocks a flow on tag ownership — a tagless account is a first-class caller.

**Explicitly absent** (spec FR-017/FR-018/FR-026): any function that moves a tag to a
different owner without the owner's own authorization. No operator transfer, no admin
reassignment, no ERC-721 semantics.

# Frontend module contract: `frontend/src/lib/tags/`

```
normalizeTag(input: string): string            // throws TagFormatError
isTagLike(input: string): boolean              // /^%?[a-z0-9-]{3,20}$/i — entry-field detection
formatTag(tag: string): string                 // '%'+tag (FR-015)
resolveTag(tag, { chainId, provider }): Promise<{ address, status, verified, tag }>
lookupTagOf(address, { chainId, provider }): Promise<{ tag, verified } | null>
```

Hook contract: `useWagerTag(address) → { tag, verified, isLoading }` (null-safe, cached,
error → null). `useOpponentName` inserts the tag step between address book and ENS; its
result `source` union gains `'wagerTag'`.

`AddressInput` behavior: `isTagLike` input → `resolveTag` → render resolved full address +
verification badge in the existing confirmation affordance; only status `ACTIVE` may be
committed to the field's value (FR-011/FR-022); resolution failure leaves manual address
entry fully functional (FR-013).
