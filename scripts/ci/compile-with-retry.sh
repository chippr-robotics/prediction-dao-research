#!/usr/bin/env bash
# Hardens `hardhat compile` against the two observed CI failure modes: a hung/interrupted
# solc download (job runs out the clock waiting on "Downloading compiler ...") and a
# corrupted binary left on disk from a prior interrupted download (Hardhat error HH505,
# "A native version of solc failed to run"). Both leave a bad artifact under
# ~/.cache/hardhat-nodejs/compilers-v2 that a naive retry will keep hitting, so on failure
# this purges that cache before retrying — forcing a fresh download instead of repeating
# the same corrupt state. Each attempt is bounded so one bad attempt can't burn the whole
# job budget; failure after all attempts still exits non-zero (no continue-on-error masking).
set -uo pipefail

MAX_ATTEMPTS="${COMPILE_RETRY_ATTEMPTS:-3}"
ATTEMPT_TIMEOUT_SECONDS="${COMPILE_RETRY_TIMEOUT:-420}"
COMPILER_CACHE_DIR="${HOME}/.cache/hardhat-nodejs/compilers-v2"

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "::group::Compile attempt ${attempt}/${MAX_ATTEMPTS}"
  timeout "$ATTEMPT_TIMEOUT_SECONDS" npx hardhat compile
  code=$?
  echo "::endgroup::"

  if [ "$code" -eq 0 ]; then
    echo "Contracts compiled on attempt ${attempt}."
    exit 0
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    break
  fi

  if [ "$code" -eq 124 ]; then
    echo "::warning::compile attempt ${attempt} timed out after ${ATTEMPT_TIMEOUT_SECONDS}s; purging compiler cache and retrying" >&2
  else
    echo "::warning::compile attempt ${attempt} failed (exit ${code}); purging compiler cache and retrying" >&2
  fi
  rm -rf "$COMPILER_CACHE_DIR"
  sleep 5
done

echo "::error::npm run compile did not succeed after ${MAX_ATTEMPTS} attempts" >&2
exit 1
