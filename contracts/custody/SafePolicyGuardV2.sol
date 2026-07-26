// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafeGuard} from "./ISafeGuard.sol";

/// @dev The slice of Safe v1.4.1 this guard reads back to verify approver-set rules. Every member
///      is `view`; the guard never calls a state-changing function on the vault.
interface ISafeMinimal {
    function nonce() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
    function approvedHashes(address owner, bytes32 hash) external view returns (uint256);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
}

/// @title SafePolicyGuardV2
/// @notice Ordered, approver-aware policy engine for Safe v1.4.1 vaults (spec 068). Successor to
///         spec 049's `SafePolicyGuard`: policy is an ORDERED list of numbered rules evaluated
///         top-down, where each rule scopes by asset, amount band and destination set, and may name
///         a set of owner approvers that must have signed before the transaction may execute.
/// @dev Trust model (unchanged from v1, see specs/068-protect-multi-chain-policies/contracts/):
///      - Restriction-only: the guard can block a Safe transaction but can never initiate, approve
///        or execute one, and holds no funds (non-payable everywhere).
///      - Authority is the vault itself: `setRules` requires `msg.sender` to be the Safe whose
///        policy is touched, so a policy change is only reachable as a threshold-approved Safe
///        self-transaction. No owner, no admin role, and deliberately NOT upgradeable — an upgrade
///        key would be a backdoor over every vault's enforcement. Migration is vault-consented:
///        owners adopt a new guard version with `setGuard`, which is exactly how this contract
///        succeeds v1.
///      - Lockout-proof: transactions targeting the Safe itself (owner/threshold/guard management)
///        or this guard (policy configuration) bypass all fund rules, so a threshold of owners can
///        always loosen a too-strict policy (FR-021).
///      - CEI: evaluation is read-only (`_evaluate`), then state commits (`_commitAccounting`). The
///        only external calls are `view` reads into the calling Safe, so no reentrancy surface.
///      - Accounting is conservative: window/cooldown state committed in `checkTransaction` persists
///        even if the Safe's inner call later fails; overcounting can only restrict, never permit.
///
///      Matching is FIRST-MATCH-GOVERNS (FR-011): the lowest-indexed rule whose scope covers the
///      transaction decides its fate, and later rules are not consulted — with exactly one narrow
///      exception, the SAME-SCOPE ALTERNATIVE: when the governing rule's approver requirement is
///      unmet, evaluation continues to the next rule with strictly identical scope (asset, band and
///      targets). That is what lets adjacent rules read as "otherwise, allow if…" alternatives and
///      makes "A + B together, or C alone" expressible. Limit and destination failures NEVER fall
///      through. A transaction matching no rule cannot execute: once a vault has rules, silence is
///      denial, and owners who want a fallback add a final catch-all rule.
///
///      Accepted, documented limits: the 24 h window is fixed-reset (≤ 2× limit across a straddling
///      span, disclosed in the UI); calldata the guard cannot value (anything other than native
///      value and ERC-20 transfer/transferFrom/approve) is matched and gated on destination but
///      passes amount limits unvalued; for `ANY_ASSET` rules the per-transaction limit is applied to
///      each leg in that leg's own units and the window counter accumulates raw amounts across
///      assets, so window limits are only meaningful on asset-scoped rules (the composer says so).
contract SafePolicyGuardV2 is ISafeGuard {
    // ---------------------------------------------------------------- constants

    /// @notice Duration of one spending-accounting window.
    uint256 public constant WINDOW = 24 hours;
    /// @notice Upper bound on the configurable cooldown (extreme-value guard).
    uint32 public constant MAX_COOLDOWN = 365 days;
    /// @notice Max rules per vault (bounds `checkTransaction` gas).
    uint256 public constant MAX_RULES = 16;
    /// @notice Max named approvers per rule.
    uint256 public constant MAX_APPROVERS = 8;
    /// @notice Max destinations per rule.
    uint256 public constant MAX_TARGETS = 16;

    /// @notice Asset sentinel meaning "any asset, including transactions that move nothing".
    address public constant ANY_ASSET = address(1);

    /// @dev ERC-165 id of the Safe guard interface, checked by Safe.setGuard ("GS300").
    bytes4 private constant _GUARD_INTERFACE_ID = type(ISafeGuard).interfaceId;
    bytes4 private constant _ERC165_INTERFACE_ID = 0x01ffc9a7;

    /// @dev ERC-20 selectors the guard values. Approvals are spending grants — counting them closes
    ///      the approve-then-pull bypass.
    bytes4 private constant _SEL_TRANSFER = 0xa9059cbb;
    bytes4 private constant _SEL_TRANSFER_FROM = 0x23b872dd;
    bytes4 private constant _SEL_APPROVE = 0x095ea7b3;

    // ---------------------------------------------------------------- storage

    struct Rule {
        address asset; // ANY_ASSET | address(0) native | ERC-20 address
        uint128 perTxLimit; // 0 = uncapped under this rule
        uint128 windowLimit; // 0 = no 24 h cap under this rule
        uint8 approvalsRequired; // 0 iff approvers is empty; else 1..approvers.length
        bool banded; // true => perTxLimit is ALSO a match bound (amount banding)
        address[] approvers; // empty = the vault's base threshold alone suffices
        address[] targets; // empty = any destination
    }

    struct RuleAccounting {
        uint128 spentInWindow;
        uint64 windowStart;
    }

    struct VaultMeta {
        uint32 cooldown; // seconds; 0 = rule off
        uint64 lastCountedTxAt; // live state
        uint32 rulesVersion; // bumped on every setRules
        bool hasApproverRules; // cached: any rule names approvers (skips hash recomputation)
    }

    mapping(address safe => Rule[]) private _rules;
    mapping(address safe => mapping(uint256 ruleIndex => RuleAccounting)) private _accounting;
    mapping(address safe => VaultMeta) private _meta;

    // ---------------------------------------------------------------- events

    event RulesSet(address indexed safe, uint256 ruleCount, uint32 cooldown, uint32 rulesVersion);
    event RuleConfigured(
        address indexed safe,
        uint256 indexed index,
        address asset,
        uint128 perTxLimit,
        uint128 windowLimit,
        uint8 approvalsRequired,
        bool banded,
        address[] approvers,
        address[] targets
    );

    // ---------------------------------------------------------------- errors

    error DelegatecallBlocked();
    error GasRefundBlocked();
    error ValueToGuardBlocked();
    error NoRuleMatches();
    error CooldownActive(uint64 nextAllowedAt);
    error RuleApproversMissing(uint256 ruleIndex, uint256 have, uint256 need);
    error RulePerTxExceeded(uint256 ruleIndex, address asset, uint256 amount, uint256 limit);
    error RuleWindowExceeded(uint256 ruleIndex, address asset, uint256 attempted, uint256 remaining);
    error TooManyRules();
    error TooManyApprovers();
    error TooManyTargets();
    error CooldownTooLong();
    error BadApprovalsRequired();
    error BandedNeedsLimit();
    error DuplicateApprover();
    error DuplicateTarget();

    // ---------------------------------------------------------------- internal types

    /// @dev Everything `_evaluate` needs about the transaction under test, resolved once.
    struct TxContext {
        address safe;
        address to;
        uint256 value;
        address executor;
        bytes32 txHash; // 0 when approvals cannot be evaluated (preview without a hash)
        bool approversEvaluable;
        address tokenAsset;
        uint256 tokenAmount;
        address tokenRecipient;
        bool isTokenAction;
        bool counted;
    }

    // ================================================================ guard hooks

    /// @notice Called by the Safe (as `msg.sender`) before executing an approved transaction.
    ///         Reverts with a typed error naming the governing rule when policy denies the
    ///         transaction; on success commits window/cooldown accounting.
    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata, /* signatures */
        address msgSender
    ) external override {
        address safe = msg.sender;

        // Exemptions and hard denials are resolved before anything reads the Safe back, so a
        // policy-managed vault can always manage itself (FR-021) and a gas-refunding transaction
        // fails closed on its own error rather than on a hash mismatch.
        (bytes memory denial, bool exempt) = _preCheck(safe, to, value, operation, gasPrice);
        if (denial.length > 0) _raise(denial);
        if (exempt) return;

        TxContext memory ctx;
        ctx.safe = safe;
        ctx.to = to;
        ctx.value = value;
        ctx.executor = msgSender;
        (ctx.tokenAsset, ctx.tokenAmount, ctx.tokenRecipient, ctx.isTokenAction) = _classify(to, data);
        ctx.counted = value > 0 || ctx.isTokenAction;

        if (_meta[safe].hasApproverRules) {
            // Safe v1.4.1 increments `nonce` BEFORE invoking the guard, so the in-flight
            // transaction was hashed at `nonce - 1`. Gas-refund fields are passed through as
            // received: `gasPrice != 0` is already rejected above, and the remaining fields must
            // enter the hash exactly as the Safe hashed them.
            ctx.txHash = ISafeMinimal(safe).getTransactionHash(
                to,
                value,
                data,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                ISafeMinimal(safe).nonce() - 1
            );
            ctx.approversEvaluable = true;
        }

        (bytes memory err, uint256 governing) = _evaluate(ctx);
        if (err.length > 0) _raise(err);
        if (ctx.counted) _commitAccounting(ctx, governing);
    }

    /// @notice Post-execution hook — intentionally a no-op (accounting commits pre-execution;
    ///         conservative on inner-call failure).
    function checkAfterExecution(bytes32, bool) external override {}

    /// @notice ERC-165: Safe v1.4.1 `setGuard` requires the guard interface id ("GS300").
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _GUARD_INTERFACE_ID || interfaceId == _ERC165_INTERFACE_ID;
    }

    // ================================================================ configuration

    /// @notice Replace this vault's entire policy. Callable only by the vault itself, so every
    ///         change carries the vault's own approval threshold. Full replacement means adding,
    ///         editing, removing and REORDERING rules are all one proposal, and rule numbering is
    ///         simply array order.
    /// @dev Live window accounting is cleared: rule identity is positional, so a replaced rule set
    ///      restarts its 24 h windows (disclosed in the UI before the change is proposed).
    function setRules(Rule[] calldata rules, uint32 cooldown) external {
        if (rules.length > MAX_RULES) revert TooManyRules();
        if (cooldown > MAX_COOLDOWN) revert CooldownTooLong();

        address safe = msg.sender;
        uint256 previousCount = _rules[safe].length;
        for (uint256 i = 0; i < previousCount; i++) {
            delete _accounting[safe][i];
        }
        delete _rules[safe];

        bool anyApprovers;
        for (uint256 i = 0; i < rules.length; i++) {
            anyApprovers = _appendRule(safe, rules[i], i) || anyApprovers;
        }

        VaultMeta storage meta = _meta[safe];
        meta.cooldown = cooldown;
        meta.hasApproverRules = anyApprovers;
        meta.rulesVersion += 1;
        emit RulesSet(safe, rules.length, cooldown, meta.rulesVersion);
    }

    /// @dev Validate one rule and copy it into storage. Returns whether it names approvers.
    function _appendRule(address safe, Rule calldata cfg, uint256 index) internal returns (bool) {
        uint256 approverCount = cfg.approvers.length;
        uint256 targetCount = cfg.targets.length;
        if (approverCount > MAX_APPROVERS) revert TooManyApprovers();
        if (targetCount > MAX_TARGETS) revert TooManyTargets();
        if (cfg.banded && cfg.perTxLimit == 0) revert BandedNeedsLimit();

        // Normalize "all listed approvers" (0) to an explicit count so reads are unambiguous.
        uint8 required;
        if (approverCount == 0) {
            if (cfg.approvalsRequired != 0) revert BadApprovalsRequired();
        } else {
            required = cfg.approvalsRequired == 0 ? uint8(approverCount) : cfg.approvalsRequired;
            if (required > approverCount) revert BadApprovalsRequired();
        }

        Rule storage r = _rules[safe].push();
        r.asset = cfg.asset;
        r.perTxLimit = cfg.perTxLimit;
        r.windowLimit = cfg.windowLimit;
        r.approvalsRequired = required;
        r.banded = cfg.banded;

        for (uint256 i = 0; i < approverCount; i++) {
            address approver = cfg.approvers[i];
            for (uint256 j = 0; j < i; j++) {
                if (cfg.approvers[j] == approver) revert DuplicateApprover();
            }
            r.approvers.push(approver);
        }
        for (uint256 i = 0; i < targetCount; i++) {
            address target = cfg.targets[i];
            for (uint256 j = 0; j < i; j++) {
                if (cfg.targets[j] == target) revert DuplicateTarget();
            }
            r.targets.push(target);
        }

        emit RuleConfigured(
            safe, index, cfg.asset, cfg.perTxLimit, cfg.windowLimit, required, cfg.banded, cfg.approvers, cfg.targets
        );
        return approverCount > 0;
    }

    // ================================================================ views

    /// @notice This vault's ordered rules and its policy-wide cooldown.
    function getRules(address safe) external view returns (Rule[] memory rules, uint32 cooldown) {
        return (_rules[safe], _meta[safe].cooldown);
    }

    /// @notice Number of rules governing this vault (0 = no policy on this guard).
    function ruleCount(address safe) external view returns (uint256) {
        return _rules[safe].length;
    }

    /// @notice Policy-wide metadata: cooldown, last counted transaction, rule-set version.
    function getMeta(address safe)
        external
        view
        returns (uint32 cooldown, uint64 lastCountedTxAt, uint32 rulesVersion, bool hasApproverRules)
    {
        VaultMeta storage meta = _meta[safe];
        return (meta.cooldown, meta.lastCountedTxAt, meta.rulesVersion, meta.hasApproverRules);
    }

    /// @notice Live 24 h window accounting for one rule, elapsed-window aware.
    function getRuleAccounting(address safe, uint256 index)
        external
        view
        returns (uint128 spentInWindow, uint64 windowStart, uint256 remaining)
    {
        RuleAccounting storage acc = _accounting[safe][index];
        uint128 limit = index < _rules[safe].length ? _rules[safe][index].windowLimit : 0;
        uint256 spent = block.timestamp >= uint256(acc.windowStart) + WINDOW ? 0 : acc.spentInWindow;
        remaining = limit == 0 ? type(uint256).max : uint256(limit) - spent;
        return (acc.spentInWindow, acc.windowStart, remaining);
    }

    /// @notice Earliest timestamp at which a fund-moving transaction may run under the cooldown.
    function nextAllowedAt(address safe) external view returns (uint64) {
        VaultMeta storage meta = _meta[safe];
        if (meta.cooldown == 0) return 0;
        return meta.lastCountedTxAt + meta.cooldown;
    }

    /// @notice Which rule would govern this transaction by SCOPE alone (no approver evaluation).
    ///         Mirrors the client's match preview.
    function matchTransaction(address safe, address to, uint256 value, bytes calldata data)
        external
        view
        returns (bool matched, uint256 ruleIndex)
    {
        TxContext memory ctx;
        ctx.safe = safe;
        ctx.to = to;
        ctx.value = value;
        (ctx.tokenAsset, ctx.tokenAmount, ctx.tokenRecipient, ctx.isTokenAction) = _classify(to, data);
        ctx.counted = value > 0 || ctx.isTokenAction;

        Rule[] storage rules = _rules[safe];
        for (uint256 i = 0; i < rules.length; i++) {
            if (_scopeMatches(rules[i], ctx)) return (true, i);
        }
        return (false, 0);
    }

    /// @notice Read-only twin of enforcement, sharing `_evaluate` verbatim so the two cannot drift.
    /// @param approvedTxHash The hash owners have approved, when known. Pass `bytes32(0)` to skip
    ///        approver evaluation and preview scope/destination/limit outcomes only — which is what
    ///        a compose-time preview does, since the real hash depends on a future nonce.
    function previewTransaction(
        address safe,
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        address executor,
        bytes32 approvedTxHash
    ) external view returns (bool ok, bytes memory revertData) {
        (bytes memory denial, bool exempt) = _preCheck(safe, to, value, operation, 0);
        if (denial.length > 0) return (false, denial);
        if (exempt) return (true, "");

        TxContext memory ctx;
        ctx.safe = safe;
        ctx.to = to;
        ctx.value = value;
        ctx.executor = executor;
        ctx.txHash = approvedTxHash;
        ctx.approversEvaluable = approvedTxHash != bytes32(0);
        (ctx.tokenAsset, ctx.tokenAmount, ctx.tokenRecipient, ctx.isTokenAction) = _classify(to, data);
        ctx.counted = value > 0 || ctx.isTokenAction;

        (revertData,) = _evaluate(ctx);
        ok = revertData.length == 0;
    }

    // ================================================================ internal — evaluation

    /// @dev Exemptions and hard denials, shared by enforcement and preview.
    ///      Returns (encoded error or empty, whether the transaction bypasses rule evaluation).
    function _preCheck(address safe, address to, uint256 value, uint8 operation, uint256 gasPrice)
        internal
        view
        returns (bytes memory, bool)
    {
        // Lockout-proof exemptions (FR-021): vault self-management and policy configuration bypass
        // all fund rules; both still require the vault's own approval threshold.
        if (to == safe) return ("", true);
        if (to == address(this)) {
            if (value != 0) return (abi.encodeWithSelector(ValueToGuardBlocked.selector), false);
            return ("", true);
        }
        // No policy on this guard for this vault: behave exactly as an unguarded Safe.
        if (_rules[safe].length == 0) return ("", true);

        // Hard denials while a policy is active: delegatecall executes foreign code in the Safe's
        // context (bypasses all accounting; can rewrite the guard slot), and gas refunds pay
        // refundReceiver from the vault as an uncounted outflow.
        if (operation != 0) return (abi.encodeWithSelector(DelegatecallBlocked.selector), false);
        if (gasPrice != 0) return (abi.encodeWithSelector(GasRefundBlocked.selector), false);
        return ("", false);
    }

    /// @dev Ordered rule evaluation. Returns (encoded custom error or empty, governing rule index).
    function _evaluate(TxContext memory ctx) internal view returns (bytes memory, uint256) {
        Rule[] storage rules = _rules[ctx.safe];
        uint256 count = rules.length;

        bool sawMatch;
        bool pendingApproverFailure;
        uint256 failedIndex;
        uint256 failedHave;
        uint256 failedNeed;

        for (uint256 i = 0; i < count; i++) {
            Rule storage rule = rules[i];
            if (!_scopeMatches(rule, ctx)) continue;

            // Same-scope alternative (FR-011 carve-out): once a rule has failed its approver
            // requirement, only a later rule with STRICTLY IDENTICAL scope may take over. Any other
            // matching rule stops evaluation with the original failure — scope-differing rules
            // never rescue a transaction.
            if (pendingApproverFailure && !_scopeEquals(rules[failedIndex], rule)) break;
            sawMatch = true;

            (uint256 have, uint256 need) = _countApprovals(rule, ctx);
            if (have < need) {
                if (!pendingApproverFailure) {
                    pendingApproverFailure = true;
                    failedIndex = i;
                    failedHave = have;
                    failedNeed = need;
                }
                continue;
            }

            // Governing rule found. Cooldown is policy-wide and applies to fund movements only.
            if (ctx.counted) {
                VaultMeta storage meta = _meta[ctx.safe];
                if (meta.cooldown > 0) {
                    uint64 nextAt = meta.lastCountedTxAt + meta.cooldown;
                    if (block.timestamp < nextAt) {
                        return (abi.encodeWithSelector(CooldownActive.selector, nextAt), i);
                    }
                }
            }

            bytes memory limitErr = _checkLimits(rule, ctx, i);
            return (limitErr, i);
        }

        if (pendingApproverFailure) {
            return (
                abi.encodeWithSelector(RuleApproversMissing.selector, failedIndex, failedHave, failedNeed), failedIndex
            );
        }
        if (!sawMatch) return (abi.encodeWithSelector(NoRuleMatches.selector), 0);
        return ("", 0);
    }

    /// @dev Does this rule's scope (asset, amount band, destinations) cover the transaction?
    ///      Scope is deliberately approver-blind: who signed cannot change which rule applies.
    function _scopeMatches(Rule storage rule, TxContext memory ctx) internal view returns (bool) {
        address asset = rule.asset;

        // Asset scope. A transaction moving BOTH native value and a token matches only ANY_ASSET,
        // which keeps "which rule governs" a total function without per-leg rule splitting.
        if (asset != ANY_ASSET) {
            bool mixed = ctx.value > 0 && ctx.isTokenAction;
            if (mixed) return false;
            if (asset == address(0)) {
                if (!(ctx.value > 0 && !ctx.isTokenAction)) return false;
            } else {
                if (!(ctx.isTokenAction && ctx.tokenAsset == asset && ctx.value == 0)) return false;
            }
        }

        // Amount band: a banded rule only covers transactions within its per-transaction limit, so
        // ordered rules form bands ("A or B up to X" then "A and B up to Y").
        if (rule.banded) {
            uint256 bound = rule.perTxLimit;
            if (ctx.value > bound) return false;
            if (ctx.isTokenAction && ctx.tokenAmount > bound) return false;
        }

        // Destination set: empty admits any destination. Token actions gate the decoded beneficiary;
        // everything else gates the call target, so unrecognized calldata cannot reach an
        // un-listed contract. Native value riding a token call additionally gates the target.
        if (rule.targets.length > 0) {
            if (ctx.isTokenAction && !_listed(rule.targets, ctx.tokenRecipient)) return false;
            if ((!ctx.isTokenAction || ctx.value > 0) && !_listed(rule.targets, ctx.to)) return false;
        }
        return true;
    }

    /// @dev Two rules have identical scope when asset, band and destination set all agree.
    function _scopeEquals(Rule storage a, Rule storage b) internal view returns (bool) {
        if (a.asset != b.asset) return false;
        if (a.banded != b.banded) return false;
        if (a.banded && a.perTxLimit != b.perTxLimit) return false;
        uint256 len = a.targets.length;
        if (len != b.targets.length) return false;
        for (uint256 i = 0; i < len; i++) {
            if (a.targets[i] != b.targets[i]) return false;
        }
        return true;
    }

    /// @dev How many of the rule's named approvers have approved this exact transaction, and how
    ///      many are needed. An approver counts only while they are STILL AN OWNER (FR-010): a rule
    ///      naming a removed owner can never be satisfied until the policy is amended. The executor
    ///      counts as an approver, mirroring how Safe treats the caller's pre-validated signature.
    function _countApprovals(Rule storage rule, TxContext memory ctx)
        internal
        view
        returns (uint256 have, uint256 need)
    {
        need = rule.approvalsRequired;
        if (need == 0) return (0, 0);
        // Approver rules cannot be evaluated without the approved hash (compose-time preview).
        // Reporting the requirement as unmet keeps preview conservative — it never says "allowed"
        // where enforcement would deny.
        if (!ctx.approversEvaluable) return (0, need);

        ISafeMinimal safe = ISafeMinimal(ctx.safe);
        uint256 len = rule.approvers.length;
        for (uint256 i = 0; i < len; i++) {
            address approver = rule.approvers[i];
            if (!safe.isOwner(approver)) continue;
            if (approver == ctx.executor || safe.approvedHashes(approver, ctx.txHash) == 1) {
                have++;
            }
        }
    }

    /// @dev Amount limits for the governing rule, per moved leg, elapsed-window aware.
    function _checkLimits(Rule storage rule, TxContext memory ctx, uint256 index)
        internal
        view
        returns (bytes memory)
    {
        if (ctx.value > 0) {
            bytes memory err = _checkLeg(rule, index, address(0), ctx.value, ctx.safe);
            if (err.length > 0) return err;
        }
        if (ctx.isTokenAction) {
            bytes memory err = _checkLeg(rule, index, ctx.tokenAsset, ctx.tokenAmount, ctx.safe);
            if (err.length > 0) return err;
        }
        return "";
    }

    function _checkLeg(Rule storage rule, uint256 index, address asset, uint256 amount, address safe)
        internal
        view
        returns (bytes memory)
    {
        uint128 perTx = rule.perTxLimit;
        if (perTx > 0 && amount > perTx) {
            return abi.encodeWithSelector(RulePerTxExceeded.selector, index, asset, amount, uint256(perTx));
        }
        uint128 windowLimit = rule.windowLimit;
        if (windowLimit > 0) {
            RuleAccounting storage acc = _accounting[safe][index];
            uint256 spent = block.timestamp >= uint256(acc.windowStart) + WINDOW ? 0 : acc.spentInWindow;
            uint256 remaining = uint256(windowLimit) - spent;
            if (amount > remaining) {
                return abi.encodeWithSelector(RuleWindowExceeded.selector, index, asset, amount, remaining);
            }
        }
        return "";
    }

    /// @dev Post-check state commit (CEI: all checks passed first; no external calls).
    function _commitAccounting(TxContext memory ctx, uint256 index) internal {
        VaultMeta storage meta = _meta[ctx.safe];
        if (meta.cooldown > 0) meta.lastCountedTxAt = uint64(block.timestamp);
        if (_rules[ctx.safe][index].windowLimit == 0) return;
        if (ctx.value > 0) _commitSpend(ctx.safe, index, ctx.value);
        if (ctx.isTokenAction) _commitSpend(ctx.safe, index, ctx.tokenAmount);
    }

    /// @dev Accumulate a spend into the governing rule's window. The uint128 cast is safe:
    ///      `_checkLeg` proved `amount ≤ remaining ≤ windowLimit ≤ type(uint128).max` whenever a
    ///      window limit is set, and no accumulation happens otherwise.
    function _commitSpend(address safe, uint256 index, uint256 amount) internal {
        RuleAccounting storage acc = _accounting[safe][index];
        if (block.timestamp >= uint256(acc.windowStart) + WINDOW) {
            acc.windowStart = uint64(block.timestamp);
            acc.spentInWindow = uint128(amount);
        } else {
            acc.spentInWindow += uint128(amount);
        }
    }

    /// @dev Decode the ERC-20 actions the guard values. Anything else is a generic call. Slices the
    ///      exact canonical argument length, so padded calldata classifies exactly as the token
    ///      would execute it.
    function _classify(address to, bytes calldata data)
        internal
        pure
        returns (address tokenAsset, uint256 tokenAmount, address tokenRecipient, bool isTokenAction)
    {
        if (data.length < 4) return (address(0), 0, address(0), false);
        bytes4 selector = bytes4(data[0:4]);
        if (selector == _SEL_TRANSFER && data.length >= 68) {
            (address recipient, uint256 amount) = abi.decode(data[4:68], (address, uint256));
            return (to, amount, recipient, true);
        }
        if (selector == _SEL_APPROVE && data.length >= 68) {
            (address spender, uint256 amount) = abi.decode(data[4:68], (address, uint256));
            return (to, amount, spender, true);
        }
        if (selector == _SEL_TRANSFER_FROM && data.length >= 100) {
            (, address recipient, uint256 amount) = abi.decode(data[4:100], (address, address, uint256));
            return (to, amount, recipient, true);
        }
        return (address(0), 0, address(0), false);
    }

    function _listed(address[] storage list, address candidate) internal view returns (bool) {
        uint256 len = list.length;
        for (uint256 i = 0; i < len; i++) {
            if (list[i] == candidate) return true;
        }
        return false;
    }

    /// @dev Bubble a pre-encoded custom error so callers see typed reverts, not strings.
    function _raise(bytes memory err) private pure {
        assembly ("memory-safe") {
            revert(add(err, 32), mload(err))
        }
    }
}
