# Quickstart

## Run the exporter locally

```bash
npm test --workspace fairwins-finops-exporter
node services/finops-exporter/src/server.js
```

With no configuration it boots and reports every source as `not-configured`. That is the correct
output and worth looking at once — it is the shape every panel takes before a credential lands.

```bash
curl -s localhost:9464/status | jq '.sources'          # three-state verdict per source
curl -s localhost:9464/v1/finops/summary | jq          # totals + completeness
curl -s localhost:9464/metrics | head -40
```

## Point it at real data

Nothing below is a secret; all four credentials come from Secret Manager in operation.

```bash
export FINOPS_COHORT_CHAIN_IDS=137
export RPC_URLS_137=https://polygon-bor-rpc.publicnode.com
export PAYMASTER_ADDRESS_137=0xe14554D14eB5DeC47f7824ebeeDa6C9f3A50d105
export GAS_WALLET_137=0x3BB28b184b8a748dE22aBD076634F85adADA82db
# Optional — each unset one stays honestly `not-configured`:
# FEE_ROUTER_ADDRESS, MEMBERSHIP_MANAGER_ADDRESS, BUNDLER_EXECUTOR_137
# GCP_PROJECT_ID, CLOUDFLARE_ANALYTICS_TOKEN + CLOUDFLARE_ZONE_ID, QUICKNODE_API_KEY
node services/finops-exporter/src/server.js
```

## Dashboards

```bash
npm run finops:generate     # catalogue -> infra/grafana/ (COMMITTED; never hand-edit)
npm run check:finops        # coverage + freshness gate

GRAFANA_URL=https://<stack>.grafana.net GRAFANA_API_TOKEN=... \
  npm run finops:provision -- --dry-run
```

## Provisioning credentials (one-time)

```bash
# Grafana Cloud: create a stack, then an access policy token with dashboards:write + rules:write.
printf '%s' "$TOKEN" | gcloud secrets create finops-grafana-cloud-token \
  --project=chippr-bots-site-wp --data-file=- --replication-policy=automatic

# Cloudflare: scoped API token, Zone -> Analytics: Read. NOT a Global API Key (cannot be scoped).
printf '%s' "$TOKEN" | gcloud secrets create finops-cloudflare-token \
  --project=chippr-bots-site-wp --data-file=- --replication-policy=automatic

# QuickNode: Admin API key.
printf '%s' "$TOKEN" | gcloud secrets create finops-quicknode-key \
  --project=chippr-bots-site-wp --data-file=- --replication-policy=automatic
```

The containers are declared in `terraform.tfvars` (`managed_secret_ids`); payloads are never in
Terraform state (guardrail G-04). Restart the stack afterwards — secrets are read at boot.

## Add a source

```bash
$EDITOR packages/finops-catalogue/src/sources.js
npm run finops:generate && npm run check:finops
```

The gate names the file and the edit for anything still missing.
