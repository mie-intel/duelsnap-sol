import { PublicKey } from "@solana/web3.js";

export type SolanaCluster = "localnet" | "devnet" | "mainnet-beta";

const DEFAULT_LOCALNET_RPC = "http://127.0.0.1:8899";
const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "3o6vAECHh7CDLvbFn6DzTMMDFqbSmEbC9JLb4TAQn2Za";

function publicKeyFromValue(
  name: string,
  value: string | undefined,
  fallback?: string,
) {
  const resolved = value ?? fallback;
  if (!resolved) throw new Error(`${name} is not configured`);
  return new PublicKey(resolved);
}

export function getSolanaCluster(): SolanaCluster {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "localnet";
  if (
    cluster === "localnet" ||
    cluster === "devnet" ||
    cluster === "mainnet-beta"
  ) {
    return cluster;
  }
  throw new Error(`Unsupported Solana cluster: ${cluster}`);
}

export function getSolanaRpcUrl() {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    (getSolanaCluster() === "localnet"
      ? DEFAULT_LOCALNET_RPC
      : DEFAULT_DEVNET_RPC)
  );
}

export function getDuelSnapProgramId() {
  return publicKeyFromValue(
    "NEXT_PUBLIC_DUELSNAP_PROGRAM_ID",
    process.env.NEXT_PUBLIC_DUELSNAP_PROGRAM_ID,
    DEFAULT_PROGRAM_ID,
  );
}

export function getPaymentMint() {
  return publicKeyFromValue(
    "NEXT_PUBLIC_PAYMENT_MINT",
    process.env.NEXT_PUBLIC_PAYMENT_MINT,
  );
}

export function getTreasuryAddress() {
  return publicKeyFromValue(
    "NEXT_PUBLIC_TREASURY_ADDRESS",
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS,
  );
}

export const PAYMENT_DECIMALS = Number(
  process.env.NEXT_PUBLIC_PAYMENT_DECIMALS ?? 6,
);

export const PAYMENT_SYMBOL = process.env.NEXT_PUBLIC_PAYMENT_SYMBOL ?? "USDC";
