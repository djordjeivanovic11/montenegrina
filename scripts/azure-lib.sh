#!/usr/bin/env bash
set -euo pipefail

azure_root() { cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd; }

azure_load_env() {
  local root
  root="$(azure_root)"
  [[ -f "$root/.env.azure" ]] || { echo "Missing .env.azure; run scripts/azure-prepare-env.sh" >&2; exit 1; }
  set -a
  # shellcheck disable=SC1091
  source "$root/.env.azure"
  set +a
}

azure_need() {
  local missing=()
  for key in "$@"; do [[ -n "${!key:-}" ]] || missing+=("$key"); done
  ((${#missing[@]} == 0)) || { echo "Missing required settings: ${missing[*]}" >&2; exit 1; }
}

azure_load_azd() {
  local line key
  while IFS= read -r line; do
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    [[ -n "${!key:-}" ]] && continue
    eval "export $line"
  done < <(azd env get-values)
}

azure_assert_login() {
  command -v az >/dev/null && command -v azd >/dev/null || { echo "Azure CLI and azd are required." >&2; exit 1; }
  az account show >/dev/null 2>&1 || { echo "Run az login first." >&2; exit 1; }
}

azure_wait_job() {
  local job="$1" rg="$2"
  az containerapp job start --name "$job" --resource-group "$rg" >/dev/null
  local status
  for _ in $(seq 1 120); do
    status="$(az containerapp job execution list --name "$job" --resource-group "$rg" --query '[0].properties.status' -o tsv)"
    case "$status" in
      Succeeded) return 0 ;;
      Failed) echo "Job $job failed." >&2; return 1 ;;
    esac
    sleep 5
  done
  echo "Timed out waiting for $job." >&2
  return 1
}

azure_wait_revision() {
  local app="$1" revision="$2" rg="$3"
  local health
  for _ in $(seq 1 120); do
    health="$(az containerapp revision show --name "$app" --revision "$revision" --resource-group "$rg" --query properties.healthState -o tsv 2>/dev/null || true)"
    case "$health" in
      Healthy) return 0 ;;
      Unhealthy) echo "Revision $revision for $app is unhealthy." >&2; return 1 ;;
    esac
    sleep 5
  done
  echo "Timed out waiting for revision $revision for $app." >&2
  return 1
}
