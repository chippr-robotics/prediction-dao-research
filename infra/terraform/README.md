# infra/terraform

Declarative description of the FairWins cloud estate (spec 087, issue #1177).

Start with `docs/developer-guide/infrastructure-as-code.md` for the design, and
`docs/runbooks/infrastructure-operations.md` for procedures. This file is the map.

## Layout

```
bootstrap/                run-once trust root: state bucket, WIF pool, the two CI identities.
                          Local state, COMMITTED. Excluded from the apply workflow.
modules/                  pointer only — the modules live in chippr-tf-modules
environments/prod/        state prefix: prod
environments/staging/     state prefix: staging
```

One root per environment with its own state prefix, so a prod apply cannot reach staging state.

## Running

```bash
cd environments/prod
terraform init
terraform plan            # against production. Should report "No changes."
```

`terraform plan` reporting **`No changes.`** against the unchanged estate is the correctness
condition for every adopted surface. If it is not clean, the *configuration* is wrong.

## Before you commit

```bash
npm run check:iac                                   # the repository-specific rules
npm run test:iac-guardrails                         # proves each rule still fires
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/environments/prod validate
```

## What is managed

Networking (VPC, subnet, static IPs, four firewall rules), the two long-running nodes and their
service accounts and scoped IAM, Secret Manager containers and access bindings, Artifact Registry,
KMS rings and keys, Cloud Run service shape, Cloudflare DNS and both rulesets, and monitoring
(channels, uptime checks, alert policies, log metric).

Full inventory with real resource IDs: `specs/087-infrastructure-as-code/data-model.md`.

## What is deliberately NOT managed

| Excluded | Why |
|---|---|
| WordPress VM, default VPC, `default-allow-*` rules | not this project's — the GCP project is shared |
| `clearpath-*`, `fukuii-*`, `kings-edge-*` | idem |
| The decommissioned Cloud Run alto bundler | declaring it re-arms a second executor on one EOA |
| Secret payloads, versions, rotation | a version resource writes the payload into state |
| KMS key **versions** | a destroyed version is unrecoverable |
| Cloud Run image tags and revisions | the build pipeline owns the artifact |
| On-chain contract deployments | `deployments/` remains the source of truth |

## The five rules that matter

1. **IAM is additive only.** `*_iam_binding` and `*_iam_policy` are authoritative and would strip
   access from workloads this repository has never heard of. Rejected by G-01/G-02, and the CI
   identity lacks project IAM admin so the mistake also fails at the API.
2. **Adoption is by `import`, never recreate.** Static IPs are pinned in Cloudflare DNS; KMS keys and
   secret payloads are unrecoverable.
3. **A surface is done at zero-diff.** Not at "imported".
4. **Secrets: containers and access, never payloads.** One documented data-source exception.
5. **The Cloud Run bundler stays gone.**

## Adding an environment

Copy `environments/staging`, change the backend `prefix`, write its own `terraform.tfvars`, and add
`.terraform.lock.hcl` (G-13 requires it committed). Never share a state prefix between environments —
that is the boundary that bounds blast radius.
