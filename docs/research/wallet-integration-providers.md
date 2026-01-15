# Wallet Infrastructure Integration Research

## Executive Summary

This document evaluates three wallet/custody infrastructure providers for potential integration with the Prediction DAO application: **Fireblocks**, **DFNS**, and **Alchemy Account Kit**.

### Current Architecture Overview

The Prediction DAO currently uses:
- **Blockchain**: Ethereum Classic (ETC) - Network ID 61 (Mainnet), Mordor Testnet (ID 63)
- **Wallet Connection**: Wagmi v3 + Viem v2 with injected wallets and WalletConnect v2
- **Contract Interaction**: ethers.js v6
- **Framework**: React 19.2 + Vite

**Critical Finding**: Ethereum Classic (ETC) has **limited support** among these providers, which significantly impacts integration feasibility.

---

## Provider Comparison Matrix

| Feature | Fireblocks | DFNS | Alchemy Account Kit |
|---------|-----------|------|---------------------|
| **ETC Support** | ✅ Yes (EVM chains) | ❌ Not listed | ❌ No |
| **MPC Technology** | ✅ Yes | ✅ Yes | ⚠️ Via Turnkey |
| **ethers.js Integration** | ✅ Native | ✅ Native | ✅ Native |
| **React SDK** | ❌ No (backend-focused) | ✅ Yes | ✅ Yes |
| **Account Abstraction** | ⚠️ Limited | ⚠️ Via partners | ✅ Native (ERC-4337) |
| **Pricing Model** | Enterprise | Enterprise | Freemium |
| **Non-Custodial Option** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Hardhat Plugin** | ✅ Yes | ❌ No | ❌ No |

---

## 1. Fireblocks

### Overview
Fireblocks is an enterprise-grade digital asset custody and treasury management platform using MPC (Multi-Party Computation) technology. It's designed for institutional use cases requiring high security and compliance.

### ETC Compatibility: ✅ SUPPORTED
Fireblocks supports 60+ EVM and non-EVM chains, including Ethereum Classic.

### Integration Requirements

#### A. Prerequisites
1. **Fireblocks Account**: Enterprise contract required
2. **API Credentials**:
   - API Key (provided by Fireblocks)
   - API Private Key (RSA key for signing requests)
3. **Vault Account Setup**: Configure vault accounts in Fireblocks console

#### B. NPM Packages
```bash
npm install @fireblocks/fireblocks-web3-provider
# Optional: For direct SDK access
npm install fireblocks-sdk
```

#### C. Code Integration

**EIP-1193 Provider Setup** (for ethers.js):
```javascript
import { FireblocksWeb3Provider, ChainId } from "@fireblocks/fireblocks-web3-provider";
import { ethers } from "ethers";

const fireblocksProvider = new FireblocksWeb3Provider({
  privateKey: process.env.FIREBLOCKS_API_PRIVATE_KEY,
  apiKey: process.env.FIREBLOCKS_API_KEY,
  vaultAccountIds: [0, 1, 2], // Your vault account IDs
  chainId: 61, // Ethereum Classic mainnet
  // OR use rpcUrl for custom networks
  rpcUrl: "https://etc.rivet.link"
});

// Convert to ethers provider (v6)
const provider = new ethers.BrowserProvider(fireblocksProvider);
const signer = await provider.getSigner();
```

**Integration with Existing WalletContext**:
```javascript
// In WalletContext.jsx - Add Fireblocks as alternative signer source
const getFireblocksSigner = async () => {
  const fireblocksProvider = new FireblocksWeb3Provider({
    privateKey: import.meta.env.VITE_FIREBLOCKS_API_PRIVATE_KEY,
    apiKey: import.meta.env.VITE_FIREBLOCKS_API_KEY,
    vaultAccountIds: JSON.parse(import.meta.env.VITE_FIREBLOCKS_VAULT_IDS),
    chainId: parseInt(import.meta.env.VITE_NETWORK_ID)
  });

  const provider = new ethers.BrowserProvider(fireblocksProvider);
  return await provider.getSigner();
};
```

#### D. Hardhat Plugin (for deployments)
```javascript
// hardhat.config.js
require("@fireblocks/hardhat-fireblocks");

module.exports = {
  fireblocks: {
    apiKey: process.env.FIREBLOCKS_API_KEY,
    privateKey: process.env.FIREBLOCKS_API_PRIVATE_KEY_PATH,
  },
  networks: {
    etc: {
      url: "https://etc.rivet.link",
      fireblocks: {
        vaultAccountIds: [0],
      }
    }
  }
};
```

### Architecture Changes Required

1. **Backend Service**: Fireblocks is backend-focused; requires server-side component for API key security
2. **Environment Variables**:
   ```
   FIREBLOCKS_API_KEY=<your-api-key>
   FIREBLOCKS_API_PRIVATE_KEY=<your-private-key-pem>
   FIREBLOCKS_VAULT_ACCOUNT_IDS=[0,1,2]
   ```
