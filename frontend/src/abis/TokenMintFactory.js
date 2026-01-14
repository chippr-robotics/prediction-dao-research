/**
 * TokenMintFactory ABI
 * Factory contract for creating ERC-20 and ERC-721 tokens
 */

export const TOKEN_MINT_FACTORY_ABI = [
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "tokenId", "type": "uint256" },
      { "indexed": true, "name": "tokenType", "type": "uint8" },
      { "indexed": true, "name": "tokenAddress", "type": "address" },
      { "indexed": false, "name": "owner", "type": "address" },
      { "indexed": false, "name": "name", "type": "string" },
      { "indexed": false, "name": "symbol", "type": "string" },
      { "indexed": false, "name": "metadataURI", "type": "string" }
    ],
    "name": "TokenCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "tokenId", "type": "uint256" },
      { "indexed": true, "name": "tokenAddress", "type": "address" }
    ],
    "name": "TokenListedOnETCSwap",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "tokenId", "type": "uint256" },
      { "indexed": false, "name": "newURI", "type": "string" }
    ],
    "name": "MetadataURIUpdated",
    "type": "event"
  },

  // Read Functions
  {
    "inputs": [],
    "name": "tokenCount",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "name": "tokens",
    "outputs": [
      { "name": "tokenId", "type": "uint256" },
      { "name": "tokenType", "type": "uint8" },
      { "name": "tokenAddress", "type": "address" },
      { "name": "owner", "type": "address" },
      { "name": "name", "type": "string" },
      { "name": "symbol", "type": "string" },
      { "name": "metadataURI", "type": "string" },
      { "name": "createdAt", "type": "uint256" },
      { "name": "listedOnETCSwap", "type": "bool" },
      { "name": "isBurnable", "type": "bool" },
      { "name": "isPausable", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "name": "getTokenInfo",
    "outputs": [
      {
        "components": [
          { "name": "tokenId", "type": "uint256" },
          { "name": "tokenType", "type": "uint8" },
          { "name": "tokenAddress", "type": "address" },
          { "name": "owner", "type": "address" },
          { "name": "name", "type": "string" },
          { "name": "symbol", "type": "string" },
          { "name": "metadataURI", "type": "string" },
          { "name": "createdAt", "type": "uint256" },
          { "name": "listedOnETCSwap", "type": "bool" },
          { "name": "isBurnable", "type": "bool" },
          { "name": "isPausable", "type": "bool" }
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "owner", "type": "address" }],
    "name": "getOwnerTokens",
    "outputs": [{ "name": "", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "tokenAddress", "type": "address" }],
    "name": "getTokenIdByAddress",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },

  // Write Functions
  {
    "inputs": [
      { "name": "name", "type": "string" },
      { "name": "symbol", "type": "string" },
      { "name": "initialSupply", "type": "uint256" },
      { "name": "metadataURI", "type": "string" },
      { "name": "isBurnable", "type": "bool" },
      { "name": "isPausable", "type": "bool" },
      { "name": "listOnETCSwap", "type": "bool" }
    ],
    "name": "createERC20",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "name", "type": "string" },
      { "name": "symbol", "type": "string" },
      { "name": "baseURI", "type": "string" },
      { "name": "isBurnable", "type": "bool" }
    ],
    "name": "createERC721",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "name": "tokenId", "type": "uint256" },
      { "name": "newURI", "type": "string" }
    ],
    "name": "updateMetadataURI",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "tokenId", "type": "uint256" }],
    "name": "listOnETCSwap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

// Token types enum
export const TokenType = {
  ERC20: 0,
  ERC721: 1
}

export default TOKEN_MINT_FACTORY_ABI
