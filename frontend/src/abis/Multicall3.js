/**
 * Multicall3 ABI for batching multiple contract calls into a single RPC request
 *
 * Contract address on ETC networks: 0x1E4282069e4822D5E6Fb88B2DbDE014f3E0625a9
 * (Also available via ETCSWAP_ADDRESSES.MULTICALL_V3)
 */
export const MULTICALL3_ABI = [
  // aggregate3 - primary batching function with per-call failure handling
  {
    "inputs": [
      {
        "components": [
          { "name": "target", "type": "address" },
          { "name": "allowFailure", "type": "bool" },
          { "name": "callData", "type": "bytes" }
        ],
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate3",
    "outputs": [
      {
        "components": [
          { "name": "success", "type": "bool" },
          { "name": "returnData", "type": "bytes" }
        ],
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  // aggregate - legacy function (all calls must succeed)
  {
    "inputs": [
      {
        "components": [
          { "name": "target", "type": "address" },
          { "name": "callData", "type": "bytes" }
        ],
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate",
    "outputs": [
      { "name": "blockNumber", "type": "uint256" },
      { "name": "returnData", "type": "bytes[]" }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  // tryAggregate - allows individual call failures
  {
    "inputs": [
      { "name": "requireSuccess", "type": "bool" },
      {
        "components": [
          { "name": "target", "type": "address" },
          { "name": "callData", "type": "bytes" }
        ],
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "tryAggregate",
    "outputs": [
      {
        "components": [
          { "name": "success", "type": "bool" },
          { "name": "returnData", "type": "bytes" }
        ],
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  // getBlockNumber - utility for getting current block
  {
    "inputs": [],
    "name": "getBlockNumber",
    "outputs": [{ "name": "blockNumber", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  // getCurrentBlockTimestamp - utility for getting current timestamp
  {
    "inputs": [],
    "name": "getCurrentBlockTimestamp",
    "outputs": [{ "name": "timestamp", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
]