3. **Webhook Handler**: For transaction status updates
4. **Policy Engine**: Configure approval workflows in Fireblocks console

### Estimated Integration Effort
- **Backend setup**: Create API service for Fireblocks interactions
- **Frontend modifications**: Add Fireblocks wallet option to WalletContext
- **Testing**: Transaction signing, multi-sig flows
- **Security review**: API key management, webhook verification

### Pros
- ✅ Enterprise-grade security with MPC
- ✅ Supports Ethereum Classic
- ✅ Native ethers.js integration
- ✅ Hardhat plugin for deployments
- ✅ Institutional compliance features

### Cons
- ❌ Enterprise pricing (not disclosed publicly)
- ❌ Requires backend service for security
- ❌ Complex onboarding process
- ❌ Not suitable for end-user self-custody

---

## 2. DFNS

### Overview
DFNS provides Wallet-as-a-Service (WaaS) infrastructure using MPC technology. It's designed for developers building applications that need embedded wallet functionality with institutional-grade security.

### ETC Compatibility: ⚠️ NOT CONFIRMED
Based on research, DFNS does **not explicitly list Ethereum Classic** in their supported chains. Their focus is on:
- Ethereum, Polygon, Avalanche, BSC (current)
- Solana, Optimism, Layer-2s (planned)

**Recommendation**: Contact DFNS directly to confirm ETC support before proceeding.

### Integration Requirements (If ETC Supported)

#### A. Prerequisites
1. **DFNS Account**: Sign up at dfns.co
2. **Application Registration**: Create app in DFNS dashboard
3. **API Credentials**: Service account credentials

#### B. NPM Packages
```bash
npm install @dfns/sdk @dfns/sdk-browser @dfns/lib-ethersjs6
# For server-side
npm install @dfns/sdk-keysigner
```

#### C. Code Integration

**Browser-Side (WebAuthn)**:
```javascript
import { DfnsApiClient } from '@dfns/sdk';
import { WebAuthnSigner } from '@dfns/sdk-browser';

const dfns = new DfnsApiClient({
  appId: import.meta.env.VITE_DFNS_APP_ID,
  baseUrl: 'https://api.dfns.io',
  signer: new WebAuthnSigner()
});

// Create a wallet
const wallet = await dfns.wallets.createWallet({
  body: { network: 'EthereumClassic' } // If supported
});
```

**ethers.js Integration**:
```javascript
import { DfnsSigner } from '@dfns/lib-ethersjs6';

const signer = new DfnsSigner({
  dfnsClient: dfns,
  walletId: 'wa-xxx-xxx'
}, provider);

// Use like any ethers signer
const tx = await signer.sendTransaction({
  to: '0x...',
  value: ethers.parseEther('1.0')
});
```

#### D. Authentication Flow
1. **User Action Signing**: All state-changing operations require cryptographic signature
2. **WebAuthn (Recommended)**: Uses passkeys for secure browser-based signing
3. **Key Credentials**: For server-side operations

### Architecture Changes Required

1. **Authentication Integration**: Add DFNS WebAuthn flow to login
2. **Wallet Management**: Create/import wallets through DFNS API
3. **Signer Abstraction**: Replace ethers signers with DfnsSigner
4. **Server Component**: For service account operations

### Estimated Integration Effort
- **Authentication**: Implement WebAuthn passkey flow
- **Wallet UI**: Build wallet creation/management interface
- **Signer refactor**: Update blockchainService to use DfnsSigner
- **Testing**: User flows, edge cases

### Pros
- ✅ MPC with WebAuthn (passkeys)
- ✅ Non-custodial option
- ✅ React Native SDK available
- ✅ Native ethers.js v6 support
- ✅ SOC 2 Type II compliant

### Cons
- ❌ ETC support not confirmed
- ❌ Enterprise-focused pricing
- ❌ Complex authentication flow
- ❌ Limited documentation for EVM edge cases

---

## 3. Alchemy Account Kit

### Overview
Alchemy Account Kit provides embedded smart wallets with account abstraction (ERC-4337). It offers social login, gas abstraction, and batch transactions for improved UX.

### ETC Compatibility: ❌ NOT SUPPORTED
Alchemy explicitly does **not support Ethereum Classic**. Supported networks:
- Ethereum, Polygon, Arbitrum, Optimism, Base, Starknet, Astar, Solana

### Integration Requirements (For Reference)

Even though ETC is not supported, here's what integration would look like for supported chains:

#### A. NPM Packages
```bash
npm install @account-kit/react @account-kit/infra viem@2.20.0 wagmi@2.12.7
```

#### B. Configuration
```javascript
import { createConfig } from "@account-kit/react";
import { sepolia } from "@account-kit/infra";

const config = createConfig({
  transport: alchemy({ apiKey: "YOUR_API_KEY" }),
  chain: sepolia,
  ssr: true,
});
```

