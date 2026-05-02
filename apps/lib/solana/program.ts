import { AnchorProvider, type Idl, Program } from "@coral-xyz/anchor";
import { type Connection, Keypair } from "@solana/web3.js";
import { getDuelpicProgramId } from "./config";
import idl from "./idl/duelpic.json";
import type { Duelpic } from "./types/duelpic";

type AnchorWallet = AnchorProvider["wallet"];

export function createDuelpicProgram(
  connection: Connection,
  wallet: AnchorWallet,
) {
  const programId = getDuelpicProgramId();
  const runtimeIdl = { ...idl, address: programId.toBase58() } as Idl;
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  return new Program<Duelpic>(runtimeIdl, provider);
}

export function createReadonlyDuelpicProgram(connection: Connection) {
  const readonlyKeypair = Keypair.generate();
  return createDuelpicProgram(connection, {
    publicKey: readonlyKeypair.publicKey,
    signAllTransactions: async (transactions) => transactions,
    signTransaction: async (transaction) => transaction,
  });
}

export const DUELPIC_PROGRAM_ID = getDuelpicProgramId();
