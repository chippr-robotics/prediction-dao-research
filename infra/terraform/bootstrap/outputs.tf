output "state_bucket" {
  description = "Name of the Terraform state bucket. Referenced by each environment's backend.tf."
  value       = google_storage_bucket.tfstate.name
}

output "workload_identity_provider" {
  description = "Full provider resource name for google-github-actions/auth. Set as the WIF_PROVIDER repository variable."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "tf_plan_service_account" {
  description = "Read-only identity used by pull-request plans."
  value       = google_service_account.tf_plan.email
}

output "tf_apply_service_account" {
  description = "Apply identity, restricted to the default branch."
  value       = google_service_account.tf_apply.email
}
