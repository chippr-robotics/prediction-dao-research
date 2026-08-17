# Runbook: credential rotation and connected systems

Every credential the FairWins estate holds, what breaks when it is wrong, and how to rotate it
without an outage.

> **Measured, not asserted — 2026-08-16.** The inventory below was read from the live project with
> `gcloud secrets list` and cross-referenced against the code that actually consumes each one
> (`infra/vm/common/fetch-secrets.sh`, `infra/vm/*/docker-compose.yml`, `scripts/secrets/registry.js`).
> Re-run the commands in [Keeping this current](#keeping-this-current) after any change.

> **⚠️ The GCP project is SHARED.** `chippr-bots-site-wp` holds 73 secrets, and **only about half
> are FairWins'**. The rest belong to unrelated Chippr workloads (Clerk, Neo4j, OpenAI, GraphRAG,
> OpenSpiel, Redis). **Never rotate or delete a secret that is not in the tables below** — you will
> break a workload you cannot see from this repository.

---

## The three rules that decide everything

**1. Secrets are read at BOOT, into tmpfs.** `fetch-secrets.sh` writes one env file per container
into `/run/fairwins/` and the containers read it at start. **Adding a secret version changes
nothing until the stack restarts.** There is no hot reload, by design — a credential that can be
swapped under a running process can also be swapped by someone else.

```bash
gcloud compute ssh fairwins-gateway --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo systemctl restart fairwins-secrets@gateway && sudo systemctl restart fairwins-stack@gateway'
```

**Restart the whole unit, never one container.** All containers on a node share one network
namespace; recreating the namespace owner invalidates the joiners and leaves a stack that looks
healthy and is not.

**2. Two secrets are VERSION-PINNED. Rotating them requires a code change.**

| Secret | Pinned to | Consumed as |
|---|---|---|
| `relay-webhook-secret` | **version 2** | `WEBHOOK_SHARED_SECRET` (gateway), `WEBHOOK_SIGNING_KEY` (engine) |
| `relay-engine-api-key` | **version 2** | `ENGINE_API_KEY` (gateway), `API_KEY` (engine) |

Adding version 3 does **nothing** — the pin still fetches 2. You must edit `fetch-secrets.sh` and
deploy it. The pin exists because both are shared between two containers that must agree: an
unpinned `latest` would let them pick up a new version at different restarts, and the engine would
silently reject every webhook the gateway signed.

**3. Every secret is REQUIRED or OPTIONAL, and the difference is an availability decision.**
A missing **required** secret aborts the boot. A missing **optional** one is skipped with a notice
and that feature degrades honestly. Losing Collect, Predict or FinOps must never take down the
gasless relay path — the never-stranded rule.

---

## Rotation matrix

### Runtime — gateway VM

| Secret | Consumer | Req. | Rotate when | Breaks if wrong |
|---|---|---|---|---|
| `origin-lock-secret` | gateway nginx, bundler nginx | required | quarterly, or on exposure | Cloudflare→origin requests rejected. **Rotate at Cloudflare and here together** — the transform rule injects it. |
| `relay-webhook-secret` | gateway + engine | required, **pinned v2** | on exposure | Engine POSTs confirmations the gateway rejects. Intents report `submitted` forever. |
| `relay-engine-api-key` | gateway + engine | required, **pinned v2** | on exposure | Gateway cannot submit to the engine. All gasless relaying stops. |
| `relay-engine-gcp-private-key` | engine only | required | on exposure | KMS signing fails on **both** hot gas keys. Never let the public-facing gateway container see this. |
| `OPENSEA_API_KEY` | gateway | optional | on exposure | Collect degrades to 503; SPA hides the tab. |
| `POLYMARKET_API_KEY` / `_SECRET` / `_PASSPHRASE` / `_ADDRESS` | gateway, finops | optional | on exposure | Predict feed degrades to 503. |

### Runtime — bundler VM

| Secret | Consumer | Req. | Notes |
|---|---|---|---|
| `alto-executor-key-137` | alto (executor **and** utility key) | required | **Hot key holding real POL.** Rotating means funding a new EOA and draining the old one — not a config change. See `docs/runbooks/relayer-operations.md`. |
| `origin-lock-secret` | bundler nginx | optional (fail-open) | Fail-open by design: an unavailable secret disables enforcement rather than 403-bricking the bundler. |

### FinOps (spec 089)

All **optional** — an absent credential makes that source `not-configured`, a first-class honest
state, never a fabricated zero.

| Secret | Consumer | Rotate when | Breaks if wrong |
|---|---|---|---|
| `finops-grafana-cloud-token` | Alloy → Grafana Cloud | on exposure | **Must be a `glc_` Cloud Access Policy token with `metrics:write`.** A `glsa_` stack token returns 401 and Alloy ships nothing while looking healthy. |
| `finops-cloudflare-token` | exporter | on exposure | **Needs Zone → Analytics → Read** on the zone. Without that exact permission the GraphQL call fails `authz` even though the token authenticates — and `/user/tokens/verify` misleads you by returning "Invalid API Token" for a token that is merely narrowly scoped. **Diagnose with the GraphQL call, not verify.** |
| `finops-quicknode-key` | exporter | when the plan is upgraded | Container exists with **no enabled version** — deliberately. That is the correct "not configured yet"; a placeholder string like `null` would be truthy and produce a 401 that alerts. |
| `GAFANA_SERVICE_ACCOUNT` | `npm run finops:provision` (**ops only, never on the VM**) | on exposure | **Must be a `glsa_` stack service-account token.** A `glc_` token cannot provision — `/api/folders` returns 401. |

