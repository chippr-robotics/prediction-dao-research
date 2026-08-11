# Runbook: Cloud Run → GCE VM migration (bundler + relay gateway)

Moves `fairwins-alto-bundler` and `fairwins-relay-gateway` off Cloud Run onto **two `e2-small` VMs**,
one service per VM. The relayer is **optional gas infrastructure** — it can censor, never steal — and
every flow keeps a self-submit fallback, so the worst failure mode of most of this is "members pay
their own gas". The one exception is called out in Step 5.

| | Cloud Run (post-right-sizing) | Two VMs |
|---|---|---|
| Cost | $103.81/mo | ~$32/mo |
| Bundler | 1.0 vCPU / 1.0 GiB, minScale 1 | `fairwins-bundler`, e2-small |
| Gateway | 1.0 vCPU / 0.75 GiB, minScale 1 | `fairwins-gateway`, e2-small |
| Bundler identity | `266380754692-compute@` (**roles/editor**) | **new** `fairwins-bundler@` (minimal) |
| Gateway identity | `fairwins-relay-engine@` | `fairwins-relay-engine@` (unchanged) |

Both platforms run in parallel during the soak, so the bill is **additive** (~$136/mo) until
decommission. That is the price of a warm rollback; see Step 7.

---

## The one invariant that must never break

**Exactly one alto process may ever run against `alto-executor-key-137`.**

`ALTO_EXECUTOR_PRIVATE_KEYS` and `ALTO_UTILITY_PRIVATE_KEY` both resolve to that same secret, so a
second alto is a second executor on one EOA: colliding nonces, stuck bundles, and — because
`ALTO_DEPLOY_SIMULATIONS_CONTRACT=true` — even a cold start can emit a transaction from that wallet.
There is no in-band detection; both instances look healthy.

**Three independent paths re-arm Cloud Run. `--min-instances=0` alone is NOT sufficient.**

| # | Path | Why it re-arms | Neutralised by |
|---|---|---|---|
| 1 | `min-instances=0` + `ingress: all` | Any public request cold-starts an instance. The origin lock runs *inside* the container, so a request that gets 403'd has **already started an alto**. | also set `--ingress=internal` |
| 2 | `.claude/skills/fairwins-infra/manage.sh up` | `cmd_scale up` runs `--min-instances=1`, which starts an instance regardless of ingress. The skill's own description tells you to run it before testing gasless transactions. | neuter the skill **before** cutover |
| 3 | Merge to `main` | `cloudbuild.yaml` renders `services/alto-bundler/deploy/service.yaml` and runs `services replace`, restoring **both** `minScale: "1"` **and** `ingress: all`. | delete the build step in the cutover commit |

`infra/vm/bundler/single-alto-gate.sh` enforces #1 as `ExecStartPre` (the VM refuses to start alto if
Cloud Run could serve one) and re-checks every 60s from `probe.sh`, so a merge that re-arms Cloud Run
pages within a minute. It cannot *prevent* #3 — only the commit can.

### The same trap, inverted — read before you roll back

Once the cutover commit lands, the repo manifest is the **disarmed** form. So during any period when
Cloud Run is supposed to be *serving* — i.e. after a bundler rollback — **the next merge to `main`
will silently disarm the bundler you just rolled back to**, and `bundler.fairwins.app` goes dark.

A bundler rollback is therefore a **three**-part action:

1. stop the VM's alto,
2. re-arm Cloud Run (`--min-instances=1 --ingress=all`), and
3. either hold merges to `main`, or land a revert restoring `ingress: all` / `minScale: "1"` in the
   manifest for the duration of the rollback.

This is the single most likely way the migration breaks *after* it appears to have succeeded.

---

## Order: gateway first, bundler second

The gateway's failure mode is soft — gasless intents degrade to self-submit. The bundler's is not:
`frontend/src/lib/passkey/sendBatch.js` re-throws `SubmissionUnavailable` for `accountNative` ops
(first-use deploy, controller changes) with **no rescue**, because for a passkey member the bundler
is the only write rail and even a user-paid UserOp still needs a bundler. Migrate the forgiving
service first and learn on it.

---

## Step 0 — Preconditions

```bash
gcloud config set project chippr-bots-site-wp
git log --oneline origin/main -1      # PR #1000 (right-sizing) should be merged first
```

- [ ] Cloudflare dashboard access (Origin CA cert + DNS).
- [ ] `roles/billing.admin` on `0166E9-FC2238-00E06F` for the budget alert.
- [ ] BigQuery billing export configured (dataset `billing_export`). Not retroactive — its value is
      measuring the before/after.

## Step 1 — Build the target (changes nothing live)

```bash
bash infra/vm/provision.sh all
```

