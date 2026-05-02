import { PublicKey } from "@solana/web3.js";

export type SolanaCluster = "localnet" | "devnet" | "mainnet-beta";

const DEFAULT_LOCALNET_RPC = "http://127.0.0.1:8899";
const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "71PBFBGXGnYJekctFqKYAhBMgYXHpoLwhxg8CxG2pm6b";

function publicKeyFromEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is not configured`);
  return new PublicKey(value);
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

export function getDuelpicProgramId() {
  return publicKeyFromEnv("NEXT_PUBLIC_DUELPIC_PROGRAM_ID", DEFAULT_PROGRAM_ID);
}

export function getPaymentMint() {
  return publicKeyFromEnv("NEXT_PUBLIC_PAYMENT_MINT");
}

export function getTreasuryAddress() {
  return publicKeyFromEnv("NEXT_PUBLIC_TREASURY_ADDRESS");
}

export const PAYMENT_DECIMALS = Number(
  process.env.NEXT_PUBLIC_PAYMENT_DECIMALS ?? 6,
);

export const PAYMENT_SYMBOL = process.env.NEXT_PUBLIC_PAYMENT_SYMBOL ?? "USDC";
