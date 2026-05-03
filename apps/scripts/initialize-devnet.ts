import { BN } from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { configPda } from "../lib/solana/pda";
import { createServerDuelSnapProgram } from "../lib/solana/server";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

function keypairFromJson(raw: string, source: string) {
  const secret = JSON.parse(raw);
  if (!Array.isArray(secret)) throw new Error(`${source} must be a JSON array`);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function defaultSolanaKeypairPath() {
  return (
    process.env.SOLANA_KEYPAIR_PATH ??
    path.join(os.homedir(), ".config/solana/id.json")
  );
}

function keypairFromEnvOrSolanaConfig(name: string) {
  const raw = process.env[name];
  if (raw) return keypairFromJson(raw, name);

  const keypairPath = defaultSolanaKeypairPath();
  if (!fs.existsSync(keypairPath)) {
    throw new Error(
      `${name} is not configured and Solana keypair was not found at ${keypairPath}`,
    );
  }

  return keypairFromJson(fs.readFileSync(keypairPath, "utf8"), keypairPath);
}

function optionalPublicKey(name: string, fallback: PublicKey) {
  const raw = process.env[name];
  return raw ? new PublicKey(raw) : fallback;
}

function printEnvValues(programId: PublicKey, paymentMint: PublicKey, treasury: PublicKey) {
  console.log("Update apps/.env.local with:");
  console.log(`NEXT_PUBLIC_DUELSNAP_PROGRAM_ID=${programId.toBase58()}`);
  console.log(`NEXT_PUBLIC_PAYMENT_MINT=${paymentMint.toBase58()}`);
  console.log(`NEXT_PUBLIC_TREASURY_ADDRESS=${treasury.toBase58()}`);
}

async function main() {
  const admin = keypairFromEnvOrSolanaConfig(
    process.env.ADMIN_KEYPAIR_JSON ? "ADMIN_KEYPAIR_JSON" : "SEED_KEYPAIR_JSON",
  );
  const verifier = keypairFromEnvOrSolanaConfig("VERIFIER_KEYPAIR_JSON");
  const relayer = keypairFromEnvOrSolanaConfig("RELAYER_KEYPAIR_JSON");
  const faucet = keypairFromEnvOrSolanaConfig("FAUCET_KEYPAIR_JSON");
  const { connection, program } = createServerDuelSnapProgram(admin);
  const decimals = Number(process.env.NEXT_PUBLIC_PAYMENT_DECIMALS ?? 6);

  try {
    const config = await program.account.config.fetch(configPda());
    console.log(`Config already initialized: ${configPda().toBase58()}`);
    console.log("");
    printEnvValues(program.programId, config.paymentMint, config.treasury);
    return;
  } catch {
    // Missing config is the expected first-run path.
  }

  const paymentMint = process.env.NEXT_PUBLIC_PAYMENT_MINT
    ? new PublicKey(process.env.NEXT_PUBLIC_PAYMENT_MINT)
    : await createMint(connection, admin, faucet.publicKey, null, decimals);
  const treasury = optionalPublicKey(
    "NEXT_PUBLIC_TREASURY_ADDRESS",
    admin.publicKey,
  );

  const signature = await program.methods
    .initializeConfig(
      Number(process.env.DAILY_FREE_LIMIT ?? 3),
      new BN(process.env.CASUAL_FEE_AMOUNT_RAW ?? "1000000"),
    )
    .accountsStrict({
      config: configPda(),
      admin: admin.publicKey,
      verifier: verifier.publicKey,
      relayer: relayer.publicKey,
      treasury,
      paymentMint,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`Initialized DuelSnap config: ${signature}`);
  console.log("");
  printEnvValues(program.programId, paymentMint, treasury);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
