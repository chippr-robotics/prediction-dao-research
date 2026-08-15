# Quickstart: Validating the IaC Feature

**Feature**: 087-infrastructure-as-code | **Phase 1**

Runnable scenarios that prove the feature works. Each maps to a success criterion in `spec.md`. Run
them in order — later scenarios assume earlier ones passed.

## Prerequisites

```bash
terraform version          # ~> 1.15
ansible --version          # ansible-core ~> 2.18
gcloud auth login && gcloud config set project chippr-bots-site-wp
gcloud auth application-default login
export CLOUDFLARE_API_TOKEN=...   # zone-scoped; see contracts/ci-identity.md
```

Terraform and Ansible are not in the repo toolchain — install per
`docs/developer-guide/infrastructure-as-code.md`. `npm run check:iac` needs only Node.

---

## Scenario 1 — Guardrails reject what they must (SC-009)

```bash
npm run check:iac                         # expect: PASS
npm run test:iac-guardrails               # fixture suite: each forbidden pattern must be rejected
```

**Expected**: the fixture suite proves every rule in `contracts/guardrails.md` fires — most
importantly G-01/G-02 (authoritative IAM), G-04 (secret version resource), G-06 (missing
`prevent_destroy`) and G-11 (a re-declared Cloud Run bundler).

A gate that passes everything is worse than no gate, because it gets cited as evidence. This
scenario is what makes the gate itself trustworthy.

---

## Scenario 2 — The plan is clean against production (SC-002, FR-005)

```bash
cd infra/terraform/environments/prod
terraform init
terraform plan -lock-timeout=5m
```

**Expected**: `No changes. Your infrastructure matches the configuration.`

**If it is not clean**, the configuration is wrong — not the infrastructure. Fix the repository and
re-plan. Never apply to force live infrastructure to match a generated body (research.md R2).

Re-run for `environments/staging`.

---

## Scenario 3 — Adoption is non-destructive (FR-004, FR-006)

Before the first apply of a newly adopted surface:

```bash
terraform plan -out=tfplan
terraform show -json tfplan | jq -r '
  .resource_changes[]
  | select(.change.actions | inside(["delete","create"]) or index("delete"))
  | "\(.change.actions | join(",")): \(.address)"'
```

**Expected**: empty output. Any `delete`, `replace`, or `create` on an already-live resource means
the import is wrong.

Then prove the protection layer actually fires:

```bash
terraform plan -destroy 2>&1 | grep -i "prevent_destroy"
```

**Expected**: an **error** naming the protected resources (KMS keys, secret containers, static IPs,
state bucket). An error here is the pass condition.

---

## Scenario 4 — A single-service change has a bounded blast radius (SC-004)

Change one attribute — say `min_instances` on the staging service — then:

```bash
cd infra/terraform/environments/staging
terraform plan | grep -E "will be (created|updated|destroyed|replaced)"
```

**Expected**: exactly one resource. Nothing in `prod` state is touched, and nothing else in staging
appears.

---

## Scenario 5 — Ansible is idempotent (SC-005, FR-019)

```bash
cd infra/ansible
ansible-inventory -i inventory/gcp.yml --graph      # both VMs, discovered by label
ansible-playbook -i inventory/gcp.yml site.yml --check --diff
ansible-playbook -i inventory/gcp.yml site.yml      # first real run
ansible-playbook -i inventory/gcp.yml site.yml      # second run
```

**Expected**: the second run's recap shows `changed=0` for every host, and no service restarts.

Confirm the gasless path stayed up throughout:

```bash
curl -s -X POST https://bundler.fairwins.app -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_supportedEntryPoints","params":[]}' | grep -i 0x5FF137D4
curl -s https://relay.fairwins.app/health | grep '"rpc":"up"'
```

**Note** on connectivity: the inventory proxies SSH through IAP
(`gcloud compute start-iap-tunnel`). If Ansible cannot reach a host, the fix is a working IAP tunnel
— **never** widening the firewall. Port 22 is open to `35.235.240.0/20` only, by design.

---

## Scenario 6 — Node reconstruction from the repository (SC-006)

Against **staging or a scratch node only**. Do not exercise this on a production node.

```bash
gcloud compute instances delete <scratch-node> --zone us-central1-a
cd infra/terraform/environments/staging && terraform apply
gcloud compute instances get-serial-port-output <scratch-node> --zone us-central1-a | tail -50
```

**Expected**: the node returns to a healthy, serving state with **no manual step**. The startup
script bootstraps and then runs the same playbook used for on-demand convergence
(`contracts/ownership-boundary.md`), so cold boot and convergence share one description.

