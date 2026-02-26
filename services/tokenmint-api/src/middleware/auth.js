'use strict';

const { config } = require('../config');

/**
 * API key authentication middleware.
 *
 * Accepts the key in either:
 *   - Authorization: Bearer <key>   (Fireblocks / BitGo style)
 *   - X-API-Key: <key>              (Blockdaemon / DFNS style)
 */
function authenticate(req, res, next) {
  let apiKey;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7);
  }

  if (!apiKey) {
    apiKey = req.headers['x-api-key'];
  }

  if (!apiKey || !config.apiKeys.includes(apiKey)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid API key required. Provide via Authorization: Bearer <key> or X-API-Key header.',
      requestId: req.requestId,
    });
  }

  next();
}

module.exports = { authenticate };
