'use strict';

const { ethers } = require('ethers');
const { config } = require('../config');

// ── ABIs ────────────────────────────────────────────────────────────────

const TOKEN_MINT_FACTORY_ABI = [
  // Events
  { anonymous: false, inputs: [{ indexed: true, name: 'tokenId', type: 'uint256' }, { indexed: true, name: 'tokenType', type: 'uint8' }, { indexed: true, name: 'tokenAddress', type: 'address' }, { indexed: false, name: 'owner', type: 'address' }, { indexed: false, name: 'name', type: 'string' }, { indexed: false, name: 'symbol', type: 'string' }, { indexed: false, name: 'metadataURI', type: 'string' }], name: 'TokenCreated', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'tokenId', type: 'uint256' }, { indexed: true, name: 'tokenAddress', type: 'address' }], name: 'TokenListedOnETCSwap', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, name: 'tokenId', type: 'uint256' }, { indexed: false, name: 'newURI', type: 'string' }], name: 'MetadataURIUpdated', type: 'event' },
  // Read
  { inputs: [], name: 'tokenCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'getTokenInfo', outputs: [{ components: [{ name: 'tokenId', type: 'uint256' }, { name: 'tokenType', type: 'uint8' }, { name: 'tokenAddress', type: 'address' }, { name: 'owner', type: 'address' }, { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'metadataURI', type: 'string' }, { name: 'createdAt', type: 'uint256' }, { name: 'listedOnETCSwap', type: 'bool' }, { name: 'isBurnable', type: 'bool' }, { name: 'isPausable', type: 'bool' }], name: '', type: 'tuple' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'owner', type: 'address' }], name: 'getOwnerTokens', outputs: [{ name: '', type: 'uint256[]' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'tokenAddress', type: 'address' }], name: 'getTokenIdByAddress', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  // Write
  { inputs: [{ name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'initialSupply', type: 'uint256' }, { name: 'metadataURI', type: 'string' }, { name: 'isBurnable', type: 'bool' }, { name: 'isPausable', type: 'bool' }, { name: 'listOnETCSwap', type: 'bool' }], name: 'createERC20', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'baseURI', type: 'string' }, { name: 'isBurnable', type: 'bool' }], name: 'createERC721', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'newURI', type: 'string' }], name: 'updateMetadataURI', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'tokenId', type: 'uint256' }], name: 'listOnETCSwap', outputs: [], stateMutability: 'nonpayable', type: 'function' },
];

// Minimal ERC-20 ABI for mint / burn / transfer / balance on deployed tokens
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
  'function burn(uint256 amount)',
  'function pause()',
  'function unpause()',
  'function owner() view returns (address)',
];

// Minimal ERC-721 ABI for mint / burn / transfer / balance on deployed NFTs
const ERC721_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function mint(address to, string uri) returns (uint256)',
  'function burn(uint256 tokenId)',
  'function owner() view returns (address)',
];

const TOKEN_TYPE = { ERC20: 0, ERC721: 1 };

// ── Singleton connections ───────────────────────────────────────────────

let _provider = null;
let _signer = null;
let _factory = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  }
  return _provider;
}

function getSigner() {
  if (!_signer) {
    _signer = new ethers.Wallet(config.privateKey, getProvider());
  }
  return _signer;
}

function getFactory() {
  if (!_factory) {
    _factory = new ethers.Contract(
      config.tokenMintFactoryAddress,
      TOKEN_MINT_FACTORY_ABI,
      getSigner(),
    );
  }
  return _factory;
}

function tokenContract(address, type) {
  const abi = type === TOKEN_TYPE.ERC20 ? ERC20_ABI : ERC721_ABI;
  return new ethers.Contract(address, abi, getSigner());
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatTokenInfo(raw) {
  return {
    id: raw.tokenId.toString(),
    kind: raw.tokenType === BigInt(TOKEN_TYPE.ERC20) ? 'Erc20' : 'Erc721',
    address: raw.tokenAddress,
    owner: raw.owner,
    name: raw.name,
    symbol: raw.symbol,
    metadataURI: raw.metadataURI,
    createdAt: Number(raw.createdAt),
    listedOnDex: raw.listedOnETCSwap,
    burnable: raw.isBurnable,
    pausable: raw.isPausable,
  };
}

async function waitForTx(tx) {
  const receipt = await tx.wait();
  return {
    txHash: tx.hash,
    blockNumber: Number(receipt.blockNumber),
    status: receipt.status === 1 ? 'Confirmed' : 'Failed',
  };
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Deploy a new ERC-20 token via the factory.
 */
async function createERC20({ name, symbol, initialSupply, decimals, metadataURI, burnable, pausable, listOnDex }) {
  const supply = ethers.parseUnits(initialSupply.toString(), decimals || 18);
  const tx = await getFactory().createERC20(
    name, symbol, supply,
    metadataURI || '',
    burnable || false,
    pausable || false,
    listOnDex || false,
  );
  const result = await waitForTx(tx);

  // Parse TokenCreated event
  const factory = getFactory();
  const receipt = await getProvider().getTransactionReceipt(tx.hash);
  let tokenId = null;
  let tokenAddress = null;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === 'TokenCreated') {
        tokenId = parsed.args.tokenId.toString();
        tokenAddress = parsed.args.tokenAddress;
        break;
      }
    } catch { /* skip */ }
  }

  return { ...result, tokenId, tokenAddress };
}