Creates the `fairwins-infra` custom VPC (custom-mode gets **no** default rules, so the project's
`default-allow-ssh` 0.0.0.0/0:22 and `default-allow-internal` — the network the public WordPress VM
sits on — do not apply), two static IPs (an ephemeral IP changes on any stop/start and would silently
break the Cloudflare origin), firewall rules for Cloudflare + the 54 Google uptime probers + IAP-only
SSH, the minimal `fairwins-bundler@` SA, and both VMs.

**Verify:** `gcloud compute instances list --filter='labels.app=fairwins'`
**Rollback:** delete the instances. Nothing live has changed.

## Step 2 — Install the Origin CA certificate (MANUAL)

Cloudflare → SSL/TLS → Origin Server → **Create Certificate** (covers `bundler.fairwins.app`,
`relay.fairwins.app`; 15-year). On **each** VM:

```bash
gcloud compute ssh fairwins-gateway --zone us-central1-a --tunnel-through-iap
sudo install -d -m0755 /etc/ssl/fairwins
sudo tee /etc/ssl/fairwins/origin.pem >/dev/null   # paste certificate
sudo tee /etc/ssl/fairwins/origin.key >/dev/null   # paste private key
sudo chmod 600 /etc/ssl/fairwins/origin.key
sudo nginx -t && sudo systemctl restart nginx
```

Set the zone SSL mode to **Full (strict)**. Flexible is unacceptable — it would leave
Cloudflare→origin unencrypted across the public internet, carrying the origin-lock secret and every
relayed intent in clear text.

## Step 3 — Cut over the GATEWAY

```bash
GIP=$(gcloud compute addresses describe fairwins-gateway-ip --region us-central1 --format='value(address)')

# 3a. Functional check via the origin IP, BEFORE any DNS change.
curl -sk "https://${GIP}/__probe/health" | jq '.chains'    # expect rpc:"up" on 63 and 137

# 3b. Cloudflare: repoint relay.fairwins.app A -> $GIP, proxied. Remove the *.run.app Host override.

# 3c. Verify through the real hostname.
curl -s https://relay.fairwins.app/status | jq '.status, .chains'

# 3d. Exercise a REAL gasless intent from the SPA on Polygon 137, end to end.
```

> A 200 from `/status` is **not** sufficient evidence. `server.js:302` returns `{"status":"ok"}`
> unconditionally, even with every chain down, and on RPC failure it deliberately serves the last
> good snapshot rather than 500. Judge on the per-chain `rpc` values and on a real intent.

**Rollback (< 2 min):** point DNS back at the `*.run.app` origin and restore the Host override.
Cloud Run is still running and warm — nothing was scaled down.

## Step 4 — Soak the gateway (48h minimum)

Watch `journalctl -u fairwins-probe@gateway -f` and the `fairwins_probe_failures` metric. Confirm at
least one real relayed intent and one paymaster-sponsored UserOp succeeded.

## Step 5 — Cut over the BUNDLER

**The dangerous step. Do the three locks in order, verifying between each.**

```bash
# 5a. Lock 3 — remove the cloudbuild bundler build+replace block. Must be MERGED before 5c,
#     or the next merge undoes everything below.

# 5b. Lock 2 — add a MIGRATED_TO_VM guard to .claude/skills/fairwins-infra/manage.sh so cmd_scale
#     refuses to touch fairwins-alto-bundler.

# 5c. Lock 1 — make Cloud Run structurally unable to serve a bundler.
#
# TRAP, OBSERVED IN THE REAL CUTOVER: `services update` CREATES A NEW REVISION, and deploying a
# revision starts an instance to health-check it — even with --min-instances=0. So the act of
# disarming Cloud Run itself briefly runs an alto (measured: instance_count went 1 -> 2 -> 1).
# Starting the VM's alto immediately after this command therefore OVERLAPS two executors.
gcloud run services update fairwins-alto-bundler --region us-central1 \
  --min-instances=0 --ingress=internal

# 5c-bis. WAIT FOR THE DRAIN. Do not skip. Poll until this reports 0 for two consecutive readings.
until [ "$(gcloud monitoring time-series list --project chippr-bots-site-wp \
    --filter='metric.type="run.googleapis.com/container/instance_count" AND resource.labels.service_name="fairwins-alto-bundler"' \
    --format='value(points[0].value.int64Value)' 2>/dev/null | head -1)" = "0" ]; do
  echo "Cloud Run still has a live instance; waiting..."; sleep 60
done
# Faster and stronger alternative, if you are not keeping Cloud Run as a rollback target: delete the
# service outright. A deleted service cannot start an instance at all, and the gate reads NOT_FOUND.
#   gcloud run services delete fairwins-alto-bundler --region us-central1

# 5d. Confirm the gate agrees. It checks all three paths plus live instance count.
gcloud compute ssh fairwins-bundler --zone us-central1-a --tunnel-through-iap \
  --command 'sudo /opt/fairwins/bundler/single-alto-gate.sh'
# Expect: "OK — exactly one alto may run."  Do NOT proceed on any other output.

# 5e. Start the VM's alto and verify functionally.
gcloud compute ssh fairwins-bundler --zone us-central1-a --tunnel-through-iap \
  --command 'sudo systemctl start fairwins-stack@bundler && sudo /opt/fairwins/common/poststart.sh bundler'

BIP=$(gcloud compute addresses describe fairwins-bundler-ip --region us-central1 --format='value(address)')
curl -sk "https://${BIP}/__probe/health"   # expect 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789

# 5f. Cloudflare: repoint bundler.fairwins.app -> $BIP.
# 5g. Exercise a REAL passkey UserOp on Polygon 137 end to end.
```

