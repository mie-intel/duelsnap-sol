This is the Next.js frontend for DuelSnap, a Solana picture-guessing game.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- Solana wallet browser extension
- Environment variables configured in `.env.local`

### Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```env
NEXT_PUBLIC_SOLANA_CLUSTER=localnet
NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
NEXT_PUBLIC_SOLANA_WS_URL=ws://127.0.0.1:8900
NEXT_PUBLIC_PRIVY_APP_ID=<privy_app_id>
NEXT_PUBLIC_DUELSNAP_PROGRAM_ID=<program_id>
NEXT_PUBLIC_PAYMENT_MINT=<mock_usdc_spl_mint>
NEXT_PUBLIC_PAYMENT_SYMBOL=USDC
NEXT_PUBLIC_PAYMENT_DECIMALS=6
NEXT_PUBLIC_TREASURY_ADDRESS=<treasury_pubkey>

RELAYER_KEYPAIR_JSON=[...]
VERIFIER_KEYPAIR_JSON=[...]
FAUCET_KEYPAIR_JSON=[...]
SEED_KEYPAIR_JSON=[...]

PINATA_JWT=...
GEMINI_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Server-only keypair values must never be exposed with `NEXT_PUBLIC_`.

## Tech Stack

- **Framework:** Next.js 16 + App Router
- **Styling:** TailwindCSS v4
- **Solana:** Anchor TS client, `@solana/web3.js`, `@solana/spl-token`
- **State:** TanStack Query
- **Backend:** Next.js API routes
- **Caching:** Upstash Redis
- **Storage:** IPFS via Pinata
- **AI:** Google Gemini

## Scripts

```bash
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm seed
```

`pnpm dev` and `pnpm build` run with Turbopack.

`pnpm seed` uploads seed images to Pinata, submits questions to the Solana program, verifies them, and writes answers/image URLs to Redis. You can also run the root scripts from the repository root:

```bash
./scripts/deploy-smart-contract.sh
pnpm --dir apps init:devnet
./scripts/upload-images-to-ipfs.sh
./scripts/reseed-images-to-smart-contract.sh
./scripts/seed-new-images-to-redis.sh
./scripts/upgrade-smart-contract.sh
```
