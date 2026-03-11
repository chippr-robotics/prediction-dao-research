'use strict';

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  // Blockchain
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  chainId: parseInt(process.env.CHAIN_ID || '1337', 10),
  privateKey: process.env.SIGNER_PRIVATE_KEY || '',
  tokenMintFactoryAddress: process.env.TOKEN_MINT_FACTORY_ADDRESS || '',

  // Authentication
  apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),

  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

function validateConfig() {
  const errors = [];
  if (!config.rpcUrl) errors.push('RPC_URL is required');
  if (!config.privateKey) errors.push('SIGNER_PRIVATE_KEY is required');
  if (!config.tokenMintFactoryAddress) errors.push('TOKEN_MINT_FACTORY_ADDRESS is required');
  if (config.apiKeys.length === 0) errors.push('API_KEYS is required (comma-separated list)');
  return errors;
}

module.exports = { config, validateConfig };
