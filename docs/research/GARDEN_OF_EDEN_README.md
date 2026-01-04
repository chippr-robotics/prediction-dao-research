# Garden of Eden - Testnet Seeding Service

This service seeds the Mordor testnet with dummy data and markets to simulate realistic usage of the prediction market platform. It creates markets and simulates trading activity with multiple actors over an extended period of time.

## Overview

The Garden of Eden script:
- Creates prediction markets periodically with varied parameters
- Simulates trading activity with 10 seed accounts
- Randomly buys and sells positions to simulate market activity
- Runs continuously as a long-running service
- Assumes accounts will be periodically replenished

## Setup

### 1. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure:

**Seed Players (Required):**
Set private keys for 10 seed accounts:
```env
SEED_PLAYER_1=0x...
SEED_PLAYER_2=0x...
...
SEED_PLAYER_10=0x...
```

**Configuration (Optional):**
```env
SEED_INTERVAL_MS=300000        # Cycle interval (5 minutes default)
SEED_MARKETS_PER_CYCLE=3       # Markets created per cycle
SEED_TRADES_PER_CYCLE=5        # Trades per actor per cycle
MARKET_FACTORY_ADDRESS=0x...   # Reuse deployed factory (optional)
```

### 2. Fund Seed Accounts

Ensure all 10 seed accounts have sufficient ETH on the target network:
- Minimum: ~10 ETH per account recommended
- The script will warn when accounts have low balance
- Accounts should be periodically replenished

### 3. Compile Contracts

```bash
npm run compile
```

## Usage

### Run on Mordor Testnet

```bash
npm run seed:testnet
```

This will:
1. Connect to Mordor testnet
2. Deploy or connect to MarketFactory
3. Start the seeding service
4. Run continuously until stopped (Ctrl+C)

### Run on Local Network

For testing, run on a local Hardhat node:

```bash
# Terminal 1: Start local node
npm run node

# Terminal 2: Run seeding script
npm run seed:local
```

## Service Behavior

### Market Creation

Each cycle creates 3 markets (configurable) with:
- Random questions from template pool
- Varied liquidity (10-100 ETH)
- Varied trading periods (7-21 days)
- Different liquidity parameters (100, 500, 1000, 2000)

Market templates include:
- Crypto price predictions
- Protocol governance questions
- Technical milestones
- TVL and adoption metrics

### Trading Simulation

Each cycle, actors randomly:
- Select active markets
- Buy PASS or FAIL tokens (50/50 probability)
- Use random trade amounts (0.1-5 ETH)
- Make 1-5 trades per cycle

### Statistics

The service displays:
- Current cycle number
- Total markets created
- Total trades executed
- Average activity per cycle
- Player balances (periodically)

## Output Example

```
======================================================================
🌱 Garden of Eden - Cycle #42
   2025-12-25T22:30:00.000Z
======================================================================

📊 Creating 3 market(s)...
  Creating market 1/3:
    Question: Will ETH price exceed $5000 by Q2 2025?
    Liquidity: 45.5 ETH
    Trading period: 14 days
    ✓ Market created: ID 125

💱 Executing trades...
  Found 38 active market(s)
  ✓ 0x1234abcd... bought PASS tokens in market 125 for 2.3 ETH
  ✓ 0x5678ef01... bought FAIL tokens in market 118 for 1.7 ETH

📈 Statistics:
  Total cycles: 42
  Total markets created: 126
  Total trades executed: 847
  Avg markets per cycle: 3.00
  Avg trades per cycle: 20.17

⏱  Cycle completed in 45.2s
   Next cycle in 300s
```

## Production Deployment

For continuous operation on testnet:

### Using PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start service
pm2 start npm --name "garden-eden" -- run seed:testnet

# View logs
pm2 logs garden-eden

# Stop service
pm2 stop garden-eden

# Restart service
pm2 restart garden-eden

# Auto-restart on server reboot
pm2 startup
pm2 save
```

### Using systemd (Linux)

Create `/etc/systemd/system/garden-eden.service`:

```ini
[Unit]
Description=Garden of Eden Testnet Seeding Service
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/prediction-dao-research
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run seed:testnet
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable garden-eden
sudo systemctl start garden-eden
sudo systemctl status garden-eden
```

### Using Docker

```dockerfile
FROM node:18

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run compile

CMD ["npm", "run", "seed:testnet"]
```

```bash
docker build -t garden-eden .
docker run -d --name garden-eden --env-file .env garden-eden
docker logs -f garden-eden
```

## Monitoring

### Key Metrics to Monitor

1. **Account Balances**: Ensure seed accounts don't run out of ETH
2. **Market Creation Rate**: Verify markets are being created
3. **Trade Success Rate**: Check for failed trades
4. **Gas Costs**: Monitor gas usage and costs
5. **Network Connectivity**: Ensure stable connection to network

### Alerts

Set up alerts for:
- Low balance warnings (< 1 ETH)
- Failed market creation
- Script crashes or exits
- Network disconnections

## Troubleshooting

### "No seed players configured"
- Ensure `SEED_PLAYER_1` through `SEED_PLAYER_10` are set in `.env`
- Check that private keys are valid hex strings (64 characters)

### "Insufficient balance" errors
- Check account balances on the network
- Replenish accounts with ETH
- The script checks balances every 5 cycles

### "Trading period ended" errors
- This is normal - markets eventually expire
- The script automatically skips expired markets
- New markets are continuously created

### High gas costs
- Reduce `SEED_MARKETS_PER_CYCLE` and `SEED_TRADES_PER_CYCLE`
- Increase `SEED_INTERVAL_MS` for less frequent cycles
- Use less expensive trade amounts

### Script hangs or crashes
- Check network connectivity
- Review error logs
- Ensure contracts are properly deployed
- Verify Hardhat configuration

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_PLAYER_1` - `SEED_PLAYER_10` | Required | Private keys for seed accounts |
| `SEED_INTERVAL_MS` | 300000 | Time between cycles (ms) |
| `SEED_MARKETS_PER_CYCLE` | 3 | Markets created per cycle |
| `SEED_TRADES_PER_CYCLE` | 5 | Max trades per actor per cycle |
| `MARKET_FACTORY_ADDRESS` | Auto-deploy | Reuse existing factory |

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit `.env` file** - It contains private keys
2. **Use test accounts only** - Don't use real production keys
3. **Fund minimally** - Only add ETH as needed
4. **Monitor activity** - Watch for unexpected behavior
5. **Secure server** - If running as a service, secure the host

## Support

For issues or questions:
- Check logs for detailed error messages
- Review this README and troubleshooting section
- Verify network and account configuration
- Ensure contracts are properly deployed
