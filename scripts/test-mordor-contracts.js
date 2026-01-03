#!/usr/bin/env node
/**
 * Test script to verify deployed contracts are reachable on Mordor testnet
 */

const https = require('https');

const MORDOR_RPC = 'https://rpc.mordor.etccooperative.org';

// Deployed contract addresses from deployedContracts file
const CONTRACTS = {
  deployer: '0x52502d049571C7893447b86c4d8B38e6184bF6e1',
  welfareRegistry: '0x8fE770a847C8BE899C51C16A21aDe6b6a2a5547D',
  proposalRegistry: '0xf5cB8752a95afb0264ABd2E6a7a543B795Dd0fB1',
  marketFactory: '0xd1B610a650EE14e42Fb29Ec65e21C53Ea8aDb203',
  privacyCoordinator: '0x47d0D47686181B29b7BdF5E8D95ea7bA90C837b9', // Fixed typo: Ox -> 0x
  oracleResolver: '0x19374Dd329fD61C5e404e0AE8397418E0f322Fba',
  ragequitModule: '0x243c90c69Cd8f035D93DD5100dbc5b3753E8a593',
  futarchyGovernor: '0xD37907b23d063F0839Ff2405179481822862C27A'
};

function makeRpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1
    });

    const url = new URL(MORDOR_RPC);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testChainConnection() {
  console.log('🔗 Testing Mordor testnet connection...');
  console.log(`   RPC Endpoint: ${MORDOR_RPC}\n`);
  
  try {
    const chainId = await makeRpcCall('eth_chainId');
    console.log(`✅ Connected to chain ID: ${chainId.result} (Mordor = 0x3f = 63)`);
    
    const blockNumber = await makeRpcCall('eth_blockNumber');
    console.log(`✅ Current block number: ${parseInt(blockNumber.result, 16)}\n`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to connect: ${error.message}`);
    return false;
  }
}

async function testContractDeployment(name, address) {
  try {
    // Get the code at the contract address
    const result = await makeRpcCall('eth_getCode', [address, 'latest']);
    
    if (result.error) {
      console.log(`❌ ${name}: Error - ${result.error.message}`);
      return false;
    }
    
    const code = result.result;
    
    if (code === '0x' || code === '0x0' || !code) {
      console.log(`❌ ${name} (${address}): No contract code found`);
      return false;
    }
    
    const codeSize = (code.length - 2) / 2; // Remove '0x' prefix, divide by 2 for bytes
    console.log(`✅ ${name}: Contract found (${codeSize} bytes)`);
    console.log(`   Address: ${address}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: Error - ${error.message}`);
    return false;
  }
}

async function testDeployerBalance() {
  try {
    const result = await makeRpcCall('eth_getBalance', [CONTRACTS.deployer, 'latest']);
    if (result.result) {
      const balanceWei = BigInt(result.result);
      const balanceEth = Number(balanceWei) / 1e18;
      console.log(`\n💰 Deployer Balance: ${balanceEth.toFixed(4)} ETC`);
    }
  } catch (error) {
    console.log(`   Could not fetch deployer balance: ${error.message}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   ClearPath DAO - Mordor Testnet Contract Verification');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Test chain connection
  const connected = await testChainConnection();
  if (!connected) {
    console.log('\n❌ Cannot proceed without chain connection');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Verifying Deployed Contracts');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let successCount = 0;
  let totalContracts = 0;

  for (const [name, address] of Object.entries(CONTRACTS)) {
    if (name === 'deployer') continue; // Skip deployer (EOA, not a contract)
    totalContracts++;
    
    const success = await testContractDeployment(name, address);
    if (success) successCount++;
    console.log('');
  }

  // Check deployer balance
  await testDeployerBalance();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`   Summary: ${successCount}/${totalContracts} contracts verified`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (successCount === totalContracts) {
    console.log('🎉 All contracts are deployed and reachable on Mordor testnet!\n');
    console.log('📊 View contracts on Blockscout:');
    console.log('   https://etc-mordor.blockscout.com/\n');
  } else {
    console.log(`⚠️  ${totalContracts - successCount} contract(s) could not be verified\n`);
    process.exit(1);
  }
}

main().catch(console.error);
