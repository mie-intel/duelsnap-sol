import { PublicKey } from "@solana/web3.js";
import { DUELPIC_PROGRAM_ID } from "./program";

const textEncoder = new TextEncoder();

function u64Le(value: number | bigint) {
  const buffer = new Uint8Array(8);
  new DataView(buffer.buffer).setBigUint64(0, BigInt(value), true);
  return buffer;
}

function i64Le(value: number | bigint) {
  const buffer = new Uint8Array(8);
  new DataView(buffer.buffer).setBigInt64(0, BigInt(value), true);
  return buffer;
}

export function configPda() {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("config")],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function questionPda(questionId: number | bigint) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("question"), u64Le(questionId)],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function verifiedPoolPda(page: number | bigint) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("verified_pool"), u64Le(page)],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function dailyPlayPda(player: PublicKey, dayId: number | bigint) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("daily"), player.toBuffer(), i64Le(dayId)],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function royaltyPda(contributor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("royalty"), contributor.toBuffer()],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function royaltyVaultAuthorityPda() {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("royalty_vault_authority")],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function sessionPda(sessionId: Uint8Array) {
  if (sessionId.length !== 32) throw new Error("sessionId must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("session"), sessionId],
    DUELPIC_PROGRAM_ID,
  )[0];
}

export function sessionVaultAuthorityPda(session: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [textEncoder.encode("session_vault_authority"), session.toBuffer()],
    DUELPIC_PROGRAM_ID,
  )[0];
}
