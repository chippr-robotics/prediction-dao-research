# Contract: Ownership Boundary

**Satisfies**: FR-022, FR-022a, FR-022b, FR-038

Every managed attribute has **exactly one** owner. Two owners on one attribute is the failure that
produces permanent false drift, and false drift is how real drift gets ignored.

## The table

| Attribute class | Owner | Enforcement |
|---|---|---|
| VPC, subnet, firewall rules, static IP addresses | Terraform | declared in `module.network` |
| VM existence, machine type, boot disk, labels, network tags, attached service account, shielded-VM settings, metadata keys | Terraform | declared in `module.edge-node` |
| VM `metadata.startup-script` (the pointer) | Terraform | file contents are a reduced bootstrap (below) |
| OS packages and versions, kernel/sysctl, SSH policy, file permissions | Ansible | `roles/common`, `roles/hardening` |
| Docker engine + version pin | Ansible | `roles/docker` |
| nginx site configuration | Ansible | `roles/nginx` templates |
| systemd units and timers | Ansible | `roles/fairwins_stack` |
| docker-compose files and container images on the VMs | Ansible | `roles/fairwins_stack` |
| `/run/fairwins` tmpfs and per-container env files | Ansible | `roles/fairwins_secrets` |
| Cloud Run scaling, CPU, memory, concurrency, timeout, ingress, runtime SA, secret wiring, invoker IAM, domain mapping | Terraform | `module.cloud-run-service` |
| Cloud Run container image tag, revision name, `client`, `client_version` | **Cloud Build** | Terraform `ignore_changes` |
| Secret Manager containers + access bindings | Terraform | `google_secret_manager_secret` + `*_iam_member` |
| Secret payloads, versions, rotation | Out of band | no Terraform resource; gate forbids it |
| KMS key rings, keys, IAM bindings | Terraform | `prevent_destroy` |
| KMS key **versions** | Out of band | never managed — destruction is unrecoverable |
| DNS records, WAF ruleset, transform ruleset | Terraform | `module.cloudflare-zone` |
| Notification channels, uptime checks, alert policies, log metrics | Terraform | `module.monitoring` |
| On-chain contract addresses | `deployments/` | out of scope |

## The two directions of FR-022b

**Terraform must not set what the pipeline owns.** Enforced by `ignore_changes`:

```hcl
lifecycle {
  ignore_changes = [
    template[0].containers[0].image,
    template[0].revision,
    client,
    client_version,
  ]
}
```

The guardrail gate asserts this exact set is present on every `google_cloud_run_v2_service`.

**The pipeline must not set what Terraform owns.** `cloudbuild.yaml`'s `gcloud run deploy` step is
reduced to image + region + platform. Any flag that sets shape (`--min-instances`, `--max-instances`,
`--cpu`, `--memory`, `--concurrency`, `--timeout`, `--ingress`, `--service-account`,
`--set-secrets`/`--update-secrets`, `--allow-unauthenticated`) is removed when the service is
adopted, because a deploy carrying such a flag silently reverts declared shape and the next drift run
reports it as if a human had done it.

> **Note on `--allow-unauthenticated`**: it is currently in `cloudbuild.yaml`. It sets the invoker
> IAM binding, which Terraform will own. It must be removed *in the same change* that adopts the
> service — not before (the service would lose public access on the next deploy) and not after (the
> next deploy would fight Terraform).

## What stays deleted

`cloudbuild.yaml` no longer builds or deploys the alto bundler. That deletion is load-bearing and is
**not** reversed by this feature: re-arming a Cloud Run bundler alongside the VM bundler puts two
executors on one EOA — colliding nonces, stuck bundles, both instances reporting healthy, no in-band
detection. `infra/vm/bundler/single-alto-gate.sh` detects the condition within 60s and refuses to
start the VM's alto, but it cannot prevent it. Only the absence of the build step can.

Consequently the Cloud Run bundler is neither imported nor declared, and
`services/alto-bundler/deploy/service.yaml` is marked non-authoritative.

## `startup.sh`: reduced, not deleted

Today it installs packages, docker, nginx, systemd units and the container stack at boot. Under this
contract it keeps only:

1. read `fairwins-role` from instance metadata
2. install the minimum needed to run Ansible locally (python3, git, ansible-core)
3. clone/refresh the repository
4. run `ansible-playbook` against `localhost` with the role's playbook

Node configuration therefore has **one** description, used by both paths — cold boot (User Story 5)
and on-demand convergence (User Story 3). A node that boots into one configuration and converges to
another is worse than the current state, and this is the structure that prevents it.
