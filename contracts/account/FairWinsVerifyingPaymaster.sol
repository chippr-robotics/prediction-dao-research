// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {UserOperation} from "./lib/account-abstraction/interfaces/UserOperation.sol";
import {IPaymaster} from "./lib/account-abstraction/interfaces/IPaymaster.sol";
import {_packValidationData} from "./lib/account-abstraction/core/Helpers.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title FairWinsVerifyingPaymaster (spec 050)
 * @notice Minimal ERC-4337 **v0.6** verifying paymaster that sponsors passkey smart-account
 *         UserOperations for FairWins. It sponsors an op iff `paymasterAndData` carries a valid
 *         signature from `verifyingSigner` (a KMS key held by the relay-gateway) over the op + a
 *         validity window. FairWins funds the EntryPoint deposit — that deposit is the bounded loss
 *         cap. See specs/050-sponsored-paymaster/contracts/paymaster-contract.md.
 *
 * @dev Self-contained (does not vendor eth-infinitism `BasePaymaster`): reuses the already-vendored
 *      `UserOperation` + `_packValidationData` and OZ `ECDSA`/`Ownable`. Security posture:
 *      - Validation is **signature-only, zero-storage** — no external calls, no storage reads, no
 *        forbidden-storage access (ERC-7562 safe; portable to any bundler; no stake required for our
 *        own bundler).
 *      - Replay is prevented by the account's own EntryPoint nonce + the short validity window; the
 *        signature binds sender/nonce/initCode/callData/all gas fields/chainId/this/window, so an
 *        approval can't be replayed on another op, chain, or paymaster, nor after expiry.
 *      - Fund custody: only `owner` (floppy keystore) withdraws. A compromised `verifyingSigner`
 *        can spend the deposit on gas (griefing, bounded by the deposit + off-chain rate limits +
 *        killswitch) but CANNOT withdraw funds. Rotate via `setVerifyingSigner`.
 */
contract FairWinsVerifyingPaymaster is IPaymaster, Ownable {
    /// @notice Minimal v0.6 EntryPoint surface this paymaster needs (deposit + stake management).
    /// @dev Signatures match the canonical EntryPoint (IStakeManager). Intentionally minimal so we
    ///      don't vendor the whole IEntryPoint tree.
    IEntryPointStake public immutable entryPoint;

    /// @notice Address whose signatures authorize sponsorship (the relay-gateway KMS key).
    address public verifyingSigner;

    /// paymasterAndData layout: [paymaster (20)] [validUntil (6)] [validAfter (6)] [signature (65)]
    uint256 private constant VALID_UNTIL_OFFSET = 20;
    uint256 private constant VALID_AFTER_OFFSET = 26;
    uint256 private constant SIGNATURE_OFFSET = 32;

    event VerifyingSignerChanged(address indexed previousSigner, address indexed newSigner);

    error NotFromEntryPoint();
    error ZeroSigner();
    error InvalidPaymasterDataLength();

    constructor(IEntryPointStake _entryPoint, address _verifyingSigner, address _owner) Ownable(_owner) {
        if (_verifyingSigner == address(0)) revert ZeroSigner();
        entryPoint = _entryPoint;
        verifyingSigner = _verifyingSigner;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert NotFromEntryPoint();
        _;
    }

    // --- admin ---------------------------------------------------------------------------------

    /// @notice Rotate the sponsorship signer (owner/floppy only). In-flight approvals from the old
    ///         signer stay valid until their short TTL expires.
    function setVerifyingSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroSigner();
        emit VerifyingSignerChanged(verifyingSigner, newSigner);
        verifyingSigner = newSigner;
    }

    // --- validation ----------------------------------------------------------------------------

    /// @notice The digest the off-chain signer signs over. MUST stay byte-identical to the
    ///         relay-gateway's `build.js` (spec 050 T010). Excludes `signature` and
    ///         `paymasterAndData` so the sig commits to the op's effect + gas, not to itself.
    function getHash(UserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                block.chainid,
                address(this),
                validUntil,
                validAfter
            )
        );
    }

    /// @inheritdoc IPaymaster
    /// @dev Signature-only, zero-storage. Returns SIG_VALIDATION_FAILED (never reverts) on a bad
    ///      signature so the EntryPoint cleanly rejects without spending funds; reverts only on a
    ///      malformed `paymasterAndData` length.
    function validatePaymasterUserOp(UserOperation calldata userOp, bytes32, uint256)
        external
        view
        override
        onlyEntryPoint
        returns (bytes memory context, uint256 validationData)
    {
        (uint48 validUntil, uint48 validAfter, bytes calldata signature) =
            _parsePaymasterAndData(userOp.paymasterAndData);

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(getHash(userOp, validUntil, validAfter));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        bool sigFailed = err != ECDSA.RecoverError.NoError || recovered != verifyingSigner;

        // context "" => EntryPoint skips postOp (pure sponsoring, no settlement).
        return ("", _packValidationData(sigFailed, validUntil, validAfter));
    }

    /// @inheritdoc IPaymaster
    /// @dev No-op: pure sponsoring returns empty context, so the EntryPoint never calls this. Kept
    ///      for interface conformance; guarded to the EntryPoint.
    function postOp(PostOpMode, bytes calldata, uint256) external view override onlyEntryPoint {}

    function _parsePaymasterAndData(bytes calldata paymasterAndData)
        internal
        pure
        returns (uint48 validUntil, uint48 validAfter, bytes calldata signature)
    {
        if (paymasterAndData.length < SIGNATURE_OFFSET) revert InvalidPaymasterDataLength();
        validUntil = uint48(bytes6(paymasterAndData[VALID_UNTIL_OFFSET:VALID_AFTER_OFFSET]));
        validAfter = uint48(bytes6(paymasterAndData[VALID_AFTER_OFFSET:SIGNATURE_OFFSET]));
        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }

    // --- deposit & stake (the sponsorship pool) ------------------------------------------------

    /// @notice Fund the sponsorship deposit (the bounded loss cap). Anyone may top up.
    function deposit() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /// @notice Current sponsorship pool balance in the EntryPoint.
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /// @notice Withdraw sponsorship funds (owner/floppy only).
    function withdrawTo(address payable to, uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(to, amount);
    }

    /// @notice Optional stake (only needed if a public/reputation-enforcing bundler is added).
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    function withdrawStake(address payable to) external onlyOwner {
        entryPoint.withdrawStake(to);
    }

    /// @dev Accept plain top-ups routed to the deposit.
    receive() external payable {
        entryPoint.depositTo{value: msg.value}(address(this));
    }
}

/// @dev Minimal EntryPoint v0.6 deposit/stake surface (subset of IStakeManager).
interface IEntryPointStake {
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
    function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
}
