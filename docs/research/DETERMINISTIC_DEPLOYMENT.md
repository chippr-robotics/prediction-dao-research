# Deterministic Contract Deployment

This document explains how the ClearPath DAO contracts are deployed using deterministic addresses via the Safe Singleton Factory.

## Overview

All ClearPath DAO contracts are deployed using the [Safe Singleton Factory](https://github.com/safe-fndn/safe-singleton-factory) which ensures that:

- **Same addresses across networks**: Contracts will have identical addresses on any EVM-compatible chain
- **Reproducible builds**: Anyone can verify that deployed bytecode matches the source code
- **No key dependency**: Deployment doesn't depend on a specific private key
- **Enhanced security**: Deterministic deployments are easier to audit and verify

## Safe Singleton Factory

**Factory Address**: `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7`

This factory is pre-deployed on many EVM networks including:
- Ethereum Mainnet (Chain ID: 1)
- Ethereum Classic Mordor Testnet (Chain ID: 63)
- Polygon, Arbitrum, Optimism, and many others

The factory uses the CREATE2 opcode to deploy contracts at deterministic addresses based on:
1. The contract's deployment bytecode
2. A salt value (chosen by us)

## Salt Prefix

All ClearPath DAO contracts use the salt prefix: **`ClearPathDAO-v1.0-`**

Each contract adds its name to this prefix:
- `ClearPathDAO-v1.0-WelfareMetricRegistry`
- `ClearPathDAO-v1.0-ProposalRegistry`
- `ClearPathDAO-v1.0-ConditionalMarketFactory`
- etc.

## Deployment Script

The deterministic deployment is handled by `scripts/deploy-deterministic.js`:

```bash
npx hardhat run scripts/deploy-deterministic.js --network mordor
```

### How It Works

1. **Compute deterministic address**: For each contract, the script computes the address before deployment
2. **Check if deployed**: If a contract already exists at that address, skip deployment
3. **Deploy via factory**: If not deployed, use the Safe Singleton Factory to deploy
4. **Verify**: Confirm the contract was deployed at the expected address

### Key Features

- **Idempotent**: Can be run multiple times safely - already deployed contracts are skipped
- **Gas efficient**: Reuses existing deployments when possible
- **Transparent**: Shows predicted addresses before deployment
- **Verifiable**: Easy to verify that addresses match expectations

## Expected Contract Addresses

Because deployment is deterministic, we can predict the addresses:

> **Note**: Actual addresses depend on the final contract bytecode. These will be generated during the first deployment and documented here.

| Contract | Predicted Address | Status |
|----------|------------------|--------|
| WelfareMetricRegistry | TBD | Not yet deployed |
| ProposalRegistry | TBD | Not yet deployed |
| ConditionalMarketFactory | TBD | Not yet deployed |
| PrivacyCoordinator | TBD | Not yet deployed |
| OracleResolver | TBD | Not yet deployed |
| RagequitModule | TBD | Not yet deployed |
| FutarchyGovernor | TBD | Not yet deployed |

**These addresses will be the same on any network with the Safe Singleton Factory.**

## GitHub Actions Deployment

The `.github/workflows/deploy-contracts.yml` workflow automatically:

1. Compiles all contracts
2. Deploys them deterministically to Mordor testnet
3. Configures contract ownerships
4. Outputs deployment information
5. Creates deployment logs as artifacts

### Triggering Deployment

**Automatic**: Pushes to `main` branch with contract changes

**Manual**: 
1. Go to Actions → "Deploy DAO Contracts to Mordor Testnet"
2. Click "Run workflow"
3. Select the network (default: mordor)

## Verifying Deployments

After deployment, you can verify contracts on block explorers:

### Mordor Testnet
- **Explorer**: https://etc-mordor.blockscout.com/
- **RPC**: https://rpc.mordor.etccooperative.org
- **Chain ID**: 63

To verify a contract address:
```bash
# Check if contract is deployed
curl -X POST https://rpc.mordor.etccooperative.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["<CONTRACT_ADDRESS>","latest"],"id":1}'
```

## Deployment to Other Networks

To deploy to a different network (that has the Safe Singleton Factory):

1. **Add network to hardhat.config.js**:
```javascript
networks: {
  yourNetwork: {
    url: "YOUR_RPC_URL",
    chainId: YOUR_CHAIN_ID,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  }
}
```

2. **Deploy**:
```bash
export PRIVATE_KEY=your_private_key
npx hardhat run scripts/deploy-deterministic.js --network yourNetwork
```

3. **Result**: Contracts will be deployed at the **exact same addresses** as on Mordor!

## Benefits of Deterministic Deployment

### For Users
- **Consistency**: Same addresses across test and production networks
- **Trust**: Can verify contracts before they're deployed to mainnet
- **Transparency**: Easy to verify that code matches deployed bytecode

### For Developers
- **Predictability**: Know addresses before deployment
- **Testing**: Deploy to testnet with same addresses as mainnet
- **Reproducibility**: Anyone can redeploy and verify
- **Multi-chain**: Easy to deploy to multiple networks with consistent addresses

### For Security
- **Auditability**: Easier to audit and verify deployments
- **No key dependency**: Don't need to secure a specific deployer key
- **Transparency**: Deployment process is fully transparent and reproducible

## Troubleshooting

### Factory Not Deployed
If you get an error that the factory isn't deployed:

1. Check if your network has the factory:
```javascript
const factoryCode = await ethers.provider.getCode(
  "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7"
);
console.log(factoryCode !== "0x" ? "Deployed" : "Not deployed");
```

2. If not deployed, you have two options:
   - Use the standard deployment script: `scripts/deploy.js`
   - Request Safe team to deploy the factory to your network

### Address Mismatch
If deployed address doesn't match predicted address:

1. Check that you're using the correct network
2. Verify the contract bytecode hasn't changed
3. Confirm the salt is correct
4. Ensure constructor arguments match

## References

- [Safe Singleton Factory Repository](https://github.com/safe-fndn/safe-singleton-factory)
- [Deterministic Deployment Proxy (Original)](https://github.com/Arachnid/deterministic-deployment-proxy)
- [EIP-1014: CREATE2](https://eips.ethereum.org/EIPS/eip-1014)
- [Safe Contracts](https://github.com/safe-global/safe-contracts)