Any step you had to perform by hand is a defect in this feature, not expected practice (FR-041,
spec User Story 5 acceptance 2).

---

## Scenario 7 — Drift is detected (SC-007, FR-036)

Introduce drift out of band on a **non-critical** attribute:

```bash
gcloud compute instances add-labels fairwins-bundler --zone us-central1-a --labels=drift-test=yes
```

Then run the drift job (or wait for its schedule):

```bash
gh workflow run infra-drift.yml && gh run watch
```

**Expected**: the job reports drift, names `google_compute_instance.node` and the `labels`
attribute, and does **not** auto-correct it. Verify no secret values appear in the report (FR-037).

Clean up:

```bash
gcloud compute instances remove-labels fairwins-bundler --zone us-central1-a --labels=drift-test
```

---

## Scenario 8 — A pipeline deploy causes no drift (SC-014, FR-022a)

Merge any frontend change so Cloud Build deploys a new image, then:

```bash
gh workflow run infra-drift.yml && gh run watch
```

**Expected**: clean. The image tag changed, and `ignore_changes` means Terraform does not care.

This is the scenario that proves the ownership split works. Without it, every merge would report
drift, and drift alerts would stop being read.

---

## Scenario 9 — The CI identity cannot destroy what it must not (SC-013, FR-033)

Attempted and observed — not read from configuration.

```bash
gcloud auth print-access-token --impersonate-service-account=fairwins-tf-apply@chippr-bots-site-wp.iam.gserviceaccount.com >/dev/null

IMP="--impersonate-service-account=fairwins-tf-apply@chippr-bots-site-wp.iam.gserviceaccount.com"

# 1. destroy a KMS key version
gcloud kms keys versions destroy 1 --key=<key> --keyring=<ring> --location=us-central1 $IMP
# 2. delete a managed secret container
gcloud secrets delete origin-lock-secret $IMP
# 3. modify another workload's resource
gcloud run services update <clearpath-service> --region=us-central1 $IMP
# 4. set a project-level IAM policy
gcloud projects add-iam-policy-binding chippr-bots-site-wp \
  --member=serviceAccount:fairwins-tf-apply@chippr-bots-site-wp.iam.gserviceaccount.com \
  --role=roles/owner $IMP
```

**Expected**: `PERMISSION_DENIED` on all four. Any success is a release blocker.

Under automatic apply this boundary is the last line of defence — reviewers approve diffs, not
permissions.

---

## Scenario 10 — The applied plan is the reviewed plan (SC-012, FR-034)

1. Open a PR touching `infra/terraform/**`. Confirm `infra-plan.yml` posts a redacted plan summary.
2. Merge it. Confirm `infra-apply.yml` applies the **saved** `tfplan` — the log shows it consuming
   the artifact, not computing a new plan.
3. Now force a divergence: open a second infra PR, merge a *different* infra change first, then
   merge the second.

**Expected on step 3**: the apply job **fails** reporting the tree-digest or state-serial mismatch,
and requires a re-plan. That failure is the pass condition — a fresh unreviewed plan applying
automatically is what FR-034 forbids.

---

## Scenario 11 — No secrets anywhere (SC-008, FR-014)

```bash
npm run check:iac                                        # G-04: no secret version resources
grep -rEi "(BEGIN [A-Z ]*PRIVATE KEY|api[_-]?key\s*=\s*\"[^\"$])" infra/terraform infra/ansible
cd infra/terraform/environments/prod
terraform show -json | jq '[.. | objects | select(has("sensitive_values"))] | length'
```

**Expected**: the grep returns nothing; the guardrail passes; the plan summary posted to PRs shows
`(sensitive value)` wherever a value is marked sensitive.

Known and accepted: the origin-lock header value reaches state through a data source
(plan.md Complexity Tracking). It is a shared header secret, not a signing key, and the state
bucket's access is restricted accordingly (`contracts/state-backend.md`). The guardrail warns on
every data-source use so this exception stays visible and countable.

---

## Coverage map

| Scenario | Criteria |
|---|---|
| 1 | SC-009 |
| 2 | SC-002, SC-003 |
| 3 | FR-004, FR-006 |
| 4 | SC-004 |
| 5 | SC-005 |
| 6 | SC-006 |
| 7 | SC-007 |
| 8 | SC-014 |
| 9 | SC-013 |
| 10 | SC-012 |
| 11 | SC-008 |

SC-001, SC-010 and SC-011 are documentation/structure criteria, verified by review of
`data-model.md`, the retained `import` blocks, and `contracts/module-interfaces.md` respectively.
