import { AnchorProvider, type Idl, Program } from "@coral-xyz/anchor";
import { type Connection, Keypair } from "@solana/web3.js";
import { getDuelSnapProgramId } from "./config";
import idl from "./idl/duelsnap.json";
import type { Duelsnap as DuelSnap } from "./types/duelsnap";

type AnchorWallet = AnchorProvider["wallet"];

export function createDuelSnapProgram(
  connection: Connection,
  wallet: AnchorWallet,
) {
  const programId = getDuelSnapProgramId();
  const runtimeIdl = { ...idl, address: programId.toBase58() } as Idl;
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  return new Program<DuelSnap>(runtimeIdl, provider);
}

export function createReadonlyDuelSnapProgram(connection: Connection) {
  const readonlyKeypair = Keypair.generate();
  return createDuelSnapProgram(connection, {
    publicKey: readonlyKeypair.publicKey,
    signAllTransactions: async (transactions) => transactions,
    signTransaction: async (transaction) => transaction,
  });
}

export const DUELSNAP_PROGRAM_ID = getDuelSnapProgramId();
