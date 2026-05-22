// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsClient.sol";

/// @notice Minimal Functions Router mock — only the entry points used by FunctionsClient.
contract MockFunctionsRouter {
    uint256 private _nonce;

    struct LastRequest {
        address client;
        uint64 subscriptionId;
        bytes data;
        uint16 dataVersion;
        uint32 callbackGasLimit;
        bytes32 donId;
    }

    LastRequest public lastRequest;
    mapping(bytes32 => address) public requestClient;

    event RequestSent(bytes32 indexed requestId, address indexed client);

    /// @notice Mirrors `IFunctionsRouter.sendRequest`. Called by `FunctionsClient._sendRequest`.
    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 requestId) {
        _nonce += 1;
        requestId = keccak256(abi.encode(msg.sender, _nonce, block.timestamp));
        lastRequest = LastRequest(msg.sender, subscriptionId, data, dataVersion, callbackGasLimit, donId);
        requestClient[requestId] = msg.sender;
        emit RequestSent(requestId, msg.sender);
    }

    /// @notice Test helper — invokes the client's fulfillment callback as the router would.
    function fulfill(bytes32 requestId, bytes calldata response, bytes calldata err) external {
        address client = requestClient[requestId];
        require(client != address(0), "unknown requestId");
        IFunctionsClient(client).handleOracleFulfillment(requestId, response, err);
    }
}
