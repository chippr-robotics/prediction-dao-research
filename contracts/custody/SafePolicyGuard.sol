// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafeGuard, IERC165Like} from "./ISafeGuard.sol";

/// @title SafePolicyGuard
/// @notice Singleton Safe v1.4.1 transaction guard enforcing per-vault fund policies (spec 049,
///         issue #852): per-transaction spending limits, 24-hour-window spending limits, a
///         recipient allowlist, and a cooldown between outgoing transactions. Rules run AFTER a
///         Safe transaction has collected its owner-approval threshold and BEFORE it executes, so
///         an approved-but-violating transaction reverts and never moves funds.
/// @dev Trust model (see specs/049-multisig-policy-engine/contracts/SafePolicyGuard.md):
///      - Restriction-only: the guard can block a Safe transaction but can never initiate,
///        approve, or execute one, and holds no funds (non-payable everywhere).
///      - Authority is the vault itself: every mutator requires `msg.sender` to be the Safe whose
///        policy is touched, so a policy change is only reachable as a threshold-approved Safe
///        self-transaction. No owner, no admin role, and deliberately NOT upgradeable — an
///        upgrade key would be a backdoor over every vault's enforcement (plan.md Complexity
///        Tracking).
///      - Lockout-proof: transactions targeting the Safe itself (owner/threshold/guard
///        management) or this guard (policy configuration) bypass all fund rules, so a threshold
///        of owners can always loosen a too-strict policy (FR-008/SC-003).
///      - CEI: evaluation is read-only (`_checkPolicy`), then state commits (`_commitAccounting`)
///        — the guard makes no external calls at all, so no reentrancy surface exists.
///      - Accounting is conservative: window/cooldown state committed in `checkTransaction`
///        persists even if the Safe's inner call later fails without reverting the outer
///        transaction; overcounting can only restrict, never permit (research.md R3).
///      Accepted, documented limits: the 24 h window is fixed-reset (≤ 2× limit across a
///      straddling span, disclosed in the UI); calldata the guard cannot value (anything other
///      than native value and ERC-20 transfer/transferFrom/approve) passes spending limits
///      unvalued but still faces the allowlist (call target) and cooldown-exempt rules.
contract SafePolicyGuard is ISafeGuard {
    // ---------------------------------------------------------------- constants

    /// @notice Duration of one spending-accounting window.
    uint256 public constant WINDOW = 24 hours;
    /// @notice Upper bound on the configurable cooldown (extreme-value guard, FR-015).
    uint32 public constant MAX_COOLDOWN = 365 days;
    /// @notice Max assets with configured limits per vault (bounds enumeration gas).
    uint256 public constant MAX_ASSETS = 16;
    /// @notice Max allowlist additions+removals per configuration call.
    uint256 public constant MAX_ALLOWLIST_BATCH = 64;

    /// @dev ERC-165 id of the Safe guard interface, checked by Safe.setGuard ("GS300").
    bytes4 private constant _GUARD_INTERFACE_ID = type(ISafeGuard).interfaceId;
    bytes4 private constant _ERC165_INTERFACE_ID = 0x01ffc9a7;

    /// @dev ERC-20 selectors the guard values: transfer(address,uint256),
    ///      transferFrom(address,address,uint256), approve(address,uint256). Approvals are
    ///      spending grants — counting them closes the approve-then-pull bypass.
    bytes4 private constant _SEL_TRANSFER = 0xa9059cbb;
    bytes4 private constant _SEL_TRANSFER_FROM = 0x23b872dd;
    bytes4 private constant _SEL_APPROVE = 0x095ea7b3;

    // ---------------------------------------------------------------- storage

    struct AssetRule {
        uint128 perTxLimit; // 0 = rule off
        uint128 windowLimit; // 0 = rule off
        uint128 spentInWindow; // live state
        uint64 windowStart; // live state; window resets when now >= windowStart + WINDOW
    }

    struct RuleConfig {
        address asset; // address(0) = native coin
        uint128 perTxLimit;
        uint128 windowLimit;
    }

    struct PolicyMeta {
        bool allowlistEnabled;
        uint32 cooldown; // seconds; 0 = rule off
        uint64 lastCountedTxAt; // live state
        uint32 allowlistCount;
    }

    mapping(address safe => PolicyMeta) private _policies;
    mapping(address safe => mapping(address asset => AssetRule)) private _assetRules;
    mapping(address safe => address[]) private _configuredAssets;
    mapping(address safe => mapping(address entry => bool)) private _allowlisted;
    mapping(address safe => address[]) private _allowlistEntries;
    /// @dev 1-based index into `_allowlistEntries` for O(1) swap-and-pop removal.
    mapping(address safe => mapping(address entry => uint256)) private _allowlistIndex;

    // ---------------------------------------------------------------- events

    event RulesConfigured(address indexed safe, address indexed asset, uint128 perTxLimit, uint128 windowLimit);
    event CooldownSet(address indexed safe, uint32 cooldown);
    event AllowlistEnabled(address indexed safe, bool enabled);
    event AllowlistChanged(address indexed safe, address indexed entry, bool allowed);

    // ---------------------------------------------------------------- errors

    error DelegatecallBlocked();
    error GasRefundBlocked();
    error RecipientNotAllowed(address recipient);
    error CooldownActive(uint64 nextAllowedAt);
    error PerTxLimitExceeded(address asset, uint256 amount, uint256 limit);
    error WindowLimitExceeded(address asset, uint256 attempted, uint256 remaining);
    error ValueToGuardBlocked();
    error EmptyAllowlist();
    error CooldownTooLong();
    error TooManyAssets();
    error AllowlistBatchTooLarge();

    // ================================================================ guard hooks

    /// @notice Called by the Safe (as `msg.sender`) before executing an approved transaction.
    ///         Reverts with a typed error when any active rule is violated; on success commits
    ///         window/cooldown accounting.
    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256, /* safeTxGas */
        uint256, /* baseGas */
        uint256 gasPrice,
        address, /* gasToken */
        address payable, /* refundReceiver */
        bytes calldata, /* signatures */
        address /* msgSender */
    ) external override {
        address safe = msg.sender;
        (bytes memory err, bool counted) = _checkPolicy(safe, to, value, data, operation, gasPrice);
        if (err.length > 0) {
            assembly ("memory-safe") {
                revert(add(err, 32), mload(err))
            }
        }
        if (counted) _commitAccounting(safe, to, value, data);
    }

    /// @notice Post-execution hook — intentionally a no-op (accounting commits pre-execution;
    ///         conservative on inner-call failure, research.md R3).
    function checkAfterExecution(bytes32, bool) external override {}

    /// @notice ERC-165: Safe v1.4.1 `setGuard` requires the guard interface id ("GS300").
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _GUARD_INTERFACE_ID || interfaceId == _ERC165_INTERFACE_ID;
    }

    // ================================================================ configuration
    // Only callable by the Safe itself: reached either as a threshold-approved Safe
    // self-transaction (spec 043 proposal queue) or from PolicyGuardSetup during Safe.setup
    // (delegatecall context makes msg.sender the new Safe). There is no other authority.

    /// @notice Set a vault's full policy: per-asset limits, cooldown, and allowlist changes.
    ///         `msg.sender` is the vault being configured.
    /// @param limits          Per-asset limit updates; both fields 0 clears the asset's limits.
    /// @param cooldown        Minimum seconds between counted transactions (0 = off, ≤ 365 days).
    /// @param allowlistEnabled Whether the recipient allowlist rule is active after this call.
    /// @param allowlistAdd    Entries to add (idempotent).
    /// @param allowlistRemove Entries to remove (idempotent; processed before additions).
    function configureRules(
        RuleConfig[] calldata limits,
        uint32 cooldown,
        bool allowlistEnabled,
        address[] calldata allowlistAdd,
        address[] calldata allowlistRemove
    ) external {
        address safe = msg.sender;
        if (cooldown > MAX_COOLDOWN) revert CooldownTooLong();
        if (allowlistAdd.length + allowlistRemove.length > MAX_ALLOWLIST_BATCH) revert AllowlistBatchTooLarge();

        for (uint256 i = 0; i < limits.length; i++) {
            _setAssetRule(safe, limits[i]);
        }

        for (uint256 i = 0; i < allowlistRemove.length; i++) {
            _removeAllowlisted(safe, allowlistRemove[i]);
        }
        for (uint256 i = 0; i < allowlistAdd.length; i++) {
            _addAllowlisted(safe, allowlistAdd[i]);
        }

        PolicyMeta storage meta = _policies[safe];
        if (allowlistEnabled && meta.allowlistCount == 0) revert EmptyAllowlist();
        if (meta.allowlistEnabled != allowlistEnabled) {
            meta.allowlistEnabled = allowlistEnabled;
            emit AllowlistEnabled(safe, allowlistEnabled);
        }
        if (meta.cooldown != cooldown) {
            meta.cooldown = cooldown;
            emit CooldownSet(safe, cooldown);
        }
    }

    // ================================================================ views

    /// @notice Aggregate policy summary for one vault.
    function getPolicy(address safe)
        external
        view
        returns (
            bool hasRules,
            bool allowlistEnabled,
            uint32 allowlistCount,
            uint32 cooldown,
            uint64 lastCountedTxAt,
            address[] memory configuredAssets
        )
    {
        PolicyMeta storage meta = _policies[safe];
        configuredAssets = _configuredAssets[safe];
        allowlistEnabled = meta.allowlistEnabled;
        allowlistCount = meta.allowlistCount;
        cooldown = meta.cooldown;
        lastCountedTxAt = meta.lastCountedTxAt;
        hasRules = allowlistEnabled || cooldown > 0 || configuredAssets.length > 0;
    }

    /// @notice Raw limit config + live window state for one vault × asset. `spentInWindow` /
    ///         `windowStart` are raw storage; use `remainingInWindow` for elapsed-window-aware
    ///         remaining capacity.
    function getAssetRule(address safe, address asset)
        external
        view
        returns (uint128 perTxLimit, uint128 windowLimit, uint128 spentInWindow, uint64 windowStart)
    {
        AssetRule storage r = _assetRules[safe][asset];
        return (r.perTxLimit, r.windowLimit, r.spentInWindow, r.windowStart);
    }

    /// @notice Current allowlist entries (bounded by MAX_ALLOWLIST_BATCH per change call).
    function getAllowlist(address safe) external view returns (address[] memory) {
        return _allowlistEntries[safe];
    }

    function isAllowlisted(address safe, address who) external view returns (bool) {
        return _allowlisted[safe][who];
    }

    /// @notice Remaining window capacity for an asset; `type(uint256).max` when no window limit.
    function remainingInWindow(address safe, address asset) external view returns (uint256) {
        AssetRule storage r = _assetRules[safe][asset];
        if (r.windowLimit == 0) return type(uint256).max;
        if (block.timestamp >= uint256(r.windowStart) + WINDOW) return r.windowLimit;
        return uint256(r.windowLimit) - uint256(r.spentInWindow);
    }

    /// @notice Earliest timestamp the next counted transaction may execute (0 = no cooldown).
    function nextAllowedAt(address safe) external view returns (uint64) {
        PolicyMeta storage meta = _policies[safe];
        if (meta.cooldown == 0) return 0;
        return meta.lastCountedTxAt + meta.cooldown;
    }

    /// @notice Read-only twin of `checkTransaction` for pre-flight checks (FR-012): evaluates the
    ///         exact enforcement logic without state writes and returns the would-be revert data
    ///         (typed custom error, FR-011) so clients decode one canonical format.
    /// @dev `gasPrice` is evaluated as 0 — the app never builds gas-refund transactions, and the
    ///      guard rejects them at execution regardless.
    function previewTransaction(address safe, address to, uint256 value, bytes calldata data, uint8 operation)
        external
        view
        returns (bool ok, bytes memory revertData)
    {
        (revertData,) = _checkPolicy(safe, to, value, data, operation, 0);
        ok = revertData.length == 0;
    }

    // ================================================================ internal — evaluation

    /// @dev Full rule evaluation, read-only. Returns (encoded custom error or empty, whether the
    ///      transaction is "counted" and needs accounting committed). Shared verbatim by
    ///      enforcement and preview so the two can never drift.
    function _checkPolicy(address safe, address to, uint256 value, bytes calldata data, uint8 operation, uint256 gasPrice)
        internal
        view
        returns (bytes memory err, bool counted)
    {
        // Lockout-proof exemptions (FR-008): vault self-management and policy configuration
        // bypass all fund rules; both still require the vault's own approval threshold.
        if (to == safe) return ("", false);
        if (to == address(this)) {
            if (value != 0) return (abi.encodeWithSelector(ValueToGuardBlocked.selector), false);
            return ("", false);
        }

        PolicyMeta storage meta = _policies[safe];
        bool hasLimits = _configuredAssets[safe].length > 0;
        if (!meta.allowlistEnabled && meta.cooldown == 0 && !hasLimits) return ("", false); // no policy

        // Hard denials while any rule is active: delegatecall executes foreign code in the
        // Safe's context (bypasses all accounting; can rewrite the guard slot), and gas refunds
        // pay refundReceiver from the vault as an uncounted outflow.
        if (operation != 0) return (abi.encodeWithSelector(DelegatecallBlocked.selector), false);
        if (gasPrice != 0) return (abi.encodeWithSelector(GasRefundBlocked.selector), false);

        (address tokenAsset, uint256 tokenAmount, address tokenRecipient, bool isTokenAction) = _classify(to, data);
        counted = value > 0 || isTokenAction;

        // Recipient allowlist (FR-002): token actions gate the decoded beneficiary; everything
        // else gates the call target — so unrecognized calldata cannot reach un-allowlisted
        // contracts. Native value riding a call additionally gates the target.
        if (meta.allowlistEnabled) {
            if (isTokenAction && !_allowlisted[safe][tokenRecipient]) {
                return (abi.encodeWithSelector(RecipientNotAllowed.selector, tokenRecipient), counted);
            }
            if ((!isTokenAction || value > 0) && !_allowlisted[safe][to]) {
                return (abi.encodeWithSelector(RecipientNotAllowed.selector, to), counted);
            }
        }

        // Cooldown between counted (fund-moving) transactions.
        if (counted && meta.cooldown > 0) {
            uint64 nextAt = meta.lastCountedTxAt + meta.cooldown;
            if (block.timestamp < nextAt) return (abi.encodeWithSelector(CooldownActive.selector, nextAt), counted);
        }

        // Spending limits, per counted asset. Unconfigured assets pass unvalued (disclosed).
        if (value > 0) {
            err = _checkLimits(safe, address(0), value);
            if (err.length > 0) return (err, counted);
        }
        if (isTokenAction) {
            err = _checkLimits(safe, tokenAsset, tokenAmount);
            if (err.length > 0) return (err, counted);
        }
        return ("", counted);
    }

    /// @dev Limit evaluation for one asset, elapsed-window aware, read-only.
    function _checkLimits(address safe, address asset, uint256 amount) internal view returns (bytes memory) {
        AssetRule storage r = _assetRules[safe][asset];
        uint128 perTx = r.perTxLimit;
        uint128 windowLimit = r.windowLimit;
        if (perTx == 0 && windowLimit == 0) return "";
        if (perTx > 0 && amount > perTx) {
            return abi.encodeWithSelector(PerTxLimitExceeded.selector, asset, amount, uint256(perTx));
        }
        if (windowLimit > 0) {
            uint256 spent = block.timestamp >= uint256(r.windowStart) + WINDOW ? 0 : r.spentInWindow;
            uint256 remaining = uint256(windowLimit) - spent;
            if (amount > remaining) {
                return abi.encodeWithSelector(WindowLimitExceeded.selector, asset, amount, remaining);
            }
        }
        return "";
    }

    /// @dev Post-check state commit (CEI: all checks passed first; no external calls).
    function _commitAccounting(address safe, address to, uint256 value, bytes calldata data) internal {
        PolicyMeta storage meta = _policies[safe];
        if (meta.cooldown > 0) meta.lastCountedTxAt = uint64(block.timestamp);
        if (value > 0) _commitSpend(safe, address(0), value);
        (address tokenAsset, uint256 tokenAmount,, bool isTokenAction) = _classify(to, data);
        if (isTokenAction) _commitSpend(safe, tokenAsset, tokenAmount);
    }

    /// @dev Accumulate a spend into the asset's window. The uint128 cast is safe: `_checkLimits`
    ///      proved `amount ≤ remaining ≤ windowLimit ≤ type(uint128).max` when a window limit is
    ///      set, and no accumulation happens otherwise.
    function _commitSpend(address safe, address asset, uint256 amount) internal {
        AssetRule storage r = _assetRules[safe][asset];
        if (r.windowLimit == 0) return;
        if (block.timestamp >= uint256(r.windowStart) + WINDOW) {
            r.windowStart = uint64(block.timestamp);
            r.spentInWindow = uint128(amount);
        } else {
            r.spentInWindow += uint128(amount);
        }
    }

    /// @dev Decode the ERC-20 actions the guard values. Anything else is a generic call.
    function _classify(address to, bytes calldata data)
        internal
        pure
        returns (address tokenAsset, uint256 tokenAmount, address tokenRecipient, bool isTokenAction)
    {
        if (data.length < 4) return (address(0), 0, address(0), false);
        bytes4 selector = bytes4(data[0:4]);
        if (selector == _SEL_TRANSFER && data.length >= 68) {
            (address recipient, uint256 amount) = abi.decode(data[4:], (address, uint256));
            return (to, amount, recipient, true);
        }
        if (selector == _SEL_APPROVE && data.length >= 68) {
            (address spender, uint256 amount) = abi.decode(data[4:], (address, uint256));
            return (to, amount, spender, true);
        }
        if (selector == _SEL_TRANSFER_FROM && data.length >= 100) {
            (, address recipient, uint256 amount) = abi.decode(data[4:], (address, address, uint256));
            return (to, amount, recipient, true);
        }
        return (address(0), 0, address(0), false);
    }

    // ================================================================ internal — config writes

    function _setAssetRule(address safe, RuleConfig calldata cfg) internal {
        AssetRule storage r = _assetRules[safe][cfg.asset];
        bool wasConfigured = r.perTxLimit > 0 || r.windowLimit > 0;
        bool nowConfigured = cfg.perTxLimit > 0 || cfg.windowLimit > 0;
        r.perTxLimit = cfg.perTxLimit;
        r.windowLimit = cfg.windowLimit;
        if (nowConfigured && !wasConfigured) {
            if (_configuredAssets[safe].length >= MAX_ASSETS) revert TooManyAssets();
            _configuredAssets[safe].push(cfg.asset);
        } else if (!nowConfigured && wasConfigured) {
            _removeConfiguredAsset(safe, cfg.asset);
            // Reset live state so a re-enabled rule starts a fresh window.
            r.spentInWindow = 0;
            r.windowStart = 0;
        }
        emit RulesConfigured(safe, cfg.asset, cfg.perTxLimit, cfg.windowLimit);
    }

    function _removeConfiguredAsset(address safe, address asset) internal {
        address[] storage assets = _configuredAssets[safe];
        uint256 len = assets.length;
        for (uint256 i = 0; i < len; i++) {
            if (assets[i] == asset) {
                assets[i] = assets[len - 1];
                assets.pop();
                return;
            }
        }
    }

    function _addAllowlisted(address safe, address entry) internal {
        if (_allowlisted[safe][entry]) return;
        _allowlisted[safe][entry] = true;
        _allowlistEntries[safe].push(entry);
        _allowlistIndex[safe][entry] = _allowlistEntries[safe].length; // 1-based
        _policies[safe].allowlistCount += 1;
        emit AllowlistChanged(safe, entry, true);
    }

    function _removeAllowlisted(address safe, address entry) internal {
        if (!_allowlisted[safe][entry]) return;
        _allowlisted[safe][entry] = false;
        address[] storage entries = _allowlistEntries[safe];
        uint256 idx = _allowlistIndex[safe][entry]; // 1-based, guaranteed > 0
        address last = entries[entries.length - 1];
        entries[idx - 1] = last;
        _allowlistIndex[safe][last] = idx;
        entries.pop();
        delete _allowlistIndex[safe][entry];
        _policies[safe].allowlistCount -= 1;
        emit AllowlistChanged(safe, entry, false);
    }
}
