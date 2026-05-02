import type { AnchorProvider } from "@coral-xyz/anchor";
import { Connection } from "@solana/web3.js";
import { getSolanaRpcUrl } from "./config";

export function createSolanaConnection(
  commitment: AnchorProvider["opts"]["commitment"] = "confirmed",
) {
  return new Connection(getSolanaRpcUrl(), commitment);
}
