#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER="${ANCHOR_PROVIDER_URL:-devnet}"

cd "$ROOT_DIR/contracts"

echo "Deploying DuelSnap program to ${CLUSTER}"
NO_DNA=1 anchor build
NO_DNA=1 anchor deploy --provider.cluster "$CLUSTER"

mkdir -p "$ROOT_DIR/apps/lib/solana/idl" "$ROOT_DIR/apps/lib/solana/types"
cp "$ROOT_DIR/contracts/target/idl/duelsnap.json" "$ROOT_DIR/apps/lib/solana/idl/duelsnap.json"
cp "$ROOT_DIR/contracts/target/types/duelsnap.ts" "$ROOT_DIR/apps/lib/solana/types/duelsnap.ts"

echo "Copied generated DuelSnap IDL and types into apps/lib/solana."
