# Module: `cloud-run-service`

One Cloud Run service's **shape**. The running artifact belongs to the build pipeline.

## The ownership split (read this first)

| Owner | Attributes |
|---|---|
| **Terraform** (this module) | scaling bounds, CPU/memory, `cpu_idle`, concurrency, timeout, ingress, runtime service account, secret env wiring, invoker IAM, domain mappings |
| **Cloud Build** | the container image tag, the revision identity, `client`, `client_version` |

Enforced by `lifecycle { ignore_changes = [...] }`, which the guardrail gate (G-07) asserts is
present and complete. Without it, every merge's image deploy reports as drift — and a drift report
that is always red is one nobody reads.

The reverse direction matters just as much: `cloudbuild.yaml`'s `gcloud run deploy` must not carry
shape-setting flags, or a deploy silently reverts declared shape.

## Inputs

Required: `project_id`, `region`, `name`, `image`.

| Name | Default | Notes |
|---|---|---|
| `service_account_email` | `null` | |
| `min_instances` / `max_instances` | `0` / `100` | non-zero floor = an instance kept warm and billed continuously |
| `cpu` / `memory` | `"1"` / `"512Mi"` | |
| `cpu_idle` | `true` | `false` = CPU always allocated; with `min_instances > 0` this bills a full vCPU 24/7 |
| `concurrency` | `80` | |
| `timeout_seconds` | `300` | |
| `ingress` | `INGRESS_TRAFFIC_ALL` | |
| `allow_unauthenticated` | `false` | manages the `allUsers` invoker binding |
| `env` | `{}` | plain values only — never a secret |
| `secret_env` | `{}` | name → `{ secret, version }`; the payload never enters state |
| `domain_mappings` | `[]` | |

## Outputs

`service_name`, `service_uri`, `latest_ready_revision`.

## Things that will bite you

- **`image` must be a valid reference at import time** even though it is ignored afterwards. Use the
  `:latest` tag the pipeline already publishes alongside the SHA tag. An invalid value makes the
  very first apply propose a change.
- **`--allow-unauthenticated` must leave `cloudbuild.yaml` in the same change that adopts the
  service** — not before (public access is lost on the next deploy) and not after (the next deploy
  fights Terraform).
- **`ignore_changes` indexes into `containers[0]`.** It is correct for a single-container service and
  fragile for a multi-container one. The relay gateway was a 3-container service before it moved to
  a VM; if any multi-container service is adopted later, revisit this list.
- **Never declare `fairwins-alto-bundler`.** It is decommissioned, and re-arming it puts two
  executors on one EOA — colliding nonces, stuck bundles, both instances reporting healthy, no
  in-band detection. Guardrail G-11 rejects it.
- **`min_instances` and `cpu_idle` are the cost-relevant knobs** the `fairwins-infra` skill used to
  toggle by CLI. Under this module they become a reviewed change with a record, which is the point.