#### C. React Integration
```jsx
import { AlchemyAccountProvider, useAccount } from "@account-kit/react";

function App() {
  return (
    <AlchemyAccountProvider config={config}>
      <WalletComponent />
    </AlchemyAccountProvider>
  );
}

function WalletComponent() {
  const { address, isConnected } = useAccount();
  // Smart wallet functionality
}
```

### Why Consider Account Kit Despite No ETC Support

If the project plans to expand to other chains, Account Kit offers:
- Social login (Google, Apple, Discord)
- Gas sponsorship (paymasters)
- Batch transactions
- Session keys
- Freemium pricing

### Pros
- ✅ Best UX for end users (social login)
- ✅ Free tier available
- ✅ Native React/wagmi integration
- ✅ Gas abstraction built-in

### Cons
- ❌ **Does not support Ethereum Classic**
- ❌ Requires viem/wagmi version pinning
- ❌ ERC-4337 overhead
- ❌ No CJS support

---

## Recommendations

### For Ethereum Classic (Current Chain)

**Primary Recommendation: Fireblocks**
- Only provider with confirmed ETC support
- Enterprise-grade security for DAO treasury operations
- Can replace floppy keystore for admin operations
- Hardhat plugin simplifies deployments

**Implementation Path**:
1. Establish Fireblocks enterprise relationship
2. Create backend service for API key security
3. Integrate Fireblocks provider for admin/treasury operations
4. Keep existing wagmi setup for end-user wallets

### For Future Multi-Chain Expansion

If expanding beyond ETC:
1. **DFNS**: For embedded wallets with MPC security
2. **Alchemy Account Kit**: For best end-user UX with account abstraction

### Hybrid Approach

Consider a layered wallet architecture:
```
┌─────────────────────────────────────────────┐
│              End-User Wallets               │
│  (MetaMask, WalletConnect - current setup)  │
└─────────────────────────────────────────────┘
                      │
┌─────────────────────────────────────────────┐
│            Treasury Operations              │
│  (Fireblocks MPC for admin/DAO operations)  │
└─────────────────────────────────────────────┘
                      │
┌─────────────────────────────────────────────┐
│          Smart Contract Deployment          │
│    (Fireblocks Hardhat plugin or floppy)    │
└─────────────────────────────────────────────┘
```

---

## Integration Checklist

### Fireblocks Integration Tasks

- [ ] Contact Fireblocks sales for enterprise evaluation
- [ ] Obtain API credentials and configure vault accounts
- [ ] Create backend service for secure API interactions
- [ ] Install `@fireblocks/fireblocks-web3-provider`
- [ ] Add FireblocksProvider to WalletContext as admin option
- [ ] Configure Hardhat plugin for deployments
- [ ] Set up webhook endpoint for transaction notifications
- [ ] Configure policy engine for approval workflows
- [ ] Test transaction signing on Mordor testnet
- [ ] Security audit of API key handling

### Environment Variables Required

```env
# Fireblocks
FIREBLOCKS_API_KEY=<api-key>
FIREBLOCKS_API_PRIVATE_KEY=<path-to-private-key.pem>
FIREBLOCKS_VAULT_ACCOUNT_IDS=[0,1,2]
FIREBLOCKS_WEBHOOK_SECRET=<webhook-secret>

# Frontend (if exposing to browser - not recommended)
VITE_FIREBLOCKS_ENABLED=false
```

---

## Sources

### Fireblocks
- [Fireblocks Developer Portal](https://developers.fireblocks.com/)
- [Fireblocks API Reference](https://docs.fireblocks.com/api/)
- [EVM Web3 Provider Documentation](https://developers.fireblocks.com/reference/evm-web3-provider)
- [Fireblocks Web3 Provider GitHub](https://github.com/fireblocks/fireblocks-web3-provider)
- [Supported Networks](https://developers.fireblocks.com/docs/supported-networks)

### DFNS
- [DFNS Official Website](https://www.dfns.co/)
- [DFNS API Documentation](https://docs.dfns.co/)
- [DFNS TypeScript SDK](https://github.com/dfns/dfns-sdk-ts)
- [DFNS Blockchain Integrations](https://www.dfns.co/integrations/blockchains)

### Alchemy Account Kit
- [Account Kit Documentation](https://accountkit.alchemy.com/react/quickstart)
- [Alchemy aa-sdk GitHub](https://github.com/alchemyplatform/aa-sdk)
- [Alchemy Supported Networks](https://www.alchemy.com/docs/choosing-a-web3-network)
- [Account Kit Core Reference](https://www.alchemy.com/docs/wallets/reference/account-kit/core)

---

*Research conducted: January 2026*
*Application: Prediction DAO (Ethereum Classic)*