> **⚠️ Grafana needs TWO different tokens and they are not interchangeable.** `glc_` (Cloud Access
> Policy, `metrics:write`) ships metrics; `glsa_` (stack service account) provisions dashboards.
> Using one for the other's job fails in a way that looks like a working deploy: Alloy scrapes
> happily and every sample 401s into the void.
>
> **The provisioning secret is misspelled `GAFANA_SERVICE_ACCOUNT`** (no `R`). Renaming needs a
> coordinated update; until then, use it verbatim.

### Workstation — operator only, never on a VM

Read through `npm run sec <profile>`; see `scripts/secrets/registry.js`, which is the inventory.

| Secret | Purpose |
|---|---|
| `fairwins-deployer-key` / `fairwins-creator-key` | Contract deployment and admin. **Real funds.** |
| `fairwins-floppy-keystore-password` / `-mordor-` / `-nazgul-prime-` | Air-gapped floppy keystore passphrases. |
| `fairwins-etherscan-api-key` | Contract verification. |
| `fairwins-graph-api-key` / `-graph-deploy-key` | Subgraph query / deploy. Deploy ≠ query key. |
| `fairwins-pinata-jwt` | IPFS pinning for mini-app packages. |
| `fairwins-quicknode-polygon-url` / `-token` | Archive RPC. |
| `fairwins-seed-player-keys` | Testnet seeding. Testnet only. |

---

## Connected external systems

| System | Reaches us how | Credential | Failure mode |
|---|---|---|---|
| **Cloudflare** (zone `fairwins.app`) | DNS, TLS, WAF geo gate (HTTP 451 — a legal control), origin-lock transform rule | `origin-lock-secret` (shared header), `finops-cloudflare-token` (analytics read) | Geo gate is compliance-critical. Origin lock rotation must be simultaneous both sides. |
| **Grafana Cloud** (`chippr.grafana.net`, Prom instance `3500268`) | Alloy pushes; we never expose an endpoint | `glc_` (write) + `glsa_` (provision) | Wrong token type ⇒ silent 401, no data, dashboards look empty. |
| **GCP BigQuery** billing export | Exporter queries `billing_export.gcp_billing_export_v1_*` | Workload identity — the gateway node's SA, **no stored token** | Newly enabled exports take **hours** to produce a first table and never backfill. |
| **QuickNode** | Exporter reads credit usage; SPA/relayer read RPC | `finops-quicknode-key`, `fairwins-quicknode-polygon-*` | Reports credits, never dollars — cost is `modelled`. |
| **Polymarket CLOB** | Gateway proxies public reads; members sign their own orders | 4 `POLYMARKET_API_*` | Predict degrades to 503; SPA hides the tab. |
| **OpenSea** | Gateway proxies collectible reads | `OPENSEA_API_KEY` | Collect degrades to 503. |
| **The Graph** | Subgraph queries/deploys | `fairwins-graph-*` | Wager history degrades to direct chain reads. |
| **Pinata / IPFS** | Mini-app package pinning | `fairwins-pinata-jwt` | Publishing blocked; already-published CIDs unaffected. |
| **GitHub Actions** | CI and (nominally) infra apply | Workload Identity Federation — **no stored key** | See the caveat below. |

> **⚠️ `infra-apply` has never run.** It is gated on repository variables `WIF_PROVIDER` and
> `TF_APPLY_SERVICE_ACCOUNT`, which are unset — so every Terraform change merges and silently does
> nothing. Do not assume a merged infra PR has been applied. Verified 2026-08-16.

---

## Rotating a credential — the procedure

```bash
# 1. Add a new version. NEVER edit a payload in place; a new version is revertible.
printf '%s' "$NEW_VALUE" | gcloud secrets versions add <secret-name> \
  --project=chippr-bots-site-wp --data-file=-

# 2. If the secret is VERSION-PINNED (see rule 2), edit the pin in
#    infra/vm/common/fetch-secrets.sh and ship it through staging → main FIRST.

# 3. Restart the node that consumes it. Secrets are read at boot.
gcloud compute ssh fairwins-gateway --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo systemctl restart fairwins-secrets@gateway && sudo systemctl restart fairwins-stack@gateway'

# 4. Verify delivery — names only, never values.
gcloud compute ssh fairwins-gateway --zone=us-central1-a --tunnel-through-iap \
  --command 'sudo journalctl -u fairwins-secrets@gateway -n 30 --no-pager | grep "<-"'

# 5. Confirm the consumer is healthy.
curl -s localhost:9464/status | jq '.config.credentials'   # FinOps: presence only
```

