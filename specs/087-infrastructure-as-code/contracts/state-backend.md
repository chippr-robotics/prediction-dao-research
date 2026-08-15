# Contract: State Backend

**Satisfies**: FR-008, FR-009, FR-010, FR-011, SC-010

## Layout

```
gs://fairwins-tfstate-chippr-bots-site-wp/
├── prod/default.tfstate
└── staging/default.tfstate
```

One bucket, one prefix per environment. `backend.tf` in each environment root:

```hcl
terraform {
  backend "gcs" {
    bucket = "fairwins-tfstate-chippr-bots-site-wp"
    prefix = "prod"        # or "staging"
  }
}
```

## Bucket properties

| Property | Value | Why |
|---|---|---|
| Location | `us-central1` | co-located with the estate |
| Versioning | **enabled** | state history is the audit record (SC-010); recovers a corrupted apply |
| Uniform bucket-level access | **enabled** | per-object ACLs would make FR-010's access claim unauditable |
| Public access prevention | **enforced** | state describes the whole estate |
| Encryption | Google-managed | CMEK adds a key whose loss destroys the state and buys nothing here — the state holds no payloads (FR-015), with one documented exception |
| Lifecycle | keep 30 noncurrent versions | bounded history without unbounded growth |
| `prevent_destroy` | **true** | destroying the bucket loses the adoption record for the entire estate |

## Locking

The GCS backend acquires a lock object (`<prefix>/default.tflock`) before any state write and
releases it after. Concurrent operations fail fast with the lock holder's identity rather than
corrupting state (FR-008).

`terraform force-unlock` is **not** part of any automated path. It appears only in the operations
runbook, with the instruction to first confirm no apply is in flight — force-unlocking a live apply
is how state and reality diverge.

## Access (FR-010)

| Principal | Access | Why |
|---|---|---|
| `fairwins-tf-apply@` | `roles/storage.objectUser` on the bucket | read + write state, acquire locks |
| `fairwins-tf-plan@` | `roles/storage.objectUser` on the bucket | plan must read state and take a lock |
| Named human operators | `roles/storage.objectUser` on the bucket | bootstrap, recovery, manual inspection |
| Everyone else | none | including other Chippr workloads (FR-009) |

`objectUser` rather than `objectAdmin`: no bucket-level configuration rights from a runtime identity.

**The state is sensitive** even without payloads — it enumerates the whole estate, and the one
accepted exception (the origin-lock header value, read through a data source) lands here. Access is
therefore restricted as above and never widened for convenience.

## Bootstrap (FR-011)

The bucket cannot store the state that creates it.

```
infra/terraform/bootstrap/
├── main.tf              # bucket, WIF pool + provider, tf-plan and tf-apply SAs
└── terraform.tfstate    # LOCAL, and committed to the repository
```

Run once, manually, by a human with owner rights:

```bash
cd infra/terraform/bootstrap
terraform init      # no backend block — local state by design
terraform apply
git add terraform.tfstate && git commit   # the trust root's audit record
```

**The local state stays local.** It is deliberately not migrated into the bucket it created: the
trust root must not depend on itself. Bootstrap manages only the bucket, the WIF pool, and two
service accounts — no secrets, no payloads — so committing its state is safe and makes the trust
root inspectable at any commit.

Bootstrap is excluded from the automatic-apply workflow. It runs rarely, needs privileges the CI
identities deliberately lack, and is the one place where a mistake could sever CI's access entirely.

## Disaster recovery

| Scenario | Recovery |
|---|---|
| State corrupted by a failed apply | Restore the prior object version (versioning is on); re-plan and reconcile |
| State lost entirely | Re-run the `import` blocks — they are retained in the repository for exactly this (R2). Adoption is reproducible, which is the point |
| Bucket deleted | Blocked by `prevent_destroy` and by the CI identity lacking bucket-delete. Recovery is: re-run bootstrap, then re-import |
| Lock stuck after a crashed run | Confirm nothing is in flight, then `terraform force-unlock <id>` per the runbook |

The fact that state loss is recoverable by re-import — rather than catastrophic — is a direct
consequence of keeping `import` blocks in the repository after adoption.
