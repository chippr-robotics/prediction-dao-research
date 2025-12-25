# Quick Start Guide - Garden of Eden Seeding Service

This guide will help you get the Garden of Eden testnet seeding service up and running quickly.

## Prerequisites

- Node.js (v18 or higher)
- NPM
- 10 funded accounts on Mordor testnet (or use local network for testing)

## Quick Setup (5 Minutes)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Configure Environment

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your private keys
nano .env  # or use your preferred editor
```

Required configuration:
```env
SEED_PLAYER_1=0x...your_private_key_1...
SEED_PLAYER_2=0x...your_private_key_2...
...
SEED_PLAYER_10=0x...your_private_key_10...
```

⚠️ **Security Warning**: Use testnet accounts only! Never use real production keys.

### Step 3: Fund Your Accounts

Ensure all 10 accounts have ETH on the target network:
- **Mordor Testnet**: Get testnet ETH from a faucet
- **Local Network**: Accounts are pre-funded by Hardhat

Recommended minimum: **10 ETH per account**

### Step 4: Run the Service

**On Local Network (for testing):**
```bash
# Terminal 1: Start local node
npm run node

# Terminal 2: Run seeding script
npm run seed:local
```

**On Mordor Testnet:**
```bash
npm run seed:testnet
```

### Step 5: Monitor Output

You should see:
```
======================================================================
🌱 Garden of Eden - Cycle #1
======================================================================

📊 Creating 2 market(s)...
  ✓ Market created: ID 0

💱 Executing trades...
  ✓ 0xf39Fd6... bought PASS tokens in market 0 for 2.3 ETH

📈 Statistics:
  Total markets created: 2
  Total trades executed: 17
```

## Customization (Optional)

Adjust the seeding behavior in `.env`:

```env
# Create markets every 5 minutes (300000 ms)
SEED_INTERVAL_MS=300000

# Create 3 markets per cycle
SEED_MARKETS_PER_CYCLE=3

# Each player makes up to 5 trades per cycle
SEED_TRADES_PER_CYCLE=5
```

## Stopping the Service

Press `Ctrl+C` to gracefully stop the service. You'll see final statistics:

```
🛑 Shutting down Garden of Eden...
📈 Statistics:
  Total cycles: 42
  Total markets created: 126
  Total trades executed: 847
✓ Goodbye!
```

## Production Deployment

For continuous operation, use a process manager:

**Using PM2 (Recommended):**
```bash
npm install -g pm2
pm2 start npm --name "garden-eden" -- run seed:testnet
pm2 save
```

**Using Docker:**
```bash
docker build -t garden-eden .
docker run -d --name garden-eden --env-file .env garden-eden
```

## Troubleshooting

### "No seed players configured"
→ Ensure `SEED_PLAYER_1` through `SEED_PLAYER_10` are set in `.env`

### "Insufficient balance" errors
→ Check account balances and replenish with testnet ETH

### Markets not being created
→ Verify you're connected to the correct network  
→ Check deployer account has enough ETH for gas

### High gas costs
→ Reduce `SEED_MARKETS_PER_CYCLE` and `SEED_TRADES_PER_CYCLE`  
→ Increase `SEED_INTERVAL_MS` to slow down activity

## What's Happening?

The script continuously:
1. **Creates markets** with random questions and parameters
2. **Simulates trading** with 10 different accounts
3. **Tracks statistics** on markets and trades
4. **Monitors balances** and warns when low
5. **Provides realistic testnet data** for development and testing

## Next Steps

- Review detailed documentation in `GARDEN_OF_EDEN_README.md`
- Monitor your deployment and adjust parameters as needed
- Set up alerts for low balances
- Consider using PM2 or systemd for production reliability

## Getting Help

- Check logs for detailed error messages
- Review `GARDEN_OF_EDEN_README.md` for comprehensive documentation
- Verify network connectivity and contract deployments
- Ensure all accounts are properly funded

---

**Happy Seeding! 🌱**
