# infra/observability — local Prometheus + Grafana

A workstation-local view of the FairWins estate: this machine, its containers, the production
endpoints, the application's own health numbers, and (opt-in) GCP metrics and logs.

```bash
cd infra/observability
docker compose up -d

# Grafana     http://127.0.0.1:3001   (admin/admin on first run; Grafana forces a change)
# Prometheus  http://127.0.0.1:9090
```

Add GCP metrics once you have credentials:

```bash
gcloud auth application-default login \
  --impersonate-service-account=fairwins-ops@chippr-bots-site-wp.iam.gserviceaccount.com
docker compose --profile gcp up -d
```

## What it watches

| Job | Source | Answers |
|---|---|---|
| `node` | node_exporter | This machine's CPU, memory, disk, filesystems |
| `cadvisor` | cAdvisor | Per-container CPU and memory on this machine |
| `fairwins` | `fairwins-exporter/` | Gas-wallet runway, paymaster deposit runway, kill switch, per-chain RPC, chain head, watched balances |
| `blackbox-http` | blackbox_exporter | `fairwins.app` and the gateway's `/status` reachable, TLS valid |
| `blackbox-bundler` | blackbox_exporter | Bundler answers `eth_supportedEntryPoints` with EntryPoint v0.6 |
| `stackdriver` | stackdriver_exporter | GCE instance, Cloud Run request and log-count metrics (profile `gcp`) |

Logs live in Grafana's **Google Cloud Logging** datasource, alongside the metrics — that is the
"stats and logs in one place" half, and it needs the same ADC login as the `gcp` profile.

## This is not the paging system, and must never become it

Cloud Monitoring pages (see `ops/monitoring/` and the `monitoring` module in `infra/terraform`). It
runs whether or not this workstation is switched on, which is the property that matters at 3am. The
rules in `prometheus/rules/` exist so the local Grafana can **show** a condition and so the
thresholds that matter are written down as numbers. There is deliberately no Alertmanager here.

## Things that will bite you

**A bind mount to a path that does not exist does not fail — Docker creates it, as a root-owned
directory.** The first bring-up here mounted `~/.config/gcloud/application_default_credentials.json`
directly on a machine that had never run `gcloud auth application-default login`. Docker created a
root-owned *directory* at exactly the path gcloud wants to write its credential file to, and gcloud
then fails with a permission error that mentions nothing about Docker. The compose file now mounts
the gcloud **config directory** instead, which always exists — and the credential appears inside the
already-mounted directory the moment you log in, with no restart needed.

**node_exporter is bound to the docker bridge address, not to localhost, and not to 0.0.0.0.** It
runs in the host network namespace — it must, or it reports the *container's* interfaces and
filesystems, which look plausible and describe nothing you care about. In that namespace `127.0.0.1`
is unreachable from Prometheus, which connects from the bridge and arrives as `172.17.0.1`; the
first bring-up failed exactly that way. `0.0.0.0` would fix it by publishing full host metrics to
the LAN. If your docker0 gateway is not `172.17.0.1`, set `NODE_EXPORTER_BIND`.

**A plain HTTP 200 from the bundler proves nothing.** The origin-lock nginx serves its own static
200 that never touches alto — that is the check which stayed green throughout the 2026-07-12 stall,
while gasless transactions were silently not landing. Both the local probe and the Cloud Monitoring
uptime check therefore POST `eth_supportedEntryPoints` and match the EntryPoint address in the
response. Never "simplify" either one to a status-code check. The gateway has the same trap in a
different shape: `/status` returns `"status":"ok"` unconditionally, even with every chain down, so
the probe matches on `rpc` state instead.

**The probes go through the public Cloudflare hostnames, not the origin IPs.** The origin firewall
opens `:443` to Cloudflare ranges only, so a workstation genuinely cannot reach it — and widening
that range so a local probe works would be trading a real security boundary for convenience. One
consequence: `/__probe/health` returns **403** through Cloudflare (it is restricted to Google's
uptime probers at the origin nginx), which is why these probe `/status` and `/` instead.

**The Cloud Logging plugin id has no `grafana-` prefix.** With the wrong id Grafana 404s at install
time and **crash-loops** — it does not start without the plugin, it dies. The id is
`googlecloud-logging-datasource`.

**stackdriver_exporter is behind the `gcp` profile because it cannot start without credentials.**
It exits, and `restart: unless-stopped` turns that into a permanent crash-loop. A container that is
red for a correct reason still trains people to ignore red.

**Cloud Monitoring bills per API call, and the project is shared.** The exporter is given an
explicit metric-prefix list. Unfiltered, it walks every metric descriptor in the project on every
scrape — including the WordPress VM's and the `clearpath-*` / `fukuii-*` / `kings-edge-*` workloads',
which is both expensive and none of our business.

**Everything binds to 127.0.0.1.** This stack holds a Grafana session that can read Cloud Monitoring
and Cloud Logging for the whole project. On `0.0.0.0` it is an unauthenticated window into the
estate for anything on the LAN. The loopback bind is the access control — there is no other.

## The exporter

`fairwins-exporter/` is ~200 lines of dependency-free Node running on the stock `node:22-alpine`
image, so there is nothing to install, no lockfile to drift, and no supply chain to audit for the
component whose job is being trustworthy about whether things work. It holds **no credentials** and
must not gain any: everything it reads is public.

Two rules in its code are worth keeping:

- **A failed scrape emits `_up 0`, never a missing series.** A metric that vanishes when the thing
  it measures breaks is worse than no metric — `absent()` alerting is easy to forget, and a
  dashboard renders the gap as "no data" rather than as a fault.
- **A `null` from upstream is dropped, not coerced.** Mordor reports `paymasterDepositRunwayHrs:
  null` because sponsorship is not configured there. Rendering that as `0` would show a chain
  permanently one hour from a paymaster outage it cannot have.

Targets and watched addresses are in `fairwins-exporter/targets.json`; addresses come from
`deployments/*.json`, the recorded source of truth.
