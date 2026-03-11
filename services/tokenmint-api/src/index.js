'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { config, validateConfig } = require('./config');
const { attachRequestId } = require('./middleware/requestId');
const { authenticate } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const tokenRoutes = require('./routes/tokens');
const operationRoutes = require('./routes/operations');

// ── Validate config before starting ─────────────────────────────────────
const configErrors = validateConfig();
if (configErrors.length > 0) {
  console.error('Configuration errors:');
  configErrors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

// ── Express app ─────────────────────────────────────────────────────────
const app = express();

// Security & parsing
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request ID on every request
app.use(attachRequestId);

// Rate limiting (BitGo-style: 360 req / 60s default)
app.use(rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', name: 'RateLimitExceeded' },
}));

// ── Routes ──────────────────────────────────────────────────────────────
// Health is public (no auth)
app.use('/v1/health', healthRoutes);

// All token routes require authentication
app.use('/v1/tokens', authenticate, tokenRoutes);
app.use('/v1/tokens', authenticate, operationRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', name: 'NotFound' });
});

// Error handler
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────────
app.listen(config.port, config.host, () => {
  console.log(`TokenMint API listening on ${config.host}:${config.port}`);
  console.log(`  Chain ID : ${config.chainId}`);
  console.log(`  RPC      : ${config.rpcUrl}`);
  console.log(`  Factory  : ${config.tokenMintFactoryAddress}`);
  console.log(`  Health   : http://${config.host}:${config.port}/v1/health`);
});

module.exports = app;
