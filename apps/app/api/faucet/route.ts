import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) return NextResponse.json({ cooldownUntil: 0 });
  const last = lastClaim.get(address) ?? 0;
  return NextResponse.json({ cooldownUntil: last + COOLDOWN_MS });
}

export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    const recipient = parseSolanaAddress(address);
    const key = recipient.toBase58();
    const now = Date.now();
    const last = lastClaim.get(key) ?? 0;
    const remaining = COOLDOWN_MS - (now - last);

    if (remaining > 0) {
      return NextResponse.json(
        { error: "Cooldown active", cooldownUntil: last + COOLDOWN_MS },
        { status: 429 },
      );
    }

    const faucet = getFaucetKeypair();
    const connection = createSolanaConnection();
    const mint = getPaymentMint();
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      faucet,
      mint,
      recipient,
    );

    let solAirdropSignature: string | null = null;
    if (getSolanaCluster() !== "mainnet-beta") {
      try {
        solAirdropSignature = await connection.requestAirdrop(
          recipient,
          SOL_AIRDROP_LAMPORTS,
        );
        await connection.confirmTransaction(solAirdropSignature, "confirmed");
      } catch {
        solAirdropSignature = null;
      }
    }

    const tokenMintSignature = await mintTo(
      connection,
      faucet,
      mint,
      ata.address,
      faucet,
      FAUCET_AMOUNT_RAW,
    );

    lastClaim.set(key, now);

    return NextResponse.json({
      tokenMintSignature,
      solAirdropSignature,
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