**Rollback (< 5 min)** — three parts, see "inverted trap" above:
```bash
# Stop the VM's alto FIRST. Never let both run.
gcloud compute ssh fairwins-bundler --zone us-central1-a --tunnel-through-iap \
  --command 'sudo systemctl stop fairwins-stack@bundler'
gcloud run services update fairwins-alto-bundler --region us-central1 \
  --min-instances=1 --ingress=all
# then repoint DNS, AND hold merges to main (or revert the manifest) for the rollback's duration.
```

## Step 6 — Monitoring

```bash
bash ops/monitoring/apply.sh all
bash ops/monitoring/apply.sh verify     # was 0 uptime checks / 0 alert policies before this
```

Uptime checks target the **origin IPs**, not the hostnames. Cloudflare's zone-wide WAF geo gate
answers **451** to US-sourced requests (`infra/cloudflare/waf-geo.md:21`) and Google's probers are
largely US-based, so a check routed through Cloudflare would be permanently red and page constantly.
The probers reach a dedicated `/__probe/health` path that bypasses the origin lock and is restricted
to the 54 published prober IPs in **both** the GCP firewall and nginx.

The matchers are deliberate: `0x5FF137D4` for the bundler (a plain 200 proves nothing — the
origin-lock nginx's own `/healthz` is a static `return 200` that never touches alto, which is exactly
the check that stayed green through the 2026-07-12 outage), and `"rpc":"up"` for the gateway (never
`"status":"ok"`). Numeric thresholds — gas-wallet runway — cannot be expressed as a string match and
are handled by the on-VM probe and the `fairwins_probe_failures` log metric.

## Step 7 — Soak, then decommission

Recommended soak: **14 days** after the bundler cutover — long enough to cover a weekly usage cycle
and at least one Polygon gas spike (the condition behind the 2026-07-12 incident). It costs ~$48 in
doubled infrastructure, cheap against a $1,183/yr saving and against discovering a fault with no warm
rollback.

```bash
gcloud run services delete fairwins-alto-bundler  --region us-central1
gcloud run services delete fairwins-relay-gateway --region us-central1
```

Then confirm the saving landed **from the billing export**, not from this document:

```sql
SELECT service.description, SUM(cost) AS usd
FROM `billing_export.gcp_billing_export_v1_*`
WHERE _TABLE_SUFFIX BETWEEN '20260801' AND '20260930'
GROUP BY 1 ORDER BY usd DESC
```

Also add an Artifact Registry cleanup policy (none is configured on any of the five repos).

---

## What this migration gives up

- **Single point of failure per service.** Cloud Run gave zonal redundancy and automatic instance
  replacement — it silently replaced instances **194 times in 30 days**. A single VM does neither;
  recovery from host failure is manual. The `vm-instance-down` alert exists because nothing else
  will tell you.
- **OS patching and process supervision** become yours.
- **Secrets reach the boot disk.** Beyond the tmpfs env files, dockerd persists each container's
  fully-resolved environment to `/var/lib/docker/containers/<id>/config.v2.json` (root-only, 0600).
  Cloud Run never did. Therefore **never snapshot or image these boot disks**, and treat
  `docker inspect` output as secret-bearing. Accepted trade-off, not an oversight.
- **`docker compose config` prints resolved secrets** to stdout. Do not run it on these hosts.

## What it does not give up — and what it improves

- KMS signing is unchanged: a GCE VM with an attached service account gets metadata-server ADC
  exactly as Cloud Run did. No credential is exported. (The engine already used an exported SA key
  from Secret Manager, so its posture is identical either way.)
- **Least privilege improves.** The bundler moves off `266380754692-compute@` — which holds
  `roles/editor` (including `iam.serviceAccountKeys.create` and `iam.serviceAccounts.actAs`) and
  `roles/run.admin`, so a container escape *today* can mint a key for the gateway's SA and sign with
  the paymaster HSM key — onto a new SA with two resource-scoped secret grants and nothing else.
- Cloudflare, the origin lock, and the never-stranded fallback are unchanged.
