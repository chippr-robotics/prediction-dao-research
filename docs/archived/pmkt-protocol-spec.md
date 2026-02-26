# PMKT/1 Protocol Specification

## Overview

The PMKT/1 protocol is a DevP2P wire protocol for decentralized prediction market order exchange. It enables permissionless, peer-to-peer trading of conditional tokens using off-chain order books with on-chain settlement.

## Design Philosophy

PMKT/1 follows the Polymarket model of intent-based markets with cryptographically signed orders:

- **Signed messages as proof of intent** (not just API calls)
- **Role-based architecture** (separation of concerns)
- **Asynchronous execution** (intent separate from settlement)
- **Cryptographic accountability** (non-repudiable audit trails)
- **Interoperability focus** (open standards beat proprietary)

## Advantages

### More Decentralized than AP2
- AP2 uses curated allow-lists (initially)
- PMKT/1 is fully permissionless (any node, any matcher)

### Faster than ISO 20022
- ISO 20022 settlement: T+1 to T+3 days (ACH), or real-time (RTGS)
- PMKT/1 settlement: 13 seconds (block time on ETC)

### More Censorship-Resistant
- AP2: HTTP servers (can be blocked)
- ISO 20022: SWIFT network (central control point)
- PMKT/1: DevP2P gossip (no single point of failure)

## Protocol Stack

```
┌─────────────────────────────────────┐
│  Application Layer (Trading Bots)  │
├─────────────────────────────────────┤
│  PMKT/1 Protocol Messages           │
├─────────────────────────────────────┤
│  DevP2P Transport (RLP + Crypto)    │
├─────────────────────────────────────┤
│  Ethereum Network Layer             │
└─────────────────────────────────────┘
```

## Message Types

The PMKT/1 capability defines 7 message types:

| Code | Name              | Description                                    |
|------|-------------------|------------------------------------------------|
| 0x00 | Status            | Initial handshake and protocol version         |
| 0x01 | NewOrders         | Broadcast new signed orders                    |
| 0x02 | GetOrders         | Request orders by market/conditions            |
| 0x03 | Orders            | Response with requested orders                 |
| 0x04 | CancelOrder       | Cancel an order by nonce                       |
| 0x05 | OrderFilled       | Notify network of filled order                 |
| 0x06 | GetOrderBook      | Request full order book for a market           |

## Message Encoding

All messages use RLP (Recursive Length Prefix) encoding as per DevP2P standard.

### Status (0x00)

Exchanged immediately after connection.

```
[
  protocolVersion: uint,        // PMKT/1 version (currently 1)
  networkId: uint,              // 61 for ETC, 63 for Mordor testnet
  genesisHash: bytes32,         // Genesis block hash for network
  supportedMarkets: [bytes32],  // List of supported market IDs
]
```

**Example (hex):**
```
f84a01823d3da0d4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3c0
```

### NewOrders (0x01)

Broadcast new orders to the network.

```
[
  orders: [[
    maker: address,
    makerAsset: address,
    takerAsset: address,
    makerAmount: uint256,
    takerAmount: uint256,
    nonce: uint256,
    expiration: uint256,
    salt: bytes32,
    isMakerERC1155: bool,
    isTakerERC1155: bool,
    makerTokenId: uint256,
    takerTokenId: uint256,
    signature: bytes
  ], ...]
]
```

**Example (hex, single order):**
```
f9012cf9012994...  // RLP list containing order tuple
```

### GetOrders (0x02)

Request orders matching specific criteria.

```
[
  marketId: bytes32,            // Market identifier (optional, 0x0 for all)
  makerAsset: address,          // Filter by maker asset (optional)
  takerAsset: address,          // Filter by taker asset (optional)
  minExpiration: uint256,       // Only orders expiring after this timestamp
  maxResults: uint,             // Maximum number of orders to return
]
```

### Orders (0x03)

Response to GetOrders request.

```
[
  requestId: uint256,           // ID from GetOrders message
  orders: [...]                 // Array of orders (same format as NewOrders)
]
```

### CancelOrder (0x04)

Cancel an order by nonce.

```
[
  maker: address,               // Order maker address
  nonce: uint256,               // Nonce to cancel
  signature: bytes              // Maker's signature over (maker, nonce)
]
```

**Example (hex):**
```
f8479470997970c51812dc3a010c7d01b50e0d17dc79c801b840...
```

### OrderFilled (0x05)

Notify network that an order was filled on-chain.

```
[
  orderHash: bytes32,           // Hash of the filled order
  taker: address,               // Address that filled the order
  txHash: bytes32,              // Transaction hash of fill
  filledAmount: uint256,        // Amount filled
  remainingAmount: uint256      // Amount remaining
]
```

### GetOrderBook (0x06)

Request full order book for a market.

