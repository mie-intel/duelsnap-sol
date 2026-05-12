# DuelSnap

## Quick Links

- Live MVP: https://duelsnap.vercel.app
- GitHub: https://github.com/mie-intel/duelsnap-sol
- Demo Video: https://youtu.be/pqV3g4XfDoQ
- Pitch Video: https://youtu.be/kCEyHyxBiVU

DuelSnap is a Solana picture-guessing game with on-chain rewards, PvP escrow,
and contributor royalties. The repository contains both the Anchor program and
the Next.js application.

## What This Project Is

DuelSnap turns a familiar casual game loop into a small, transparent game
economy:

- Players guess pictures in fast mobile-first rounds.
- Free Casual mode lets users learn the game before spending anything.
- Paid Casual mode lets players enter a low-stakes USDC session.
- PvP Ranked mode matches two players on the same questions and settles the
  wager through the Solana program.
- Contributors can upload image questions and earn royalties when their
  questions are used in paid sessions.

The product is built for mobile casual gamers, especially crypto-curious users
who want consumer Solana apps beyond trading, and for lightweight creators who
can create useful image questions but do not already have an audience.

## What It Solves

Casual games capture a lot of player time, but the value usually stays inside a
centralized platform. Players earn nothing for skill, and small creators have no
simple way to monetize individual pieces of content such as quiz questions.

DuelSnap solves this by adding programmable settlement to a simple game:

- Player rewards are tied to game results, not speculation.
- PvP wagers are held and settled by the Solana program.
- Contributor royalties are encoded as transparent payout rules.
- Micro-payments are practical because Solana fees are low.
- The app can onboard users with a free mode before asking for wallet actions or
  paid sessions.

## Why Solana

The blockchain is used for the parts that need trust and auditability:

- Program-controlled escrow for PvP matches.
- Settlement rules for winner, contributor, and treasury splits.
- Royalty accounting for question contributors.
- SPL token payments for USDC-style micro-rewards.
- Public program accounts and transactions for judge/developer verification.

Free Casual gameplay and fast session state are intentionally supported by the
web app and Redis for UX speed. The economic flows are represented in the Anchor
program.

## Features

- Free Casual picture-guessing sessions.
- Paid Casual sessions with contributor and treasury payout logic.
- PvP lobby, match state, answer submission, escrow, and settlement flow.
- Contribute-to-Earn image upload flow.
- IPFS storage through Pinata.
- AI-assisted question verification through Gemini.
- Redis-backed answer/image lookup and session state.
- Solana faucet route for dev/test payment token distribution.
- Anchor IDL and generated TypeScript client types used by the app.

## Repository Structure

```text
.
|-- apps/                       # Next.js app, API routes, wallet/client code
|   |-- app/                    # App Router pages and API routes
|   |-- components/             # Game, wallet, nav, and UI components
|   |-- hooks/                  # Game session, wallet, stats hooks
|   |-- lib/                    # Solana, Redis, IPFS, Gemini helpers
|   `-- scripts/                # Devnet init and seed scripts
|-- contracts/                  # Anchor workspace
|   |-- programs/contracts/src/ # DuelSnap program instructions/state/errors
|   |-- tests/                  # Anchor integration tests
|   `-- Anchor.toml             # Localnet/devnet program config
|-- scripts/                    # Root deployment and seed convenience scripts
|-- strategy/                   # Pitch, validation, and hackathon notes
`-- VIDEO.md                    # Suggested hackathon demo recording flow
```

## Prerequisites

- Node.js 18+.
- pnpm.
- Rust and Cargo.
- Solana CLI.
- Anchor CLI compatible with the project dependencies.
- A Solana keypair with devnet SOL for deploy/init transactions.
- Pinata account/JWT for IPFS uploads.
- Upstash Redis REST database.
- Privy app ID for wallet login.
- Gemini API key if strict AI verification is enabled.

## Environment Variables

Create `apps/.env.local`. The app and scripts load environment values from this
file.

```env
# Public Solana/app config
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_WS_URL=wss://api.devnet.solana.com
NEXT_PUBLIC_PRIVY_APP_ID=<privy_app_id>
NEXT_PUBLIC_DUELSNAP_PROGRAM_ID=3o6vAECHh7CDLvbFn6DzTMMDFqbSmEbC9JLb4TAQn2Za
NEXT_PUBLIC_PAYMENT_MINT=<spl_payment_mint_pubkey>
NEXT_PUBLIC_PAYMENT_SYMBOL=USDC
NEXT_PUBLIC_PAYMENT_DECIMALS=6
NEXT_PUBLIC_TREASURY_ADDRESS=<treasury_pubkey>
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud

# Server-only keypairs.
# Values are JSON arrays from a Solana keypair file, for example [1,2,3,...].
# If omitted, scripts fall back to SOLANA_KEYPAIR_PATH or ~/.config/solana/id.json.
ADMIN_KEYPAIR_JSON=<optional_admin_keypair_json_array>
SEED_KEYPAIR_JSON=<seed_or_admin_keypair_json_array>
VERIFIER_KEYPAIR_JSON=<verifier_keypair_json_array>
RELAYER_KEYPAIR_JSON=<relayer_keypair_json_array>
FAUCET_KEYPAIR_JSON=<faucet_keypair_json_array>
SOLANA_KEYPAIR_PATH=/absolute/path/to/id.json

# App services
PINATA_JWT=<pinata_jwt>
GEMINI_API_KEY=<gemini_api_key>
UPSTASH_REDIS_REST_URL=<upstash_redis_rest_url>
UPSTASH_REDIS_REST_TOKEN=<upstash_redis_rest_token>

