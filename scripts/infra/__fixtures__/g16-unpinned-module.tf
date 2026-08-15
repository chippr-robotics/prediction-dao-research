# G-16 violations: an external module source with no pin, and one pinned to a moving branch.
module "unpinned" {
  source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/network"
}

module "branch_pinned" {
  source = "git::https://github.com/chippr-robotics/chippr-tf-modules.git//modules/edge-node?ref=main"
}
