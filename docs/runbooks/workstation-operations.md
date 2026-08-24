# Runbook: operator workstation

The workstation is a **production surface**. It can read a funded deploy key and every credential
the platform uses. Treat it accordingly.

## Onboarding a new operator

1. Add their principal to `workstation_operators` in
   `infra/terraform/environments/prod/terraform.tfvars` and apply. The grant is
   `roles/iam.serviceAccountTokenCreator` on the `fairwins-ops@` account **only** — never
   project-wide, which would let them impersonate every service account in a shared project.
2. On their machine:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   cd infra/ansible
   ansible-playbook -i inventory/workstation.yml playbooks/workstation.yml
   ```
   The playbook verifies rather than installs: gcloud present, authenticated, impersonation works,
   every declared secret readable, no credential on disk. It writes one file —
   `~/.config/fairwins/ops.env.sh`, containing the identity to impersonate and nothing secret.
3. `source ~/.config/fairwins/ops.env.sh`, then `npm run secrets:doctor` should be all-green.

Nothing in step 2 can be fixed by editing the workstation if step 1 was skipped. "Cannot
impersonate" is a Terraform change, not a local one.

## Offboarding

Remove them from `workstation_operators` and apply. That is the whole revocation: with no key file
anywhere, there is no second copy to hunt down. Then rotate anything they had reason to use —
membership in that list is the audit trail of who could read what.

## Diagnosing a failed secret read

`npm run secrets:doctor` distinguishes the four failures that look identical from a fetch:

| Symptom | Cause | Fix |
|---|---|---|
| `gcloud: NOT FOUND` | CLI missing | install the Google Cloud CLI |
| `active account: NONE` | not logged in | `gcloud auth login` |
| `container does not exist` | migration not run | `npm run secrets:migrate -- --apply` |
| `no secretAccessor for this principal` | IAM | add the id to `workstation_secret_ids`, apply |

## Rotating a credential

Secret Manager versions are the rotation mechanism; nothing in this repo pins a workstation secret
to a version, so `latest` takes effect at the next fetch.

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add fairwins-<name> \
  --data-file=- --project=chippr-bots-site-wp
npm run secrets:doctor          # confirm the new version reads back
gcloud secrets versions disable <old-version> --secret=fairwins-<name> --project=chippr-bots-site-wp
```

**Disable before destroying, always.** A disabled version can be re-enabled in seconds if something
was still using it; a destroyed one is gone. Wait until you have seen a real deploy succeed.

Do **not** pipe a value through `$(...)`: command substitution strips trailing newlines, and a
payload whose trailing byte changed is a different credential. `--data-file=-` with `printf '%s'`
writes the bytes verbatim. The same rule governs the VM's `fetch-secrets.sh`, for the same reason.

**Never pass a secret on a command line.** `/proc/<pid>/cmdline` is world-readable.

## After moving a credential out of `.env`

The value was in a plaintext file, and is very likely in shell history, editor swap files, and any
backup that touched the home directory. Migration does not undo that — **rotation does**. See the
rotation checklist in `specs/097-workstation-secrets-observability/spec.md`.

## Local observability

`infra/observability/README.md`. It is a viewing surface, not the paging system — Cloud Monitoring
pages, and it runs whether or not this workstation is switched on.

## What to do if this machine is lost or compromised

1. **Remove the operator from `workstation_operators` and apply.** This is the fastest single action
   and it revokes access to every secret at once. There is no key file to also revoke.
2. Rotate every credential in `workstation_secret_ids`. Assume all of them were readable.
3. The deploy key (`fairwins-deployer-key`) is funded and holds admin authority on live contracts —
   move the funds and hand off the roles before anything else. It is the only secret whose exposure
   is not recoverable by rotation alone.
4. Check `gcloud logging read 'protoPayload.methodName="AccessSecretVersion"'` for what was actually
   read. Impersonation means every access is attributed to the named human, which is the point.
