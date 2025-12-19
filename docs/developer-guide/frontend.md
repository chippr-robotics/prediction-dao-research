# Frontend Development

Guide to developing the React frontend for Prediction DAO.

## Technology Stack

- **React** 18+ - UI framework
- **Vite** - Build tool and dev server
- **ethers.js** v6 - Ethereum library
- **React Hooks** - State management
- **CSS** - Styling

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── ProposalSubmission.jsx
│   │   ├── ProposalList.jsx
│   │   ├── WelfareMetrics.jsx
│   │   └── MarketTrading.jsx
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   └── config.js
├── public/
├── index.html
├── vite.config.js
└── package.json
```

## Getting Started

```bash
cd frontend
npm install
npm run dev
```

## Connecting to Contracts

### Contract Configuration

```javascript
// src/config.js
export const contracts = {
  FutarchyGovernor: "0x...",
  WelfareMetricRegistry: "0x...",
  ProposalRegistry: "0x...",
  ConditionalMarketFactory: "0x...",
  PrivacyCoordinator: "0x...",
  OracleResolver: "0x...",
  RagequitModule: "0x..."
};

export const network = {
  chainId: 1337,
  name: "Hardhat Local"
};
```

### Using ethers.js

```javascript
import { ethers } from 'ethers';
import { contracts } from './config';

// Connect to provider
const provider = new ethers.BrowserProvider(window.ethereum);

// Get signer
const signer = await provider.getSigner();

// Create contract instance
const proposalRegistry = new ethers.Contract(
  contracts.ProposalRegistry,
  ProposalRegistryABI,
  signer
);

// Call contract methods
const tx = await proposalRegistry.submitProposal(...);
await tx.wait();
```

## Key Components

### Wallet Connection

```javascript
const [account, setAccount] = useState(null);
const [provider, setProvider] = useState(null);

const connectWallet = async () => {
  if (window.ethereum) {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      
      setProvider(provider);
      setAccount(address);
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  } else {
    alert("Please install MetaMask!");
  }
};
```

### Proposal Submission

```javascript
const ProposalSubmission = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  
  const submitProposal = async () => {
    try {
      const tx = await proposalRegistry.submitProposal(
        title,
        description,
        ethers.parseEther(fundingAmount),
        recipientAddress,
        welfareMetricId,
        { value: ethers.parseEther("50") }
      );
      
      await tx.wait();
      alert("Proposal submitted!");
    } catch (error) {
      console.error("Error submitting proposal:", error);
    }
  };
  
  return (
    <form onSubmit={submitProposal}>
      <input 
        value={title} 
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Proposal Title"
      />
      {/* More form fields */}
      <button type="submit">Submit Proposal</button>
    </form>
  );
};
```

### Reading Contract State

```javascript
const ProposalList = () => {
  const [proposals, setProposals] = useState([]);
  
  useEffect(() => {
    const loadProposals = async () => {
      const count = await proposalRegistry.proposalCount();
      const proposalArray = [];
      
      for (let i = 0; i < count; i++) {
        const proposal = await proposalRegistry.getProposal(i);
        proposalArray.push(proposal);
      }
      
      setProposals(proposalArray);
    };
    
    loadProposals();
  }, []);
  
  return (
    <div>
      {proposals.map((proposal, index) => (
        <div key={index}>
          <h3>{proposal.title}</h3>
          <p>{proposal.description}</p>
        </div>
      ))}
    </div>
  );
};
```

### Listening to Events

```javascript
useEffect(() => {
  const filter = proposalRegistry.filters.ProposalSubmitted();
  
  const handleProposalSubmitted = (proposalId, proposer) => {
    console.log(`New proposal ${proposalId} from ${proposer}`);
    // Update UI
  };
  
  proposalRegistry.on(filter, handleProposalSubmitted);
  
  return () => {
    proposalRegistry.off(filter, handleProposalSubmitted);
  };
}, [proposalRegistry]);
```

## Best Practices

### Error Handling

```javascript
try {
  const tx = await contract.method();
  await tx.wait();
} catch (error) {
  if (error.code === 'ACTION_REJECTED') {
    alert("Transaction rejected by user");
  } else if (error.code === 'INSUFFICIENT_FUNDS') {
    alert("Insufficient funds");
  } else {
    console.error("Transaction error:", error);
    alert("Transaction failed. See console for details.");
  }
}
```

### Loading States

```javascript
const [loading, setLoading] = useState(false);

const submitTransaction = async () => {
  setLoading(true);
  try {
    const tx = await contract.method();
    await tx.wait();
  } finally {
    setLoading(false);
  }
};

return (
  <button disabled={loading} onClick={submitTransaction}>
    {loading ? "Processing..." : "Submit"}
  </button>
);
```

### Network Detection

```javascript
useEffect(() => {
  const checkNetwork = async () => {
    const { chainId } = await provider.getNetwork();
    if (chainId !== expectedChainId) {
      alert("Please switch to the correct network");
    }
  };
  
  if (provider) {
    checkNetwork();
  }
}, [provider]);
```

## Building for Production

```bash
npm run build
```

Output will be in `dist/` directory.

## Next Steps

- [Review smart contracts](smart-contracts.md)
- [Learn about testing](testing.md)
- [Read contributing guidelines](contributing.md)