```
[
  marketId: bytes32,            // Market identifier
  depth: uint                   // Number of price levels to return
]
```

## EIP-712 Signature Format

Orders are signed using EIP-712 typed data signatures for compatibility with wallets.

### Domain Separator

```solidity
{
  name: "PredictionMarketExchange",
  version: "1",
  chainId: 61,  // ETC mainnet
  verifyingContract: <exchange_address>
}
```

### Order Type

```solidity
struct Order {
  address maker;
  address makerAsset;
  address takerAsset;
  uint256 makerAmount;
  uint256 takerAmount;
  uint256 nonce;
  uint256 expiration;
  bytes32 salt;
  bool isMakerERC1155;
  bool isTakerERC1155;
  uint256 makerTokenId;
  uint256 takerTokenId;
}
```

### Signing Process

1. Construct order struct with all parameters
2. Hash using EIP-712 typed data hashing
3. Sign with maker's private key (ECDSA)
4. Broadcast signed order via NewOrders message

## Node Behavior

### Maker Nodes

1. Create and sign orders locally
2. Broadcast via NewOrders (0x01)
3. Listen for OrderFilled (0x05) notifications
4. Can cancel orders via CancelOrder (0x04)

### Taker Nodes / Matchers

1. Subscribe to NewOrders (0x01) messages
2. Maintain local order book
3. Identify profitable fills
4. Submit fills to on-chain exchange contract
5. Broadcast OrderFilled (0x05) on success

### Relay Nodes

1. Relay all message types
2. Validate message format and signatures
3. Apply DoS protection (rate limiting)
4. Do not need to interact with blockchain

## Propagation Rules

### Order Propagation

- Orders propagate to all connected peers
- Each node validates signatures before forwarding
- Duplicate orders (same hash) are not re-broadcast
- Expired orders are dropped
- Maximum 50 orders per NewOrders message

### Fill Notification

- OrderFilled messages are broadcast to all peers
- Nodes update local order books to reflect fills
- Transaction hash is verified against blockchain
- Invalid fills are not propagated

## DoS Protection

### Rate Limiting

- Maximum 100 orders per second per peer
- Maximum 10 cancel messages per second per peer
- Peers exceeding limits are temporarily throttled

### Order Validation

- All orders must have valid signatures
- Expiration must be > current time
- Amounts must be > 0
- Asset addresses must be valid contracts

### Message Size Limits

- NewOrders: Max 50 orders (~ 10 KB)
- GetOrders: Max 1000 results
- Orders response: Max 100 orders

## Security Considerations

### Front-Running Protection

- Orders are signed with salt for uniqueness
- Makers can cancel orders immediately via nonce
- No advantage to observing orders before submission

### Sybil Resistance

- Node reputation based on successful fills
- Bad actors identified by invalid signatures
- Peers can be blacklisted locally

### Privacy

- Orders reveal maker's address and asset preferences
- Consider using privacy-preserving protocols (e.g., Nightmarket)
- Mixers can be used before/after trading

## Testing Checklist

- [ ] Status message exchange on connection
- [ ] NewOrders propagation to all peers
- [ ] GetOrders filtering by market
- [ ] Order signature validation
- [ ] CancelOrder signature validation
- [ ] OrderFilled propagation
- [ ] Rate limiting enforcement
- [ ] Expired order rejection
- [ ] Duplicate order deduplication
- [ ] Invalid message format handling
- [ ] Network partition recovery
- [ ] Peer reconnection handling

## Implementation Notes

### Ethereum Classic Specifics

- Default gas price: 1-10 Gwei
- Block time: ~13 seconds
- Finality: ~1000 blocks (recommended)
- Network ID: 61 (mainnet), 63 (Mordor testnet)

### Integration with CTF 1155

- Market IDs correspond to CTF condition IDs
- Position IDs are used as ERC1155 token IDs
- Collateral token is specified in maker/taker assets

### Exchange Contract Integration

- Exchange contract at fixed address
- Orders filled via `fillOrder()` function
- Batch fills via `batchFillOrders()`
- Maker-to-maker via `matchOrders()`

## References

- [DevP2P Wire Protocol](https://github.com/ethereum/devp2p/blob/master/rlpx.md)
- [EIP-712: Typed Data Signing](https://eips.ethereum.org/EIPS/eip-712)
- [Gnosis Conditional Tokens](https://docs.gnosis.io/conditionaltokens/)
- [Polymarket CLOB Architecture](https://docs.polymarket.com)
- [RLP Encoding](https://ethereum.org/en/developers/docs/data-structures-and-encoding/rlp/)

## Version History

- **v1 (2024-12-29)**: Initial specification
  - 7 message types
  - EIP-712 order format
  - CTF 1155 integration
  - DoS protection measures
