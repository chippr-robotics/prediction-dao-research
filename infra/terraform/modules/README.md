# Terraform modules

Local, reusable descriptions of the patterns that repeat across this estate — and, later, across
Chippr projects.

| Module | Creates |
|---|---|
| [`network`](./network) | custom-mode VPC, subnet, static origin IPs, four ingress rules |
| [`edge-node`](./edge-node) | one long-running GCE node role + its resource-scoped IAM |
| [`cloud-run-service`](./cloud-run-service) | one Cloud Run service's shape (the pipeline owns the artifact) |
| [`cloudflare-zone`](./cloudflare-zone) | DNS records, the geo compliance gate, the origin lock |
| [`monitoring`](./monitoring) | notification channels, uptime checks, alert policies, log metric |

## Why these are local

The brief for this work named `chippr-tf-modules` as the shared module source. **No repository by
that name exists in the `chippr-robotics` organisation** (verified 2026-08-14), so building against
it would have blocked this feature on a separate repository.

Instead the modules live here, written under constraints that make extraction a **mechanical move**
rather than a rewrite.

## Extraction constraints

| Constraint | Enforced by |
|---|---|
| No `provider` block inside a module — providers are passed by the root | guardrail G-09 |
| No literal project / region / zone in a module body | guardrail G-08 |
| Every environment-specific value is a `variable` with a type and description | review |
| Every value a consumer needs is a declared `output` — consumers never reach into internals | review |
| No `data` lookup of a resource the module does not own — those are inputs | review |
| Each module has a `README.md` with inputs, outputs, and the resources it creates | review |

The `provider` constraint pays for itself long before extraction: a module carrying its own provider
block cannot be instantiated with `for_each` or `count`, which is exactly how `edge-node` is used
(two nodes) and how per-tenant Cloud Run services will be used (N tenants).

## Promotion path

When `chippr-tf-modules` exists:

1. `git mv infra/terraform/modules/<name>` into `chippr-tf-modules/<name>`. **The module body does
   not change** — that is what the constraints above buy.
2. Tag the shared repository (`v0.1.0`).
3. In each consumer, change the source and pin the version:

   ```hcl
   # before
   source = "../../modules/network"

   # after
   source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//network?ref=v0.1.0"
   ```

4. `terraform init -upgrade`, then confirm a **zero-diff plan**.
5. Commit the updated `.terraform.lock.hcl`.

**Step 4 is the gate.** Extraction that changes the plan is not extraction — it is a rewrite wearing
a `git mv`, and it should be reverted rather than applied.

Until then, `source = "../../modules/<name>"` resolves to one directory at one commit, so the
immutability requirement is satisfied by the commit itself; the `?ref=` pin becomes load-bearing only
after step 3.

## Writing a new module

1. Create the directory with `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `README.md`.
2. `versions.tf` declares `required_providers` but **no `provider` block**.
3. Give every variable a `type` and a `description`. Descriptions are read by whoever has to use the
   module at 3am — say what will go wrong, not just what the field is.
4. Run `npm run check:iac` and `terraform fmt -check -recursive infra/terraform`.
5. Give the README a "Things that will bite you" section. Every module here has one, because every
   module here has at least one behaviour that is surprising and load-bearing.
