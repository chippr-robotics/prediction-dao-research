// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev ERC-7598 bytes-signature variant of EIP-3009 receiveWithAuthorization
///      (USDC v2.2 accepts contract-wallet signatures only through this overload).
interface IERC3009Bytes {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

/// @dev Test-only payee: EIP-3009 requires msg.sender == to, so the fork test
///      (spec 041 T015) pulls a smart-account-signed authorization through this
///      contract. mocks/ is test-only, never deployed to production paths.
contract MockAuthReceiver {
    function pull(
        address token,
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        IERC3009Bytes(token).receiveWithAuthorization(
            from, address(this), value, validAfter, validBefore, nonce, signature
        );
    }
}
