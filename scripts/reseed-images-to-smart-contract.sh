#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR/apps"

echo "Submitting and verifying DuelSnap seed images on-chain"
SEED_MODE=onchain npx tsx scripts/seed-questions.ts
