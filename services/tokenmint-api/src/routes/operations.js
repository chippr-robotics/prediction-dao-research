'use strict';

const { Router } = require('express');
const blockchain = require('../services/blockchain');
const { apiError } = require('../middleware/errorHandler');
const { asyncOperationResponse } = require('../utils/responses');

const router = Router();

// ── POST /v1/tokens/:id/mint — Mint tokens ──────────────────────────────
// Matches: Fireblocks POST /v1/transactions { operation: "MINT" }
//          Fireblocks POST /v1/tokenization/collections/{id}/tokens/mint
//          BitGo POST /api/stablecoin/v1/enterprise/{id}/order { type: "mint" }
router.post('/:id/mint', async (req, res, next) => {
  try {
    const { to, amount, uri, externalId } = req.body;
    if (!to) throw apiError('to address is required');

    const result = await blockchain.mintTokens(req.params.id, { to, amount, uri });

    res.status(201).json(asyncOperationResponse({
      operationId: `mint-${req.params.id}-${Date.now()}`,
      status: result.status,
      txHash: result.txHash,
      data: {
        tokenId: req.params.id,
        to,
        amount: amount || null,
        uri: uri || null,
        blockNumber: result.blockNumber,
        externalId: externalId || null,
      },
    }));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/:id/burn — Burn tokens ──────────────────────────────
// Matches: Fireblocks POST /v1/transactions { operation: "BURN" }
router.post('/:id/burn', async (req, res, next) => {
  try {
    const { amount, nftTokenId, externalId } = req.body;

    const result = await blockchain.burnTokens(req.params.id, { amount, nftTokenId });

    res.status(201).json(asyncOperationResponse({
      operationId: `burn-${req.params.id}-${Date.now()}`,
      status: result.status,
      txHash: result.txHash,
      data: {
        tokenId: req.params.id,
        amount: amount || null,
        nftTokenId: nftTokenId || null,
        blockNumber: result.blockNumber,
        externalId: externalId || null,
      },
    }));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/:id/transfer — Transfer tokens ─────────────────────
// Matches: Fireblocks POST /v1/transactions { operation: "TRANSFER" }
//          BitGo POST /api/v2/{coin}/wallet/{walletId}/sendcoins
//          Blockdaemon POST /tx/v1/{blockchain_id}/tx/create-token
//          DFNS POST /wallets/{walletId}/transfers
router.post('/:id/transfer', async (req, res, next) => {
  try {
    const { from, to, amount, nftTokenId, externalId, priority } = req.body;
    if (!to) throw apiError('to address is required');

    const result = await blockchain.transferTokens(req.params.id, { from, to, amount, nftTokenId });

    res.status(201).json(asyncOperationResponse({
      operationId: `transfer-${req.params.id}-${Date.now()}`,
      status: result.status,
      txHash: result.txHash,
      data: {
        tokenId: req.params.id,
        from: from || null,
        to,
        amount: amount || null,
        nftTokenId: nftTokenId || null,
        blockNumber: result.blockNumber,
        priority: priority || 'Standard',
        externalId: externalId || null,
      },
    }));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/:id/pause — Pause token (ERC-20 only) ──────────────
// Matches: Fireblocks contract_call with pause function
router.post('/:id/pause', async (req, res, next) => {
  try {
    const result = await blockchain.pauseToken(req.params.id);
    res.json(asyncOperationResponse({
      operationId: `pause-${req.params.id}`,
      status: result.status,
      txHash: result.txHash,
    }));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/:id/unpause — Unpause token (ERC-20 only) ──────────
router.post('/:id/unpause', async (req, res, next) => {
  try {
    const result = await blockchain.unpauseToken(req.params.id);
    res.json(asyncOperationResponse({
      operationId: `unpause-${req.params.id}`,
      status: result.status,
      txHash: result.txHash,
    }));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/:id/list-on-dex — List on DEX ──────────────────────
router.post('/:id/list-on-dex', async (req, res, next) => {
  try {
    const result = await blockchain.listOnDex(req.params.id);
    res.json(asyncOperationResponse({
      operationId: `dex-${req.params.id}`,
      status: result.status,
      txHash: result.txHash,
    }));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/estimate-fee — Estimate creation cost ───────────────
// Matches: Blockdaemon POST /tx/v1/{blockchain_id}/tx/estimate-fee
router.post('/estimate-fee', async (req, res, next) => {
  try {
    const fee = await blockchain.estimateFee(req.body);
    res.json({ data: fee });
  } catch (err) { next(err); }
});

module.exports = router;
