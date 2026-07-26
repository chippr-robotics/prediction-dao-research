// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafeGuard} from "../custody/ISafeGuard.sol";

/// @title MockSafe
/// @notice Test-only harness mimicking the Safe v1.4.1 guard calling convention (spec 049):
///         guard storage slot, `checkTransaction` → inner call → `checkAfterExecution` flow, and
///         a `setupDelegate` entry that reproduces `Safe.setup`'s delegatecall so
///         `PolicyGuardSetup` can be exercised under a real delegatecall context.
/// @dev NOT a Safe: no signatures, no threshold enforcement — unit tests drive the guard's rule
///      logic through it directly. Integration tests use the real Safe v1.4.1 (devDependency).
///      Spec 068 adds the approval surface `SafePolicyGuardV2` reads back (owners, `approvedHashes`,
///      `nonce`, `getTransactionHash`) so approver-set rules can be unit-tested without a real Safe;
///      the hash derivation is byte-identical to Safe v1.4.1's.
contract MockSafe {
    /// @dev keccak256("guard_manager.guard.address") — same slot as Safe v1.4.1.
    bytes32 private constant _GUARD_STORAGE_SLOT = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    /// @dev keccak256("EIP712Domain(uint256 chainId,address verifyingContract)") — Safe v1.4.1.
    bytes32 private constant _DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    /// @dev keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,
    ///      uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")
    bytes32 private constant _SAFE_TX_TYPEHASH = 0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

    /// @notice Transaction counter; like the real Safe it is incremented BEFORE the guard runs, so a
    ///         guard recomputing the in-flight hash must use `nonce() - 1`.
    uint256 public nonce;

    mapping(address owner => bool) private _owners;
    mapping(address owner => mapping(bytes32 hash => uint256)) public approvedHashes;

    error DelegateSetupFailed();

    receive() external payable {}

    // ------------------------------------------------------------ owners / approvals (test setup)

    function setOwners(address[] calldata owners_) external {
        for (uint256 i = 0; i < owners_.length; i++) {
            _owners[owners_[i]] = true;
        }
    }

    function removeOwner(address owner) external {
        _owners[owner] = false;
    }

    function isOwner(address owner) external view returns (bool) {
        return _owners[owner];
    }

    /// @notice Safe-shaped on-chain approval: the owner records consent for a transaction hash.
    function approveHash(bytes32 hashToApprove) external {
        approvedHashes[msg.sender][hashToApprove] = 1;
    }

    /// @notice Test helper: record an approval on behalf of `owner` without impersonation.
    function approveHashFor(address owner, bytes32 hashToApprove) external {
        approvedHashes[owner][hashToApprove] = 1;
    }

    // ------------------------------------------------------------ EIP-712 (Safe v1.4.1 parity)

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(_DOMAIN_SEPARATOR_TYPEHASH, block.chainid, address(this)));
    }

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
    ) public view returns (bytes32) {
        bytes32 safeTxHash = keccak256(
            abi.encode(
                _SAFE_TX_TYPEHASH,
                to,
                value,
                keccak256(data),
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                _nonce
            )
        );
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), safeTxHash));
    }

    function setGuard(address guard) external {
        assembly ("memory-safe") {
            sstore(_GUARD_STORAGE_SLOT, guard)
        }
    }

    function getGuard() public view returns (address guard) {
        assembly ("memory-safe") {
            guard := sload(_GUARD_STORAGE_SLOT)
        }
    }

    /// @notice Reproduce `Safe.setup`'s optional delegatecall (used to test PolicyGuardSetup).
    function setupDelegate(address to, bytes calldata data) external {
        (bool ok, bytes memory ret) = to.delegatecall(data);
        if (!ok) {
            if (ret.length > 0) {
                assembly ("memory-safe") {
                    revert(add(ret, 32), mload(ret))
                }
            }
            revert DelegateSetupFailed();
        }
    }

    /// @notice Safe-shaped execution: consult the guard (if set), run the inner call, then the
    ///         post-hook — mirroring execTransaction's ordering. Reverts bubble from the guard.
    function execTransactionMock(address to, uint256 value, bytes calldata data, uint8 operation, uint256 gasPrice)
        external
        returns (bool success)
    {
        address guard = getGuard();
        if (guard != address(0)) {
            ISafeGuard(guard).checkTransaction(
                to, value, data, operation, 0, 0, gasPrice, address(0), payable(address(0)), "", msg.sender
            );
        }
        // Mock executes CALL only; the guard rejects delegatecall for policy vaults before this.
        (success,) = to.call{value: value}(data);
        if (guard != address(0)) {
            ISafeGuard(guard).checkAfterExecution(bytes32(0), success);
        }
    }

    /// @notice Nonce-advancing execution used by spec-068 approver-set tests. Mirrors Safe v1.4.1's
    ///         ordering exactly: the transaction hash is derived at the CURRENT nonce, the nonce is
    ///         then incremented, and only afterwards does the guard run — which is why a guard that
    ///         recomputes the in-flight hash must read `nonce() - 1`. Gas-refund fields are zero,
    ///         matching what the custody client builds (`buildSafeTx`).
    function execTransactionApproved(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        returns (bool success)
    {
        nonce++;
        address guard = getGuard();
        if (guard != address(0)) {
            ISafeGuard(guard).checkTransaction(
                to, value, data, operation, 0, 0, 0, address(0), payable(address(0)), "", msg.sender
            );
        }
        (success,) = to.call{value: value}(data);
        if (guard != address(0)) {
            ISafeGuard(guard).checkAfterExecution(bytes32(0), success);
        }
    }

    /// @notice Hash a transaction as `execTransactionApproved` will, so tests can pre-approve it.
    function pendingTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation)
        external
        view
        returns (bytes32)
    {
        return getTransactionHash(to, value, data, operation, 0, 0, 0, address(0), address(0), nonce);
    }
}
