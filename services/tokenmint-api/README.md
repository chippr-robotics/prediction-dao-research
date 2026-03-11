# TokenMint API

Institutional-grade tokenization REST API for deploying and managing ERC-20 and ERC-721 tokens through the on-chain `TokenMintFactory` contract. The API surface is compatible with [Fireblocks](https://docs.fireblocks.com/), [BitGo](https://developers.bitgo.com/), [Blockdaemon](https://docs.blockdaemon.com/reference/overview-tokenization-api), and [DFNS](https://docs.dfns.co/) endpoint conventions so it can serve as a drop-in backend for front-ends already targeting those providers.

## Prerequisites

| Requirement | Minimum version |
|---|---|
| Node.js | 20+ |
| Docker & Docker Compose | any recent version |
| A running JSON-RPC node | Hardhat, Geth, etc. |
| Deployed `TokenMintFactory` contract | address required in `.env` |

## Quick start (local, no Docker)

```bash
cd services/tokenmint-api
cp .env.example .env          # edit values as needed
npm install
npm start                     # http://localhost:3000
```

For development with auto-reload:

```bash
npm run dev
```

## Docker deployment

### Build and run

```bash
cd services/tokenmint-api
cp .env.example .env          # fill in real values
docker compose up --build
```

The container:

- Runs as a non-root `tokenmint` user.
- Exposes port **3000** (configurable via `PORT` in `.env`).
- Includes a built-in health check (`GET /v1/health`) polled every 30 seconds.
- Uses `host.docker.internal` to reach a local Hardhat node on the host machine.

### Rebuild after code changes

```bash
docker compose up --build -d
```

### Tear down

```bash
docker compose down
```

## Configuration

All settings are controlled via environment variables. Copy `.env.example` to `.env` and adjust:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | no | `3000` | HTTP listen port |
| `HOST` | no | `0.0.0.0` | Bind address |
| `RPC_URL` | **yes** | `http://127.0.0.1:8545` | JSON-RPC endpoint |
| `CHAIN_ID` | no | `1337` | Target chain ID |
| `SIGNER_PRIVATE_KEY` | **yes** | — | Private key of the factory operator account |
| `TOKEN_MINT_FACTORY_ADDRESS` | **yes** | — | Deployed `TokenMintFactory` contract address |
| `API_KEYS` | **yes** | — | Comma-separated list of valid API keys |
| `RATE_LIMIT_WINDOW_MS` | no | `60000` | Rate-limit sliding window (ms) |
| `RATE_LIMIT_MAX` | no | `100` | Max requests per window |
| `LOG_LEVEL` | no | `info` | Logging verbosity |

## Authentication

Every request (except `/v1/health`) requires an API key via one of:

- `Authorization: Bearer <key>` (Fireblocks / BitGo style)
- `X-API-Key: <key>` (Blockdaemon / DFNS style)

## API endpoints

### Health (public)

| Method | Path | Description |
|---|---|---|
| `GET` | `/v1/health` | Service and blockchain connectivity status |

### Tokens (authenticated)

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/tokens` | Deploy a new ERC-20 or ERC-721 token |
| `GET` | `/v1/tokens` | List tokens (supports `?limit=`, `?offset=`, `?owner=`) |
| `GET` | `/v1/tokens/:id` | Get token details by factory ID |
| `PATCH` | `/v1/tokens/:id` | Update token metadata URI |
| `GET` | `/v1/tokens/:id/balance/:address` | Get balance for an address |
| `POST` | `/v1/tokens/:id/estimate-fee` | Estimate gas cost for a token |
| `POST` | `/v1/tokens/estimate-fee` | Estimate gas for a new deployment |

### Operations (authenticated)

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/tokens/:id/mint` | Mint tokens (ERC-20: amount, ERC-721: to + uri) |
| `POST` | `/v1/tokens/:id/burn` | Burn tokens (ERC-20: amount, ERC-721: nftTokenId) |
| `POST` | `/v1/tokens/:id/transfer` | Transfer tokens to another address |
| `POST` | `/v1/tokens/:id/pause` | Pause a pausable ERC-20 token |
| `POST` | `/v1/tokens/:id/unpause` | Unpause a paused ERC-20 token |
| `POST` | `/v1/tokens/:id/list-on-dex` | List an ERC-20 token on ETCSwap DEX |

## Usage examples

### Deploy an ERC-20 token

```bash
curl -X POST http://localhost:3000/v1/tokens \
  -H "Authorization: Bearer dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "Erc20",
    "name": "My Token",
    "symbol": "MTK",
    "initialSupply": "1000000",
    "burnable": true,
    "pausable": true
  }'
```

### Mint tokens

```bash
curl -X POST http://localhost:3000/v1/tokens/1/mint \
  -H "X-API-Key: dev-key-1" \
  -H "Content-Type: application/json" \
  -d '{ "to": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "amount": "500" }'
```

### Check balance

```bash
curl http://localhost:3000/v1/tokens/1/balance/0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  -H "Authorization: Bearer dev-key-1"
```

## Project structure

```
services/tokenmint-api/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
└── src/
    ├── index.js              # Express app entry point
    ├── config.js             # Environment config + validation
    ├── middleware/
    │   ├── auth.js           # API key authentication
    │   ├── errorHandler.js   # Centralized error handler
    │   └── requestId.js      # Unique request ID per request
    ├── routes/
    │   ├── health.js         # GET /v1/health
    │   ├── tokens.js         # CRUD token endpoints
    │   └── operations.js     # mint / burn / transfer / pause
    ├── services/
    │   └── blockchain.js     # ethers.js contract interactions
    └── utils/
        └── responses.js      # Standardized response envelopes
```

## Security notes

- The Docker image runs as a non-root user (`tokenmint`).
- The `SIGNER_PRIVATE_KEY` should be a dedicated operations key, never a treasury key.
- Never commit `.env` files containing real keys to version control.
- Rate limiting is enabled by default (100 req/min).
- Helmet.js sets secure HTTP headers automatically.
