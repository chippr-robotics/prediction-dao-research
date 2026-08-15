terraform {
  backend "gcs" {
    bucket = "fairwins-tfstate-chippr-bots-site-wp"

    # One prefix per environment. A prod apply cannot reach staging state at all, which is a harder
    # boundary than -target flags — those apply a subgraph without refreshing the rest, so recorded
    # state stops describing reality (guardrail G-14).
    prefix = "staging"
  }
}
