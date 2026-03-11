'use strict';

/**
 * Standard paginated list response (BitGo / Blockdaemon style).
 */
function paginatedResponse(items, { total, limit, offset }) {
  return {
    data: items,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    },
  };
}

/**
 * Wrap a single resource in a standard envelope.
 */
function resourceResponse(data) {
  return { data };
}

/**
 * Standard async-operation response (Fireblocks / DFNS style).
 * Returned when a blockchain tx has been submitted but not yet confirmed.
 */
function asyncOperationResponse({ operationId, status, txHash, data }) {
  return {
    id: operationId,
    status,
    txHash: txHash || null,
    data: data || null,
  };
}

module.exports = { paginatedResponse, resourceResponse, asyncOperationResponse };
