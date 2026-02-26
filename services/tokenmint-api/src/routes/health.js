'use strict';

const { Router } = require('express');
const blockchain = require('../services/blockchain');

const router = Router();

// ── GET /v1/health — Service health check ───────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const chain = await blockchain.healthCheck();
    res.json({
      status: 'healthy',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      blockchain: chain,
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message,
    });
  }
});

module.exports = router;
