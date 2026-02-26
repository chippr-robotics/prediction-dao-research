'use strict';

const { Router } = require('express');
const blockchain = require('../services/blockchain');
const { apiError } = require('../middleware/errorHandler');
const { paginatedResponse, resourceResponse, asyncOperationResponse } = require('../utils/responses');

const router = Router();

// ── POST /v1/tokens — Deploy a new token ────────────────────────────────
// Matches: Fireblocks POST /v1/tokenization/tokens
//          DFNS POST /wallets (wallet-centric creation)
router.post('/', async (req, res, next) => {
  try {
    const { kind, name, symbol, initialSupply, decimals, metadataURI, baseURI, burnable, pausable, listOnDex, externalId } = req.body;

    if (!kind) throw apiError('kind is required (Erc20 or Erc721)');
    if (!name) throw apiError('name is required');
    if (!symbol) throw apiError('symbol is required');

    let result;
    if (kind === 'Erc20') {
      if (!initialSupply) throw apiError('initialSupply is required for Erc20');
      result = await blockchain.createERC20({ name, symbol, initialSupply, decimals, metadataURI, burnable, pausable, listOnDex });
    } else if (kind === 'Erc721') {
      result = await blockchain.createERC721({ name, symbol, baseURI: baseURI || metadataURI, burnable });
    } else {
      throw apiError('kind must be Erc20 or Erc721');
    }

    res.status(201).json(asyncOperationResponse({
      operationId: result.tokenId,
      status: result.status,
      txHash: result.txHash,
      data: {
        tokenId: result.tokenId,
        tokenAddress: result.tokenAddress,
        kind,
        name,
        symbol,
        blockNumber: result.blockNumber,
        externalId: externalId || null,
      },
    }));
  } catch (err) { next(err); }
});

// ── GET /v1/tokens — List tokens ────────────────────────────────────────
// Matches: BitGo GET /api/v2/{coin}/wallet
//          DFNS GET /wallets (paginated list)
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const owner = req.query.owner;

    if (owner) {
      const tokens = await blockchain.getOwnerTokens(owner);
      return res.json(paginatedResponse(tokens, { total: tokens.length, limit: tokens.length, offset: 0 }));
    }

    const { tokens, total } = await blockchain.listTokens({ limit, offset });
    res.json(paginatedResponse(tokens, { total, limit, offset }));
  } catch (err) { next(err); }
});

// ── GET /v1/tokens/:id — Get token details ──────────────────────────────
// Matches: DFNS GET /wallets/{walletId}
//          Fireblocks GET /v1/vault/accounts/{id}/{assetId}
router.get('/:id', async (req, res, next) => {
  try {
    const info = await blockchain.getTokenInfo(req.params.id);
    res.json(resourceResponse(info));
  } catch (err) { next(err); }
});

// ── PATCH /v1/tokens/:id — Update token metadata ───────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const { metadataURI } = req.body;
    if (!metadataURI) throw apiError('metadataURI is required');
    const result = await blockchain.updateMetadata(req.params.id, metadataURI);
    res.json(asyncOperationResponse({
      operationId: req.params.id,
      status: result.status,
      txHash: result.txHash,
      data: { metadataURI },
    }));
  } catch (err) { next(err); }
});

// ── GET /v1/tokens/:id/balance/:address — Get balance ───────────────────
// Matches: DFNS GET /wallets/{walletId}/assets
//          Fireblocks GET /v1/vault/accounts/{id}/{assetId}
//          BitGo GET /api/v2/{coin}/wallet/{walletId} (balance fields)
router.get('/:id/balance/:address', async (req, res, next) => {
  try {
    const balance = await blockchain.getBalance(req.params.id, req.params.address);
    res.json(resourceResponse(balance));
  } catch (err) { next(err); }
});

// ── POST /v1/tokens/:id/estimate-fee — Estimate deployment cost ─────────
// Matches: Blockdaemon POST /tx/v1/{blockchain_id}/tx/estimate-fee
//          DFNS priority field (Slow/Standard/Fast)
router.post('/:id/estimate-fee', async (req, res, next) => {
  try {
    const info = await blockchain.getTokenInfo(req.params.id);
    const fee = await blockchain.estimateFee({
      kind: info.kind,
      name: info.name,
      symbol: info.symbol,
      initialSupply: '1',
      metadataURI: info.metadataURI,
      burnable: info.burnable,
      pausable: info.pausable,
    });
    res.json(resourceResponse(fee));
  } catch (err) { next(err); }
});

module.exports = router;