/**
 * Deploy a new ERC-721 collection via the factory.
 */
async function createERC721({ name, symbol, baseURI, burnable }) {
  const tx = await getFactory().createERC721(
    name, symbol,
    baseURI || '',
    burnable || false,
  );
  const result = await waitForTx(tx);

  const factory = getFactory();
  const receipt = await getProvider().getTransactionReceipt(tx.hash);
  let tokenId = null;
  let tokenAddress = null;
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed && parsed.name === 'TokenCreated') {
        tokenId = parsed.args.tokenId.toString();
        tokenAddress = parsed.args.tokenAddress;
        break;
      }
    } catch { /* skip */ }
  }

  return { ...result, tokenId, tokenAddress };
}

/**
 * Get token info by factory-assigned ID.
 */
async function getTokenInfo(tokenId) {
  const raw = await getFactory().getTokenInfo(tokenId);
  return formatTokenInfo(raw);
}

/**
 * List all tokens with pagination.
 */
async function listTokens({ limit = 25, offset = 0 } = {}) {
  const total = Number(await getFactory().tokenCount());
  const tokens = [];
  const start = offset + 1; // tokenIds are 1-based
  const end = Math.min(offset + limit, total);
  for (let i = start; i <= end; i++) {
    const raw = await getFactory().getTokenInfo(i);
    tokens.push(formatTokenInfo(raw));
  }
  return { tokens, total };
}

/**
 * List tokens owned by an address.
 */
async function getOwnerTokens(ownerAddress) {
  const ids = await getFactory().getOwnerTokens(ownerAddress);
  const tokens = [];
  for (const id of ids) {
    const raw = await getFactory().getTokenInfo(id);
    tokens.push(formatTokenInfo(raw));
  }
  return tokens;
}

/**
 * Mint additional tokens (ERC-20: amount, ERC-721: to + uri).
 */
async function mintTokens(tokenId, { to, amount, uri }) {
  const info = await getFactory().getTokenInfo(tokenId);
  const addr = info.tokenAddress;
  const type = Number(info.tokenType);

  if (type === TOKEN_TYPE.ERC20) {
    const token = tokenContract(addr, TOKEN_TYPE.ERC20);
    const decimals = await token.decimals();
    const parsed = ethers.parseUnits(amount.toString(), decimals);
    const tx = await token.mint(to, parsed);
    return waitForTx(tx);
  } else {
    const token = tokenContract(addr, TOKEN_TYPE.ERC721);
    const tx = await token.mint(to, uri || '');
    return waitForTx(tx);
  }
}

/**
 * Burn tokens (ERC-20: amount from signer, ERC-721: tokenId on child NFT).
 */
async function burnTokens(tokenId, { amount, nftTokenId }) {
  const info = await getFactory().getTokenInfo(tokenId);
  const addr = info.tokenAddress;
  const type = Number(info.tokenType);

  if (type === TOKEN_TYPE.ERC20) {
    const token = tokenContract(addr, TOKEN_TYPE.ERC20);
    const decimals = await token.decimals();
    const parsed = ethers.parseUnits(amount.toString(), decimals);
    const tx = await token.burn(parsed);
    return waitForTx(tx);
  } else {
    const token = tokenContract(addr, TOKEN_TYPE.ERC721);
    const tx = await token.burn(BigInt(nftTokenId));
    return waitForTx(tx);
  }
}

/**
 * Transfer tokens.
 */
