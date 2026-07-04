// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A signed EIP-3009 authorization forwarded by a relayer alongside an intent (spec 035).
///         `to` is implicit — `receiveWithAuthorization` requires the payee to be the caller, so the
///         signed `to` MUST be the consuming contract or the token rejects the signature.
struct ERC3009Auth {
    uint256 value;
    uint256 validAfter;
    uint256 validBefore;
    bytes32 nonce;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

/// @title IERC3009
/// @notice Minimal EIP-3009 surface consumed by the gasless money-in entrypoints (spec 035).
///         Only `receiveWithAuthorization` is ever used to move funds (sender-bound, not
///         front-runnable); `transferWithAuthorization` is deliberately absent (FR-007).
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}
