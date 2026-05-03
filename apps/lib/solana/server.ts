import { AnchorProvider } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";
import os from "os";
import path from "path";
import { createSolanaConnection } from "./connection";
import { createDuelSnapProgram } from "./program";

type ServerSignerName =
  | "RELAYER_KEYPAIR_JSON"
  | "VERIFIER_KEYPAIR_JSON"
  | "FAUCET_KEYPAIR_JSON";

function keypairFromJsonEnv(name: ServerSignerName) {
  const raw = process.env[name];
  if (!raw) {
    return keypairFromSolanaConfig(name);
  }

  let secret: unknown;
  try {
    secret = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON array keypair`);
  }

  if (!Array.isArray(secret)) {
    throw new Error(`${name} must be a JSON array keypair`);
  }

  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function keypairFromSolanaConfig(name: ServerSignerName) {
  const keypairPath =
    process.env.SOLANA_KEYPAIR_PATH ??
    path.join(os.homedir(), ".config/solana/id.json");

  if (!fs.existsSync(keypairPath)) {
    throw new Error(
      `${name} is not configured and Solana keypair was not found at ${keypairPath}`,
    );
  }

  let secret: unknown;
  try {
    secret = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
  } catch {
    throw new Error(`${keypairPath} must be a JSON array keypair`);
  }

  if (!Array.isArray(secret)) {
    throw new Error(`${keypairPath} must be a JSON array keypair`);
  }

  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function walletFromKeypair(keypair: Keypair): AnchorProvider["wallet"] {
  function signTransactionWithKeypair<T>(transaction: T): T {
    const signable = transaction as {
      version?: unknown;
      sign: (...args: unknown[]) => void;
    };
    if ("version" in signable) {
      signable.sign([keypair]);
    } else {
      signable.sign(keypair);
    }
    return transaction;
  }

  return {
    publicKey: keypair.publicKey,
    signAllTransactions: async (transactions) => {
      for (const transaction of transactions) {
        signTransactionWithKeypair(transaction);
      }
      return transactions;
    },
    signTransaction: async (transaction) => {
      return signTransactionWithKeypair(transaction);
    },
  };
}

export function createServerDuelSnapProgram(keypair: Keypair) {
  const connection = createSolanaConnection();
  const program = createDuelSnapProgram(connection, walletFromKeypair(keypair));
  return { connection, program };
}

export function getRelayerKeypair() {
  return keypairFromJsonEnv("RELAYER_KEYPAIR_JSON");
}

export function getVerifierKeypair() {
  return keypairFromJsonEnv("VERIFIER_KEYPAIR_JSON");
}

export function getFaucetKeypair() {
  return keypairFromJsonEnv("FAUCET_KEYPAIR_JSON");
}

export function parseSolanaAddress(value: unknown, field = "address") {
  if (typeof value !== "string") throw new Error(`Missing ${field}`);
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid ${field}`);
  }
}