**Disable the old version only after verifying**, then destroy it later. Disabling is instantly
reversible; destroying is not.

```bash
gcloud secrets versions disable <old-version> --secret=<secret-name> --project=chippr-bots-site-wp
```

---

## Secret hygiene — two rules learned the hard way

**1. ONE credential lives in exactly ONE secret.**

A working Cloudflare token was created as `FINOPS-CLOUDFLARE` while `fetch-secrets.sh` reads
`finops-cloudflare-token`. The result was three days of "the token lacks a permission" — a correct
statement about the wrong secret. Meanwhile the real token sat unused, with **no IAM bindings at
all**, so nothing could have read it even if the name had matched.

The failure is not the typo, it is the duplication: two secrets holding one credential means
rotating either leaves the other stale, and nothing reports the divergence. When you find a
duplicate, copy the value into the canonical name and **disable** the other — the canonical name is
whichever one appears in `gateway_secret_ids` and `fetch-secrets.sh`.

```bash
# Copy between secrets without the value touching a variable, a file, or argv
gcloud secrets versions access latest --secret=<wrong-name> --project=chippr-bots-site-wp \
  | gcloud secrets versions add <canonical-name> --project=chippr-bots-site-wp --data-file=-
```

**2. Disable superseded versions. `latest` is not the only thing that reads them.**

A pinned consumer (rule 2 above) fetches an explicit version, and a rollback re-reads whatever is
enabled. Leaving a known-bad version enabled means a future restart can silently pick it up.

```bash
# What is enabled right now, per secret
for s in finops-cloudflare-token finops-quicknode-key finops-grafana-cloud-token; do
  echo "$s:"; gcloud secrets versions list "$s" --project=chippr-bots-site-wp \
    --format='value(name,state)' | sed 's/^/  v/'
done
```

**Never `destroy` a version to tidy up.** Disabled is reversible and costs nothing; destroyed is
gone, and the one time it matters is the incident where you need the previous value back.

### Known duplicates and strays — 2026-08-17

| Secret | State | Why |
|---|---|---|
| `FINOPS-CLOUDFLARE` | **disabled** | Held the working token under a non-canonical name. Value copied to `finops-cloudflare-token` v2. Container kept; nothing references it. |
| `finops-cloudflare-token` v1 | **disabled** | The token without `analytics.read`. Disabled so a rollback cannot resurrect it. v2 is live. |
| `chippr_cloudflare_ApiToken` | in use elsewhere | A **different** Cloudflare token: authenticates but has no `analytics.read`. Not ours to rotate — audited 2026-08-17 while hunting for the analytics token. |
| `chippr_cloudflare_s3_api`, `_access_key_id`, `chippr-cloudflare-secrect-access-key` | in use elsewhere | R2/S3 credentials, not API tokens. |
| `GRAFANA_PROM_*` (5), `GRAFANA_GRAFANA_ALLOWLIST_API_ENDPOINT` | unused by this repo | Endpoint/identifier values that now live in `docker-compose.yml` as plain config. Candidates for removal once confirmed unused by other workloads. |

---

## Deploying a change to the VMs

**Updating `/opt/fairwins/repo` is not enough.** The stack runs from *deployed copies* at
`/opt/fairwins/{common,<role>}/`. Ansible's `common` role syncs them; without that step a compose
change appears to deploy and silently does nothing.

```bash
gcloud compute ssh fairwins-gateway --zone=us-central1-a --tunnel-through-iap --command '
  cd /opt/fairwins/repo && sudo git fetch origin main --quiet && sudo git reset --hard origin/main --quiet
  sudo rsync -a --delete --chmod=D0755,F0755 /opt/fairwins/repo/infra/vm/common/  /opt/fairwins/common/
  sudo rsync -a --delete --chmod=D0755,F0755 /opt/fairwins/repo/infra/vm/gateway/ /opt/fairwins/gateway/
  sudo systemctl restart fairwins-secrets@gateway && sudo systemctl restart fairwins-stack@gateway'
```

**The VM tracks `main` only** — its clone is shallow with a `main`-restricted refspec. Work on
`staging` cannot be deployed; it must be promoted first.

---

## Keeping this current

```bash
# Every secret in the project (includes other workloads — check ownership before acting)
gcloud secrets list --project=chippr-bots-site-wp --format='value(name)' | sort

# What the VMs actually consume, with version pins
grep -E '^\s+emit ' infra/vm/common/fetch-secrets.sh \
  | awk '{printf "%-28s %-30s ver=%-8s %s\n", $3, $4, $5, $6}'

# Who can read a given secret
gcloud secrets get-iam-policy <secret-name> --project=chippr-bots-site-wp

# Workstation inventory
node -e "console.log(Object.keys(require('./scripts/secrets/registry.js')))"
```

See also: `docs/runbooks/finops-operations.md`, `docs/runbooks/relayer-operations.md`,
`docs/runbooks/infrastructure-operations.md`, and the estate diagrams in `chippr-tf-modules`
(`docs/architecture/estate.md`, section 3).
