import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import { getPaymentMint } from "./config";

export function paymentAta(owner: PublicKey, allowOwnerOffCurve = false) {
  return getAssociatedTokenAddressSync(
    getPaymentMint(),
    owner,
    allowOwnerOffCurve,
  );
}
