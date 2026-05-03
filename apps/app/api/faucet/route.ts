import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { NextResponse } from "next/server";
import { getPaymentMint, getSolanaCluster } from "../../../lib/solana/config";
import { createSolanaConnection } from "../../../lib/solana/connection";
import {
  getFaucetKeypair,
  parseSolanaAddress,
} from "../../../lib/solana/server";

const FAUCET_AMOUNT_RAW = 3_000_000;
const SOL_AIRDROP_LAMPORTS = Math.floor(0.05 * LAMPORTS_PER_SOL);
const COOLDOWN_MS = 8 * 60 * 60 * 1000;

const lastClaim = new Map<string, number>();
type FaucetAsset = "sol" | "usdc" | "all";

function faucetKey(address: string, asset: FaucetAsset) {
  return `${address}:${asset}`;
}

function parseAsset(value: unknown): FaucetAsset {
  return value === "sol" || value === "usdc" || value === "all"
    ? value
    : "all";
}

async function fundSol(
  connection: ReturnType<typeof createSolanaConnection>,
  faucet: ReturnType<typeof getFaucetKeypair>,
  recipient: ReturnType<typeof parseSolanaAddress>,
) {
  if (getSolanaCluster() === "mainnet-beta") {
    return { signature: null, source: null };
  }

  try {
    const signature = await connection.requestAirdrop(
      recipient,
      SOL_AIRDROP_LAMPORTS,
    );
    await connection.confirmTransaction(signature, "confirmed");
    return { signature, source: "airdrop" as const };
  } catch {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: faucet.publicKey,
        toPubkey: recipient,
        lamports: SOL_AIRDROP_LAMPORTS,
      }),
    );
    const signature = await connection.sendTransaction(transaction, [faucet]);
    await connection.confirmTransaction(signature, "confirmed");
    return { signature, source: "faucet" as const };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) return NextResponse.json({ cooldownUntil: 0 });
  const solLast = lastClaim.get(faucetKey(address, "sol")) ?? 0;
  const usdcLast = lastClaim.get(faucetKey(address, "usdc")) ?? 0;
  return NextResponse.json({
    cooldownUntil: Math.max(solLast, usdcLast) + COOLDOWN_MS,
    solCooldownUntil: solLast + COOLDOWN_MS,
    usdcCooldownUntil: usdcLast + COOLDOWN_MS,
  });
}

export async function POST(req: Request) {
  try {
    const { address, asset: rawAsset } = await req.json();
    const asset = parseAsset(rawAsset);
    const recipient = parseSolanaAddress(address);
    const key = recipient.toBase58();
    const now = Date.now();
    const cooldownAsset = asset === "all" ? "usdc" : asset;
    const last = lastClaim.get(faucetKey(key, cooldownAsset)) ?? 0;
    const remaining = COOLDOWN_MS - (now - last);

    if (remaining > 0) {
      return NextResponse.json(
        { error: "Cooldown active", cooldownUntil: last + COOLDOWN_MS },
        { status: 429 },
      );
    }

    const faucet = getFaucetKeypair();
    const connection = createSolanaConnection();
    let solFundingSignature: string | null = null;
    let solFundingSource: "airdrop" | "faucet" | null = null;
    if (asset === "sol" || asset === "all") {
      const solFunding = await fundSol(connection, faucet, recipient);
      solFundingSignature = solFunding.signature;
      solFundingSource = solFunding.source;
    }

    let tokenMintSignature: string | null = null;
    if (asset === "usdc" || asset === "all") {
      const mint = getPaymentMint();
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        faucet,
        mint,
        recipient,
      );

      tokenMintSignature = await mintTo(
        connection,
        faucet,
        mint,
        ata.address,
        faucet,
        FAUCET_AMOUNT_RAW,
      );
    }

    if (asset === "sol" || asset === "all") {
      lastClaim.set(faucetKey(key, "sol"), now);
    }
    if (asset === "usdc" || asset === "all") {
      lastClaim.set(faucetKey(key, "usdc"), now);
    }

    return NextResponse.json({
      tokenMintSignature,
      solFundingSignature,
      solFundingSource,
      solAmount: "0.05",
      tokenAmount: "3.00",
      tokenAmountRaw: String(FAUCET_AMOUNT_RAW),
      cooldownUntil: now + COOLDOWN_MS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Faucet failed";
    const userMsg = /insufficient funds|custom program error|0x1/i.test(msg)
      ? "Faucet is out of funds. Please try again later."
      : msg;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
