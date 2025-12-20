# Deployment Quick Start Guide

This guide will help you quickly set up and deploy the ClearPath DAO contracts to Mordor testnet.

## Prerequisites

Before deploying, you need:

1. **GitHub Repository Secrets**
   - `PRIVATE_KEY`: Your Ethereum Classic wallet private key (without `0x` prefix)
   
2. **Sufficient Balance**
   - Your wallet needs Mordor testnet ETC for gas fees
   - Get testnet ETC from: https://github.com/chippr-robotics/mordor-public-faucet

## Quick Setup (5 minutes)

### Step 1: Add Your Private Key

1. Go to your GitHub repository
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `PRIVATE_KEY`
5. Value: Your private key (without `0x`)
6. Click **Add secret**

⚠️ **Security**: Never commit your private key to the repository!

### Step 2: Deploy Contracts

**Option A: Automatic Deployment (Recommended)**

Just push to the main branch with any contract changes:
```bash
git add .
git commit -m "Update contracts"
git push origin main
```

The GitHub Actions workflow will automatically deploy the contracts.

**Option B: Manual Deployment**

1. Go to the **Actions** tab in GitHub
2. Click **Deploy DAO Contracts to Mordor Testnet**
3. Click **Run workflow**
4. Select network: `mordor`
5. Click **Run workflow** button

### Step 3: View Deployment Results

After deployment completes (usually 2-3 minutes):

1. **In GitHub Actions**:
   - View the workflow summary for contract addresses
   - Download deployment logs from artifacts

2. **On Blockscout**:
   - Visit: https://etc-mordor.blockscout.com/
   - Search for contract addresses
   - Verify bytecode and transactions

## What Gets Deployed

The deployment script will deploy these contracts in order:

1. **WelfareMetricRegistry** - Welfare metrics management
2. **ProposalRegistry** - Proposal submission and management
3. **ConditionalMarketFactory** - Market deployment
4. **PrivacyCoordinator** - Privacy and anti-collusion
5. **OracleResolver** - Multi-stage oracle resolution
6. **RagequitModule** - Minority protection
7. **FutarchyGovernor** - Main governance coordinator

All contracts are deployed at **deterministic addresses** using Safe Singleton Factory.

## Local Deployment (Optional)

To deploy locally for testing:

```bash
# Set your private key
export PRIVATE_KEY=your_private_key_here

# Install dependencies
npm ci

# Compile contracts
npm run compile

# Deploy to Mordor testnet
npm run deploy:mordor
```

## Deployment Details

- **Network**: Ethereum Classic Mordor Testnet
- **Chain ID**: 63
- **RPC URL**: https://rpc.mordor.etccooperative.org
- **Factory**: 0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7 (Safe Singleton Factory)
- **Explorer**: https://etc-mordor.blockscout.com/

## Deterministic Deployment Benefits

✅ **Same addresses across networks** - Deploy to mainnet with same addresses as testnet
✅ **Reproducible** - Anyone can verify deployments match source code
✅ **No key dependency** - Don't need specific deployer key
✅ **More secure** - Easier to audit and verify

## Expected Gas Usage

Approximate gas costs for deployment:
- WelfareMetricRegistry: ~500,000 gas
- ProposalRegistry: ~600,000 gas
- ConditionalMarketFactory: ~800,000 gas
- PrivacyCoordinator: ~700,000 gas
- OracleResolver: ~600,000 gas
- RagequitModule: ~500,000 gas
- FutarchyGovernor: ~1,200,000 gas

**Total**: ~5,000,000 gas (~0.1 ETC at 20 gwei)

## Troubleshooting

### "PRIVATE_KEY not found"
- Check that you added the secret in GitHub repository settings
- Ensure the secret name is exactly `PRIVATE_KEY`

### "Insufficient balance"
- Get testnet ETC from: https://github.com/chippr-robotics/mordor-public-faucet
- Ensure you have at least 0.2 ETC for gas fees

### "Factory not deployed"
- Safe Singleton Factory is already deployed on Mordor
- If you see this error, check network connection
- RPC URL should be: https://rpc.mordor.etccooperative.org

### Deployment takes too long
- Normal deployment takes 2-3 minutes
- Check GitHub Actions logs for details
- Mordor testnet block time is ~15 seconds

### Contract already deployed
- This is normal! The script is idempotent
- Already deployed contracts are automatically skipped
- Only missing contracts will be deployed

## Next Steps

After deployment:

1. ✅ **Verify contracts on Blockscout**
2. ✅ **Test contract interactions**
3. ✅ **Document contract addresses**
4. ✅ **Update frontend configuration** (if applicable)
5. ✅ **Run integration tests**

## Support

For issues or questions:
- Check [DETERMINISTIC_DEPLOYMENT.md](./DETERMINISTIC_DEPLOYMENT.md) for detailed info
- Review [README.md](./README.md) for full documentation
- Open an issue on GitHub

## Security Notes

- ✅ Private keys are stored securely in GitHub Secrets
- ✅ No secrets committed to repository
- ✅ Deployment uses audited Safe Singleton Factory
- ✅ CodeQL security scan passed (0 vulnerabilities)
- ✅ Code review completed and feedback addressed

---

**Ready to deploy?** Follow the steps above and your contracts will be live on Mordor testnet in minutes! 🚀
