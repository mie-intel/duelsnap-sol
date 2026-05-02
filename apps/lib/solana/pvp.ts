import { randomBytes } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { sessionPda } from "./pda";

export function createSessionSeed() {
  return randomBytes(32);
}

export function sessionSeedToHex(seed: Uint8Array) {
  return Buffer.from(seed).toString("hex");
}

export function sessionSeedFromHex(value: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("Invalid sessionId");
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

export function sessionAddressFromId(sessionId: string) {
  return sessionPda(sessionSeedFromHex(sessionId));
}

export function solanaWinner(value: string | PublicKey) {
  if (value instanceof PublicKey) return value;
  if (value === "tie") return PublicKey.default;
  return new PublicKey(value);
}