# Question review behavior
# assisted auto-approves after storing metadata; strict calls Gemini first.
QUESTION_REVIEW_MODE=assisted
AI_FAILS_AS_ERROR=true

# Devnet initialization knobs
DAILY_FREE_LIMIT=3
CASUAL_FEE_AMOUNT_RAW=1000000

# Seeding knobs
SEED_MODE=all
FORCE_IPFS_UPLOAD=false
SEED_ANSWERS_PATH=apps/scripts/seed-data/answers.json
SEED_IMAGES_DIR=apps/scripts/seed-data/images
SEED_MANIFEST_PATH=apps/scripts/seed-data/ipfs-manifest.json
SEED_REDIS_START_ID=1

# Root deploy scripts
ANCHOR_PROVIDER_URL=devnet
DUELSNAP_PROGRAM_ID=3o6vAECHh7CDLvbFn6DzTMMDFqbSmEbC9JLb4TAQn2Za
```

### Required For App Runtime

- `NEXT_PUBLIC_SOLANA_CLUSTER`
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_PRIVY_APP_ID`
- `NEXT_PUBLIC_DUELSNAP_PROGRAM_ID`
- `NEXT_PUBLIC_PAYMENT_MINT`
- `NEXT_PUBLIC_PAYMENT_SYMBOL`
- `NEXT_PUBLIC_PAYMENT_DECIMALS`
- `NEXT_PUBLIC_TREASURY_ADDRESS`
- `PINATA_JWT`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RELAYER_KEYPAIR_JSON`
- `VERIFIER_KEYPAIR_JSON`
- `FAUCET_KEYPAIR_JSON`

`NEXT_PUBLIC_SOLANA_WS_URL` and `NEXT_PUBLIC_IPFS_GATEWAY` have fallbacks, but
setting them explicitly is recommended.

### Required For Initialization And Seeding

- `SEED_KEYPAIR_JSON` or `ADMIN_KEYPAIR_JSON`, unless using
  `SOLANA_KEYPAIR_PATH`.
- `VERIFIER_KEYPAIR_JSON`, unless using `SOLANA_KEYPAIR_PATH`.
- `RELAYER_KEYPAIR_JSON`, unless using `SOLANA_KEYPAIR_PATH`.
- `FAUCET_KEYPAIR_JSON`, unless using `SOLANA_KEYPAIR_PATH`.
- `PINATA_JWT` for IPFS upload.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for Redis seed data.

Never expose server-only keypair values with a `NEXT_PUBLIC_` prefix.

## Install Dependencies

Install app dependencies:

```bash
pnpm --dir apps install
```

Install contract dependencies:

```bash
pnpm --dir contracts install
```

If you prefer, running `pnpm install` from the repository root may also work in
your environment, but the app and contract workspaces each have their own lock
files.

## Deploy And Initialize On Devnet

Run commands from the repository root.

### 1. Configure The Solana CLI

```bash
solana config set --url devnet
solana airdrop 2
```

Use a funded deployer/admin keypair. You can provide it through
`SOLANA_KEYPAIR_PATH`, `ADMIN_KEYPAIR_JSON`, or `SEED_KEYPAIR_JSON`.

### 2. Deploy The Anchor Program

```bash
./scripts/deploy-smart-contract.sh
```

This script runs `anchor build`, deploys the program, and copies the generated
IDL/types into:

- `apps/lib/solana/idl/duelsnap.json`
- `apps/lib/solana/types/duelsnap.ts`

### 3. Initialize Devnet Config

```bash
pnpm --dir apps init:devnet
```

After the script finishes, copy the printed values back into `apps/.env.local`:

```env
NEXT_PUBLIC_DUELSNAP_PROGRAM_ID=<printed_program_id>
NEXT_PUBLIC_PAYMENT_MINT=<printed_payment_mint>
NEXT_PUBLIC_TREASURY_ADDRESS=<printed_treasury_address>
```

If `NEXT_PUBLIC_PAYMENT_MINT` is not set before initialization, the script
creates a new SPL mint with `FAUCET_KEYPAIR_JSON` as mint authority.

## Seed Questions

Seed images live in `apps/scripts/seed-data/images`, answers live in
`apps/scripts/seed-data/answers.json`, and the generated IPFS manifest lives in
`apps/scripts/seed-data/ipfs-manifest.json`.

Run the full seed flow:

```bash
pnpm --dir apps seed
```

Or run the steps separately from the repository root:

```bash
./scripts/upload-images-to-ipfs.sh
./scripts/reseed-images-to-smart-contract.sh
./scripts/seed-new-images-to-redis.sh
```

If an image changes but keeps the same filename, force a fresh IPFS upload:

```bash
FORCE_IPFS_UPLOAD=true ./scripts/upload-images-to-ipfs.sh
```

## Run The Web App

```bash
pnpm --dir apps dev
```

Open `http://localhost:3000`.

Build for production:

```bash
pnpm --dir apps build
pnpm --dir apps start
```

## Useful Scripts

From `apps/`:

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm format
pnpm seed
pnpm seed:ipfs
pnpm seed:onchain
pnpm seed:redis
pnpm init:devnet
```

From `contracts/`:

```bash
anchor build
anchor test
pnpm lint
pnpm lint:fix
```

From the repository root:

```bash
./scripts/deploy-smart-contract.sh
./scripts/upgrade-smart-contract.sh
./scripts/upload-images-to-ipfs.sh
./scripts/reseed-images-to-smart-contract.sh
./scripts/seed-new-images-to-redis.sh
```

## Upgrade Program Later

```bash
./scripts/upgrade-smart-contract.sh
pnpm --dir apps build
```

`DUELSNAP_PROGRAM_ID` can be provided to `scripts/upgrade-smart-contract.sh`.
If omitted, the script uses the current devnet program ID from the project.
