# Module: `edge-node`

One long-running GCE node role — the instance, optionally its service account, and that account's
resource-scoped IAM. Instantiated once per role (`bundler`, `gateway`).

## Inputs

Required: `project_id`, `region`, `zone`, `name`, `role`, `subnet_id`, `static_ip_address`.

| Name | Default | Notes |
|---|---|---|
| `machine_type` | `e2-small` | |
| `boot_image` | `debian-cloud/debian-12` | |
| `boot_disk_size_gb` / `boot_disk_type` | `20` / `pd-standard` | |
| `network_tags` | `["fairwins-edge"]` | must include the tag the firewall rules target |
| `labels` | `{ app = "fairwins" }` | `role` is merged in automatically |
| `metadata` | `{}` | merged with `fairwins-role` |
| `startup_script` | `null` | |
| `shielded_vm` | `true` | |
| `create_service_account` | `false` | `true` for the bundler; the gateway reuses an existing account |
| `service_account_email` / `_id` / `_display_name` / `_description` | `null` | |
| `secret_accessor_secrets` | `[]` | granted **per secret** |
| `artifact_registry_repository` | `null` | repository-scoped reader |
| `project_roles` | `[]` | only where no resource-scoped role exists |

## Outputs

`instance_id`, `instance_name`, `internal_ip`, `external_ip`, `service_account_email`.

## Things that will bite you

- **`role` is load-bearing in three places**: the `fairwins-role` metadata key the startup script
  reads, the `role` label the Ansible dynamic inventory keys on, and the systemd instance name
  (`fairwins-stack@<role>`). Changing it silently orphans all three.
- **Every IAM resource here is `*_iam_member`.** Additive. The `_binding` and `_policy` forms are
  authoritative and would strip access from workloads this repository has never heard of. The
  guardrail gate rejects them, and the CI identity is not granted project IAM admin so the same
  mistake also fails at the API.
- **Grants are resource-scoped by design.** Project-wide secret or Artifact Registry access would
  destroy the property that makes the gateway's account worth keeping — it holds **zero**
  project-level roles today.
- **`project_roles` should stay nearly empty.** `logWriter`/`metricWriter` are write-only and have
  no resource-scoped equivalent. `run.viewer` is required by `single-alto-gate.sh`, which fails
  closed when it cannot read Cloud Run state, and must be project-level because gcloud reports a
  genuine 404 and a permission denial identically.
- **`metadata_startup_script` is in `ignore_changes`.** A script edit must not force instance
  replacement; recreating a node is the riskiest operation available and is never the right response
  to a configuration change. Convergence is Ansible's job.
- **`create_service_account = false` requires `service_account_email`.** Terraform will not catch a
  null here until apply.
