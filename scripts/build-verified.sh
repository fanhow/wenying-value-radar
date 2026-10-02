#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec bash "${script_dir}/sites-env.sh" -- bash "$0" "$@"
fi

vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
if [[ ! -x "${vinext}" ]]; then
  echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
  exit 69
fi

echo "Running bounded vinext build..."
if command -v timeout >/dev/null 2>&1; then
  timeout --signal=TERM --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
    "${SITES_BUILD_TIMEOUT:-3m}" "${vinext}" build
else
  # The selected macOS environment has Node, but no GNU coreutils timeout.
  node "${script_dir}/run-bounded.mjs" "${SITES_BUILD_TIMEOUT:-3m}" \
    "${SITES_BUILD_KILL_AFTER:-10s}" "${vinext}" build
fi

node "${script_dir}/optimize-deployment-pngs.mjs"

bash "${script_dir}/validate-artifact.sh"
