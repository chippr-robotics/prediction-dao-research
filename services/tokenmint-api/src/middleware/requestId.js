'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Attach a unique request ID to every request (BitGo / DFNS pattern).
 */
function attachRequestId(req, _res, next) {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  next();
}

module.exports = { attachRequestId };
