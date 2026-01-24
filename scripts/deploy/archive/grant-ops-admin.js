const { ethers } = require('hardhat');

const TIERED_ROLE_MANAGER = '0xA6F794292488C628f91A0475dDF8dE6cEF2706EF';
const PAYMENT_PROCESSOR = '0xC6A3D457b0a0D9Fa4859F4211A4c9551F8Ce1F63';
const MEMBERSHIP_PAYMENT_MANAGER = '0xA61C3a81e25E8E5E7A6A7EceBEd7e1BF58533e28';
const ADMIN = '0x52502d049571C7893447b86c4d8B38e6184bF6e1';

const OPS_ADMIN = ethers.keccak256(ethers.toUtf8Bytes('OPERATIONS_ADMIN_ROLE'));
const TOKENMINT_ROLE = ethers.keccak256(ethers.toUtf8Bytes('TOKENMINT_ROLE'));
const USC_ADDRESS = '0xDE093684c796204224BC081f937aa059D903c52a';

async function main() {
  const [signer] = await ethers.getSigners();
  console.log('Signer:', signer.address);

  // 1. Grant OPERATIONS_ADMIN_ROLE
  console.log('\n1. Granting OPERATIONS_ADMIN_ROLE to ADMIN...');
  const roleManager = await ethers.getContractAt(
    ['function grantRole(bytes32,address)', 'function hasRole(bytes32,address) view returns (bool)'],
    TIERED_ROLE_MANAGER,
    signer
  );

  const hasOps = await roleManager.hasRole(OPS_ADMIN, ADMIN);
  if (!hasOps) {
    const tx = await roleManager.grantRole(OPS_ADMIN, ADMIN);
    await tx.wait();
    console.log('✅ OPERATIONS_ADMIN_ROLE granted');
  } else {
    console.log('✅ Already has OPERATIONS_ADMIN_ROLE');
  }

  // 2. Check PaymentProcessor configuration
  console.log('\n2. Checking PaymentProcessor configuration...');
  const paymentProcessor = await ethers.getContractAt(
    [
      'function tierRegistry() view returns (address)',
      'function membershipManager() view returns (address)',
      'function paymentManager() view returns (address)',
      'function roleManagerCore() view returns (address)'
    ],
    PAYMENT_PROCESSOR
  );

  console.log('   tierRegistry:', await paymentProcessor.tierRegistry());
  console.log('   membershipManager:', await paymentProcessor.membershipManager());
  console.log('   paymentManager:', await paymentProcessor.paymentManager());
  console.log('   roleManagerCore:', await paymentProcessor.roleManagerCore());

  // 3. Check MembershipPaymentManager role pricing
  console.log('\n3. Checking MembershipPaymentManager...');
  const paymentManager = await ethers.getContractAt(
    [
      'function rolePricing(bytes32) view returns (bool isActive)',
      'function paymentTokens(address) view returns (address,bool,uint8,string)'
    ],
    MEMBERSHIP_PAYMENT_MANAGER
  );

  try {
    const uscInfo = await paymentManager.paymentTokens(USC_ADDRESS);
    console.log('   USC token active:', uscInfo[1]);
  } catch (e) {
    console.log('   USC check error:', e.message);
  }

  console.log('\n✅ Done!');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
