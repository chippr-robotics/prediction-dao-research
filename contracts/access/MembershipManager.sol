// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
import {SignerIntentBase} from "../upgradeable/SignerIntentBase.sol";
import {ERC3009Auth} from "../interfaces/IERC3009.sol";
import "../interfaces/IMembershipManager.sol";
import "../interfaces/IMembershipVoucher.sol";
import "../interfaces/ISanctionsGuard.sol";

/// @title MembershipManager
/// @notice Tiered, time-bound memberships per role. USDC-denominated. The only
///         paid role is `WAGER_PARTICIPANT_ROLE`; the surface is bytes32-keyed
///         so future paid roles can be added without a redeploy.
/// @dev    Role separation:
///           DEFAULT_ADMIN_ROLE     — treasury, tier config, role administration
///           ROLE_MANAGER_ROLE      — grant / revoke memberships out-of-band
///           authorizedCallers map  — kept for the WagerRegistry hook surface
contract MembershipManager is IMembershipManager, UUPSManaged, SignerIntentBase {
    using SafeERC20 for IERC20;

    uint64 private constant ROLLING_WINDOW = 30 days;

    bytes32 public constant ROLE_MANAGER_ROLE = keccak256("ROLE_MANAGER_ROLE");

    // ---- Signer-attributed intent typehashes (spec 035). Money-in structs bind the EIP-3009
    //      payment nonce so the money leg is stapled to this exact action (FR-007/FR-013). ----
    bytes32 private constant PURCHASE_TIER_INTENT_TYPEHASH = keccak256(
        "PurchaseTierIntent(bytes32 role,uint8 tier,bytes32 acceptedTermsHash,address member,bytes32 paymentNonce,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant UPGRADE_TIER_INTENT_TYPEHASH = keccak256(
        "UpgradeTierIntent(bytes32 role,uint8 tier,bytes32 acceptedTermsHash,address member,bytes32 paymentNonce,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant EXTEND_MEMBERSHIP_INTENT_TYPEHASH = keccak256(
        "ExtendMembershipIntent(bytes32 role,address member,bytes32 paymentNonce,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );
    bytes32 private constant REDEEM_VOUCHER_INTENT_TYPEHASH = keccak256(
        "RedeemVoucherIntent(uint256 voucherId,bytes32 acceptedTermsHash,address redeemer,bytes32 nonce,uint256 validAfter,uint256 validBefore)"
    );

    mapping(bytes32 => mapping(Tier => TierConfig)) private _tiers;
    mapping(address => mapping(bytes32 => Membership)) private _memberships;
    mapping(address => bool) public authorizedCallers;

    IERC20 public paymentToken;
    address public treasury;
    uint128 public accruedFees;

    /// @notice Non-bypassable on-chain sanctions guard (Spec 007, FR-054). When unset
    ///         (address(0)) screening is skipped — the production deploy wires it in.
    ISanctionsGuard public sanctionsGuard;

    /// @notice Accepted T&C version hash recorded at membership purchase/upgrade
    ///         (Spec 007, FR-039): user => role => SHA-256 of the in-force Terms.
    mapping(address => mapping(bytes32 => bytes32)) public memberTermsHash;

    /// @notice The MembershipVoucher contract whose redemption mints memberships here (spec 026).
    ///         Appended after all prior state (consumes one `__gap` slot — append-only).
    address public voucher;

    // ---- Fee netting (spec 035), appended after all prior state (consumes 2 __gap slots; the intent
    //      replay-nonce map lives in SignerIntentBase's ERC-7201 namespaced storage — zero gap cost) ----
    /// @notice When true, the `…WithAuthorization` twins consume the signer's second (bounded) EIP-3009
    ///         fee authorization and forward it to {gasFeeRecipient} atomically (FR-015/FR-016).
    bool public feeNettingEnabled;
    /// @notice Segregated stablecoin fee recipient — MUST NOT be the relayer hot key (spec 036 SC-015).
    ///         Packs with {feeNettingEnabled} into one slot.
    address public gasFeeRecipient;
    /// @notice Hard per-transaction ceiling on the fee authorization a twin will consume.
    uint256 public maxGasFee;

    /// @dev Trailing reserve so future upgrades can append state append-only without shifting layout
    ///      (spec 027 — UUPS migration). Validated by `npm run check:storage-layout`. Never insert/reorder/
    ///      remove the state above. (Reduced from 50 → 49 when `voucher` was appended in spec 026, then
    ///      49 → 47 for the spec 035 fee-netting scalars — `feeNettingEnabled`+`gasFeeRecipient` pack into
    ///      one slot, `maxGasFee` the second.)
    uint256[47] private __gap;

    event TierSet(bytes32 indexed role, Tier indexed tier, uint128 priceUSDC, uint32 durationDays, bool active);
    event TreasuryUpdated(address indexed treasury);
    event PaymentTokenUpdated(address indexed token);
    event AuthorizedCallerSet(address indexed caller, bool allowed);
    event SanctionsGuardUpdated(address indexed guard);
    event MembershipTermsRecorded(address indexed user, bytes32 indexed role, bytes32 termsHash, uint64 at);
    event FeeNettingUpdated(bool enabled, address indexed gasFeeRecipient, uint256 maxGasFee);
    event MembershipPurchased(address indexed user, bytes32 indexed role, Tier tier, uint128 price, uint64 expiresAt);
    event MembershipUpgraded(address indexed user, bytes32 indexed role, Tier fromTier, Tier toTier, uint128 delta);
    event MembershipExtended(address indexed user, bytes32 indexed role, uint32 durationDays, uint128 price, uint64 expiresAt);
    event MembershipGranted(address indexed user, bytes32 indexed role, Tier tier, uint64 expiresAt);
    event FeesWithdrawn(address indexed to, uint128 amount);
    event WagerCreated(address indexed user, bytes32 indexed role);
    event WagerClosed(address indexed user, bytes32 indexed role);

    error TierInactive();
    error NotAuthorized();
    error NoActiveMembership();
    error AlreadyActive();
    error MonthlyLimitReached();
    error ConcurrentLimitReached();
    error NotUpgrade();
    error PriceZero();
    error ZeroAddress();
    error InsufficientFees();
    error TierNone();
    error VoucherNotSet();
    error NotVoucherOwner();

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert NotAuthorized();
        _;
    }

    /// @notice One-time initializer that replaces the constructor for the UUPS proxy (spec 027).
    /// @dev    Same args/effects as the former constructor. `__UUPSManaged_init` is called FIRST and grants
    ///         DEFAULT_ADMIN_ROLE + UPGRADER_ROLE to `admin`; ROLE_MANAGER_ROLE is re-granted here to preserve
    ///         the prior behavior. The bare implementation's initializers are disabled by UUPSManaged's
    ///         constructor, so only the proxy can be initialized — and only once.
    function initialize(address admin, address paymentToken_, address treasury_) external initializer {
        if (admin == address(0) || paymentToken_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        __UUPSManaged_init(admin);
        __EIP712_init("FairWins MembershipManager", "1"); // signer-attributed intents (spec 035)
        paymentToken = IERC20(paymentToken_);
        treasury = treasury_;
        _grantRole(ROLE_MANAGER_ROLE, admin);
    }

    /// @notice One-time upgrade initializer for spec 035 (gasless intents). The live proxy was
    ///         initialized before this contract carried an EIP-712 domain, so the domain used by the
    ///         `…WithAuthorization`/`…WithSig` twins is set here, invoked via `upgradeToAndCall`
    ///         during the in-place upgrade. Fresh deploys set it in {initialize} and never call this.
    function initializeIntents() external reinitializer(2) {
        __EIP712_init("FairWins MembershipManager", "1");
    }

    // ---------- Admin ----------

    function setTier(
        bytes32 role,
        Tier tier,
        uint128 priceUSDC,
        uint32 durationDays,
        Limits calldata limits,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (tier == Tier.None) revert TierNone();
        _tiers[role][tier] = TierConfig(priceUSDC, durationDays, active, limits);
        emit TierSet(role, tier, priceUSDC, durationDays, active);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setPaymentToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        paymentToken = IERC20(token);
        emit PaymentTokenUpdated(token);
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerSet(caller, allowed);
    }

    /// @notice Set the on-chain sanctions guard. Pass address(0) to disable screening.
    function setSanctionsGuard(address guard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        sanctionsGuard = ISanctionsGuard(guard);
        emit SanctionsGuardUpdated(guard);
    }

    /// @notice Wire the MembershipVoucher contract whose redemption mints memberships here (spec 026).
    function setVoucher(address voucher_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (voucher_ == address(0)) revert ZeroAddress();
        voucher = voucher_;
        emit VoucherSet(voucher_);
    }

    /// @notice Configure atomic fee netting for the `…WithAuthorization` twins (spec 035 FR-015/FR-016).
    ///         `recipient` is the segregated stablecoin fee sink — never the relayer hot key (036 SC-015).
    function setFeeNetting(bool enabled, address recipient, uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (enabled && recipient == address(0)) revert ZeroAddress();
        feeNettingEnabled = enabled;
        gasFeeRecipient = recipient;
        maxGasFee = cap;
        emit FeeNettingUpdated(enabled, recipient, cap);
    }

    /// @dev Sanctions screen (Spec 007, FR-054). No-op when unset; otherwise reverts for a
    ///      listed/sanctioned address. Read-only Check, before any fee transfer/effects.
    function _screen(address account) internal view {
        ISanctionsGuard guard = sanctionsGuard;
        if (address(guard) != address(0)) guard.checkBlocked(account);
    }

    /// @dev Record the accepted T&C version hash for the acting identity (Spec 007, FR-039) —
    ///      msg.sender when self-submitted, the recovered intent signer when relayed (spec 035).
    function _recordTerms(address actor, bytes32 role, bytes32 acceptedTermsHash) internal {
        if (acceptedTermsHash != bytes32(0)) {
            memberTermsHash[actor][role] = acceptedTermsHash;
            emit MembershipTermsRecorded(actor, role, acceptedTermsHash, uint64(block.timestamp));
        }
    }

    /// @dev Collect a payment from `from`: allowance pull when self-submitted, the signer's stapled
    ///      EIP-3009 authorization when relayed (bound to amount + paymentNonce, spec 035 FR-007).
    function _collectPayment(address from, uint128 amount, bool viaAuth, ERC3009Auth memory auth, bytes32 paymentNonce) private {
        if (viaAuth) {
            _pullWithAuthorization(address(paymentToken), from, amount, paymentNonce, auth);
        } else {
            paymentToken.safeTransferFrom(from, address(this), amount);
        }
        accruedFees += amount;
    }

    /// @dev Zero-value authorization placeholder for the self-submit paths (never consumed).
    function _emptyAuth() private pure returns (ERC3009Auth memory auth) {}

    function grantMembership(address user, bytes32 role, Tier tier, uint32 durationDays) external onlyRole(ROLE_MANAGER_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        if (tier == Tier.None) revert TierNone();
        // Spec 007 (FR-054): the sanctions guard is non-bypassable — an admin grant must not
        // hand a sanctioned/deny-listed address standing either. Screen the grantee.
        _screen(user);
        Membership storage m = _memberships[user][role];
        m.tier = tier;
        m.expiresAt = uint64(block.timestamp) + uint64(durationDays) * 1 days;
        m.monthCount = 0;
        m.monthAnchor = uint64(block.timestamp);
        emit MembershipGranted(user, role, tier, m.expiresAt);
    }

    function revokeMembership(address user, bytes32 role) external onlyRole(ROLE_MANAGER_ROLE) {
        if (user == address(0)) revert ZeroAddress();
        Membership storage m = _memberships[user][role];
        m.tier = Tier.None;
        m.expiresAt = 0;
        // monthCount / activeCount left intact: WagerRegistry still needs to call recordClose
        // on any in-flight wagers, and resetting activeCount here would break that bookkeeping.
        emit MembershipRevoked(user, role, msg.sender);
    }

    function withdrawFees(uint128 amount, address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount > accruedFees) revert InsufficientFees();
        accruedFees -= amount;
        paymentToken.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    // ---------- User ----------

    function purchaseTier(bytes32 role, Tier tier) external {
        _purchaseTier(msg.sender, role, tier, false, _emptyAuth(), bytes32(0));
    }

    /// @notice Like {purchaseTier} but records the accepted T&C version hash on-chain
    ///         (Spec 007, FR-039). Existing purchaseTier ABI is preserved.
    function purchaseTierWithTerms(bytes32 role, Tier tier, bytes32 acceptedTermsHash) external {
        _purchaseTier(msg.sender, role, tier, false, _emptyAuth(), bytes32(0));
        _recordTerms(msg.sender, role, acceptedTermsHash);
    }

    /// @dev Shared purchase body. `actor` is the acting identity — msg.sender when self-submitted,
    ///      the recovered intent signer when relayed (spec 035 twin invariant). Every check
    ///      (sanctions, tier state) evaluates `actor`; the price is pulled from `actor`.
    function _purchaseTier(address actor, bytes32 role, Tier tier, bool viaAuth, ERC3009Auth memory priceAuth, bytes32 paymentNonce) internal {
        _screen(actor); // Sanctions screen (Spec 007, FR-054) — before any fee transfer
        if (tier == Tier.None) revert TierNone();
        TierConfig memory cfg = _tiers[role][tier];
        if (!cfg.active) revert TierInactive();
        if (cfg.priceUSDC == 0) revert PriceZero();

        Membership storage m = _memberships[actor][role];
        if (m.tier != Tier.None && m.expiresAt > block.timestamp) revert AlreadyActive();

        _collectPayment(actor, cfg.priceUSDC, viaAuth, priceAuth, paymentNonce);

        m.tier = tier;
        m.expiresAt = uint64(block.timestamp) + uint64(cfg.durationDays) * 1 days;
        m.monthCount = 0;
        m.monthAnchor = uint64(block.timestamp);
        // activeCount preserved: in-flight wagers from a prior tier still count

        emit MembershipPurchased(actor, role, tier, cfg.priceUSDC, m.expiresAt);
    }

    function upgradeTier(bytes32 role, Tier newTier) external {
        _upgradeTier(msg.sender, role, newTier, false, _emptyAuth(), bytes32(0));
    }

    /// @notice Like {upgradeTier} but records the accepted T&C version hash on-chain
    ///         (Spec 007, FR-039). Existing upgradeTier ABI is preserved.
    function upgradeTierWithTerms(bytes32 role, Tier newTier, bytes32 acceptedTermsHash) external {
        _upgradeTier(msg.sender, role, newTier, false, _emptyAuth(), bytes32(0));
        _recordTerms(msg.sender, role, acceptedTermsHash);
    }

    /// @dev Shared upgrade body; `actor` semantics as in {_purchaseTier}. The relayed price binding
    ///      is the on-chain computed `delta` — the signer's authorization must match it exactly.
    function _upgradeTier(address actor, bytes32 role, Tier newTier, bool viaAuth, ERC3009Auth memory priceAuth, bytes32 paymentNonce) internal {
        _screen(actor); // Sanctions screen (Spec 007, FR-054) — before any fee transfer
        Membership storage m = _memberships[actor][role];
        if (m.tier == Tier.None || m.expiresAt <= block.timestamp) revert NoActiveMembership();
        TierConfig memory current = _tiers[role][m.tier];
        TierConfig memory upgraded = _tiers[role][newTier];
        if (!upgraded.active) revert TierInactive();
        if (upgraded.priceUSDC <= current.priceUSDC) revert NotUpgrade();

        uint128 delta = upgraded.priceUSDC - current.priceUSDC;
        _collectPayment(actor, delta, viaAuth, priceAuth, paymentNonce);

        Tier fromTier = m.tier;
        m.tier = newTier;
        emit MembershipUpgraded(actor, role, fromTier, newTier, delta);
    }

    function extendMembership(bytes32 role) external {
        _extendMembership(msg.sender, role, false, _emptyAuth(), bytes32(0));
    }

    /// @dev Shared extension body; `actor` semantics as in {_purchaseTier}.
    function _extendMembership(address actor, bytes32 role, bool viaAuth, ERC3009Auth memory priceAuth, bytes32 paymentNonce) internal {
        _screen(actor); // Sanctions screen (Spec 007, FR-054) — paid path, same risk class
        Membership storage m = _memberships[actor][role];
        if (m.tier == Tier.None) revert NoActiveMembership();
        TierConfig memory cfg = _tiers[role][m.tier];
        if (!cfg.active) revert TierInactive();
        if (cfg.priceUSDC == 0) revert PriceZero();

        _collectPayment(actor, cfg.priceUSDC, viaAuth, priceAuth, paymentNonce);

        uint64 nowTs = uint64(block.timestamp);
        uint64 base = m.expiresAt > nowTs ? m.expiresAt : nowTs;
        m.expiresAt = base + uint64(cfg.durationDays) * 1 days;

        emit MembershipExtended(actor, role, cfg.durationDays, cfg.priceUSDC, m.expiresAt);
    }

    /// @notice Redeem a voucher (spec 026): burns the voucher and writes a soulbound membership of the
    ///         voucher's `(role, tier)` to the redeemer (msg.sender). Sanctions-screens the redeemer
    ///         fail-closed and records their accepted T&C. No funds move here — USDC was paid at mint.
    /// @dev    Checks → effects (membership write, Terms) → interaction (burn LAST) — strict CEI, so a blocked
    ///         or failed redemption leaves the voucher intact and re-tradable (FR-015). No new fund flow, so no
    ///         reentrancy guard is needed; the only external call is the trusted voucher burn, performed last.
    function redeemVoucher(uint256 voucherId, bytes32 acceptedTermsHash) external {
        _redeemVoucher(msg.sender, voucherId, acceptedTermsHash);
    }

    /// @dev Shared redemption body. `actor` is the acting identity — msg.sender when self-submitted,
    ///      the recovered intent signer when relayed (spec 035). Ownership, activity, and sanctions
    ///      checks all evaluate `actor`; the membership is written to `actor`.
    function _redeemVoucher(address actor, uint256 voucherId, bytes32 acceptedTermsHash) internal {
        address v = voucher;
        if (v == address(0)) revert VoucherNotSet();
        if (IMembershipVoucher(v).ownerOf(voucherId) != actor) revert NotVoucherOwner();

        IMembershipVoucher.VoucherInfo memory info = IMembershipVoucher(v).voucherInfo(voucherId);

        Membership storage m = _memberships[actor][info.role];
        if (m.tier != Tier.None && m.expiresAt > block.timestamp) revert AlreadyActive(); // FR-011

        _screen(actor); // Sanctions screen (Spec 007 FR-054 / spec 026 FR-012) — fail-closed, before effects

        // Effects: grant the snapshotted (role, tier); clock starts now; counters reset (like a fresh purchase).
        m.tier = info.tier;
        m.expiresAt = uint64(block.timestamp) + uint64(info.durationDays) * 1 days;
        m.monthCount = 0;
        m.monthAnchor = uint64(block.timestamp);
        _recordTerms(actor, info.role, acceptedTermsHash); // FR-013

        // Interaction (last): single-use burn. Reverts roll back all effects atomically.
        IMembershipVoucher(v).burn(voucherId);

        emit MembershipRedeemed(actor, info.role, info.tier, voucherId, m.expiresAt);
    }

    // ---------- Signer-attributed twins (spec 035 — gasless intents) ----------
    // Each is a twin of an existing function: identical effects and checks, but authorized and
    // attributed to the recovered intent `signer` instead of msg.sender. The existing functions
    // remain as the self-submit fallback (FR-014). Money-in twins pull the price from the signer
    // via their stapled EIP-3009 authorization, atomically with the action (FR-007), then settle
    // the optional bounded fee leg (FR-015/FR-016).

    /// @notice Relayed {purchaseTierWithTerms}: one signature purchases the tier and pays from the
    ///         signer's EIP-3009 authorization. `signer` becomes the on-chain member.
    function purchaseTierWithAuthorization(
        bytes32 role,
        uint8 tier,
        bytes32 termsHash,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata priceAuth,
        ERC3009Auth calldata feeAuth
    ) external {
        _verifyIntent(
            keccak256(abi.encode(PURCHASE_TIER_INTENT_TYPEHASH, role, tier, termsHash, signer, priceAuth.nonce, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, intentSig
        );
        _purchaseTier(signer, role, Tier(tier), true, priceAuth, priceAuth.nonce);
        _recordTerms(signer, role, termsHash);
        _settleGasFee(address(paymentToken), signer, feeAuth, feeNettingEnabled, gasFeeRecipient, maxGasFee);
    }

    /// @notice Relayed {upgradeTierWithTerms}. The signer's authorization must equal the on-chain
    ///         upgrade delta exactly (asserted before any funds move).
    function upgradeTierWithAuthorization(
        bytes32 role,
        uint8 tier,
        bytes32 termsHash,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata priceAuth,
        ERC3009Auth calldata feeAuth
    ) external {
        _verifyIntent(
            keccak256(abi.encode(UPGRADE_TIER_INTENT_TYPEHASH, role, tier, termsHash, signer, priceAuth.nonce, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, intentSig
        );
        _upgradeTier(signer, role, Tier(tier), true, priceAuth, priceAuth.nonce);
        _recordTerms(signer, role, termsHash);
        _settleGasFee(address(paymentToken), signer, feeAuth, feeNettingEnabled, gasFeeRecipient, maxGasFee);
    }

    /// @notice Relayed {extendMembership}.
    function extendMembershipWithAuthorization(
        bytes32 role,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata intentSig,
        ERC3009Auth calldata priceAuth,
        ERC3009Auth calldata feeAuth
    ) external {
        _verifyIntent(
            keccak256(abi.encode(EXTEND_MEMBERSHIP_INTENT_TYPEHASH, role, signer, priceAuth.nonce, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, intentSig
        );
        _extendMembership(signer, role, true, priceAuth, priceAuth.nonce);
        _settleGasFee(address(paymentToken), signer, feeAuth, feeNettingEnabled, gasFeeRecipient, maxGasFee);
    }

    /// @notice Relayed {redeemVoucher}: no money leg — USDC was paid at voucher mint (spec 026).
    function redeemVoucherWithSig(
        uint256 voucherId,
        bytes32 termsHash,
        address signer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore,
        bytes calldata sig
    ) external {
        _verifyIntent(
            keccak256(abi.encode(REDEEM_VOUCHER_INTENT_TYPEHASH, voucherId, termsHash, signer, nonce, validAfter, validBefore)),
            signer, nonce, validAfter, validBefore, sig
        );
        _redeemVoucher(signer, voucherId, termsHash);
    }

    // ---------- Hooks (authorized callers) ----------

    function checkCanCreate(address user, bytes32 role) external view returns (bool) {
        Membership memory m = _memberships[user][role];
        if (m.tier == Tier.None || m.expiresAt <= block.timestamp) return false;
        TierConfig memory cfg = _tiers[role][m.tier];

        uint32 monthCount = (block.timestamp >= uint256(m.monthAnchor) + ROLLING_WINDOW) ? 0 : m.monthCount;
        if (cfg.limits.monthlyMarketCreation > 0 && monthCount >= cfg.limits.monthlyMarketCreation) return false;
        if (cfg.limits.maxConcurrentMarkets > 0 && m.activeCount >= cfg.limits.maxConcurrentMarkets) return false;
        return true;
    }

    function recordCreate(address user, bytes32 role) external onlyAuthorized {
        Membership storage m = _memberships[user][role];
        if (m.tier == Tier.None || m.expiresAt <= block.timestamp) revert NoActiveMembership();
        TierConfig memory cfg = _tiers[role][m.tier];

        if (block.timestamp >= uint256(m.monthAnchor) + ROLLING_WINDOW) {
            m.monthAnchor = uint64(block.timestamp);
            m.monthCount = 0;
        }
        if (cfg.limits.monthlyMarketCreation > 0 && m.monthCount >= cfg.limits.monthlyMarketCreation) revert MonthlyLimitReached();
        if (cfg.limits.maxConcurrentMarkets > 0 && m.activeCount >= cfg.limits.maxConcurrentMarkets) revert ConcurrentLimitReached();

        m.monthCount += 1;
        m.activeCount += 1;
        emit WagerCreated(user, role);
    }

    function recordClose(address user, bytes32 role) external onlyAuthorized {
        Membership storage m = _memberships[user][role];
        if (m.activeCount > 0) {
            m.activeCount -= 1;
        }
        emit WagerClosed(user, role);
    }

    // ---------- Views ----------

    function hasActiveRole(address user, bytes32 role) external view returns (bool) {
        Membership memory m = _memberships[user][role];
        return m.tier != Tier.None && m.expiresAt > block.timestamp;
    }

    function getActiveTier(address user, bytes32 role) external view returns (Tier) {
        Membership memory m = _memberships[user][role];
        if (m.expiresAt <= block.timestamp) return Tier.None;
        return m.tier;
    }

    function getMembership(address user, bytes32 role) external view returns (Membership memory) {
        return _memberships[user][role];
    }

    function getTierConfig(bytes32 role, Tier tier) external view returns (TierConfig memory) {
        return _tiers[role][tier];
    }
}
