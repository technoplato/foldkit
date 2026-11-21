#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="/Users/blackflag/Development/sites/foldkit-playground"

cd "${SCRIPT_DIR}"
pnpm build
mkdir -p "${TARGET_DIR}"
rsync -a --delete "${SCRIPT_DIR}/dist/" "${TARGET_DIR}/"
echo "Deployed Foldkit 54-Part Playground to ${TARGET_DIR}"
