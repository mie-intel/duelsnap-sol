#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/apps"

echo "Writing DuelSnap seed image answers and URLs to Redis"
SEED_MODE=redis npx tsx scripts/seed-questions.ts
