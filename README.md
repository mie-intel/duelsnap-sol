# DuelSnap

DuelSnap is a Solana picture-guessing game with an Anchor program and a Next.js app.

## Deployment Runbook

Run these commands from the repository root.

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure `apps/.env.local`

Make sure `apps/.env.local` has at least these values before deploy/init/seed:

```env
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_DUELSNAP_PROGRAM_ID=3o6vAECHh7CDLvbFn6DzTMMDFqbSmEbC9JLb4TAQn2Za
NEXT_PUBLIC_PAYMENT_DECIMALS=6
NEXT_PUBLIC_PAYMENT_SYMBOL=USDC

PINATA_JWT=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

For local/dev scripts, `ADMIN_KEYPAIR_JSON`, `SEED_KEYPAIR_JSON`,
`VERIFIER_KEYPAIR_JSON`, `RELAYER_KEYPAIR_JSON`, and `FAUCET_KEYPAIR_JSON`
are optional. If they are not set, scripts use `SOLANA_KEYPAIR_PATH`, or
`~/.config/solana/id.json` by default.

Server-only keypairs must not use the `NEXT_PUBLIC_` prefix when you do set
them explicitly.

### 3. Deploy And Initialize

```bash
./scripts/deploy-smart-contract.sh
pnpm --dir apps init:devnet
```

After `init:devnet` finishes, copy the printed values back into `apps/.env.local`:

```env
NEXT_PUBLIC_PAYMENT_MINT=...
NEXT_PUBLIC_TREASURY_ADDRESS=...
```

### 4. Seed Images

```bash
./scripts/upload-images-to-ipfs.sh
./scripts/reseed-images-to-smart-contract.sh
./scripts/seed-new-images-to-redis.sh
```

If an image changes but keeps the same filename, force a new IPFS upload:

```bash
FORCE_IPFS_UPLOAD=true ./scripts/upload-images-to-ipfs.sh
```

### 5. Verify App

```bash
pnpm --dir apps build
pnpm --dir apps dev
```

The app uses Turbopack for `dev` and `build`.

### Upgrade Later

```bash
./scripts/upgrade-smart-contract.sh
pnpm --dir apps build
```
