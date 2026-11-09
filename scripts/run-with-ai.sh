#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # Load only an operator-owned local configuration file.
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
exec "$ROOT/scripts/run.sh"