async function transferTokens(tokenId, { from, to, amount, nftTokenId }) {
  const info = await getFactory().getTokenInfo(tokenId);
  const addr = info.tokenAddress;
  const type = Number(info.tokenType);

  if (type === TOKEN_TYPE.ERC20) {
    const token = tokenContract(addr, TOKEN_TYPE.ERC20);
    const decimals = await token.decimals();
    const parsed = ethers.parseUnits(amount.toString(), decimals);
    const tx = await token.transfer(to, parsed);
    return waitForTx(tx);
  } else {
    const token = tokenContract(addr, TOKEN_TYPE.ERC721);
    const tx = await token.transferFrom(from || getSigner().address, to, BigInt(nftTokenId));
    return waitForTx(tx);
  }
}

/**
 * Get balance of an address for a specific token.
 */
async function getBalance(tokenId, address) {
  const info = await getFactory().getTokenInfo(tokenId);
  const addr = info.tokenAddress;
  const type = Number(info.tokenType);

  if (type === TOKEN_TYPE.ERC20) {
    const token = tokenContract(addr, TOKEN_TYPE.ERC20);
    const [balance, decimals, symbol] = await Promise.all([
      token.balanceOf(address),
      token.decimals(),
      token.symbol(),
    ]);
    return {
      kind: 'Erc20',
      symbol,
      decimals: Number(decimals),
      balance: balance.toString(),
      formatted: ethers.formatUnits(balance, decimals),
    };
  } else {
    const token = tokenContract(addr, TOKEN_TYPE.ERC721);
    const [balance, symbol] = await Promise.all([
      token.balanceOf(address),
      token.symbol(),
    ]);
    return {
      kind: 'Erc721',
      symbol,
      balance: balance.toString(),
    };
  }
}

/**
 * Pause a pausable ERC-20 token.
 */
async function pauseToken(tokenId) {
  const info = await getFactory().getTokenInfo(tokenId);
  const token = tokenContract(info.tokenAddress, TOKEN_TYPE.ERC20);
  const tx = await token.pause();
  return waitForTx(tx);
}

/**
 * Unpause a pausable ERC-20 token.
 */
async function unpauseToken(tokenId) {
  const info = await getFactory().getTokenInfo(tokenId);
  const token = tokenContract(info.tokenAddress, TOKEN_TYPE.ERC20);
  const tx = await token.unpause();
  return waitForTx(tx);
}

/**
 * Update metadata URI on the factory.
 */
async function updateMetadata(tokenId, newURI) {
  const tx = await getFactory().updateMetadataURI(tokenId, newURI);
  return waitForTx(tx);
}

/**
 * List token on DEX (ETCSwap).
 */
async function listOnDex(tokenId) {
  const tx = await getFactory().listOnETCSwap(tokenId);
  return waitForTx(tx);
}

/**
 * Estimate gas for a token creation.
 */
async function estimateFee({ kind, name, symbol, initialSupply, decimals, metadataURI, burnable, pausable, listOnDex: dex }) {
  const factory = getFactory();
  let gasEstimate;

  if (kind === 'Erc20') {
    const supply = ethers.parseUnits((initialSupply || '0').toString(), decimals || 18);
    gasEstimate = await factory.createERC20.estimateGas(
      name, symbol, supply, metadataURI || '', burnable || false, pausable || false, dex || false,
    );
  } else {
    gasEstimate = await factory.createERC721.estimateGas(
      name, symbol, metadataURI || '', burnable || false,
    );
  }

  const feeData = await getProvider().getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
  const buffered = (gasEstimate * 120n) / 100n;

  return {
    gasLimit: buffered.toString(),
    gasPrice: gasPrice.toString(),
    gasPriceGwei: ethers.formatUnits(gasPrice, 'gwei'),
    estimatedCost: ethers.formatEther(buffered * gasPrice),
  };
}

/**
 * Health check: verify we can reach the blockchain.
 */
async function healthCheck() {
  const [blockNumber, network] = await Promise.all([
    getProvider().getBlockNumber(),
    getProvider().getNetwork(),
  ]);
  return {
    connected: true,
    blockNumber,
    chainId: Number(network.chainId),
    signerAddress: getSigner().address,
    factoryAddress: config.tokenMintFactoryAddress,
  };
}

module.exports = {
  createERC20,
  createERC721,
  getTokenInfo,
  listTokens,
  getOwnerTokens,
  mintTokens,
  burnTokens,
  transferTokens,
  getBalance,
  pauseToken,
  unpauseToken,
  updateMetadata,
  listOnDex,
  estimateFee,
  healthCheck,
  TOKEN_TYPE,
};
