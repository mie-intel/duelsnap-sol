import { AnchorProvider } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PublicKey,
  Transaction,
  type VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { getPaymentMint } from "./config";
import { createSolanaConnection } from "./connection";
import { createDuelpicProgram } from "./program";

export type BrowserSolanaWallet = {
  publicKey: PublicKey;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions?: (transactions: Transaction[]) => Promise<Transaction[]>;
  connect?: () => Promise<{ publicKey: PublicKey }>;
  disconnect?: () => Promise<void>;
};

export function createBrowserDuelpicProgram(wallet: BrowserSolanaWallet) {
  const connection = createSolanaConnection();
  const providerWallet: AnchorProvider["wallet"] = {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      transaction: T,
    ) => wallet.signTransaction(transaction as Transaction) as Promise<T>,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      transactions: T[],
    ) => {
      if (wallet.signAllTransactions) {
        return wallet.signAllTransactions(transactions as Transaction[]) as Promise<T[]>;
      }
      return Promise.all(
        transactions.map((tx) => wallet.signTransaction(tx as Transaction)),
      ) as Promise<T[]>;
    },
  };
  return {
    connection,
    program: createDuelpicProgram(connection, providerWallet),
  };
}

export async function sendWalletTransaction(
  wallet: BrowserSolanaWallet,
  instructions: TransactionInstruction[],
) {
  const connection = createSolanaConnection();
  const transaction = new Transaction();
  transaction.add(...instructions);
  transaction.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  const signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}

export function createPaymentAtaInstruction(
  owner: PublicKey,
  payer: PublicKey,
  allowOwnerOffCurve = false,
) {
  const ata = getAssociatedTokenAddressSync(
    getPaymentMint(),
    owner,
    allowOwnerOffCurve,
  );
  return {
    ata,
    instruction: createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      getPaymentMint(),
      TOKEN_PROGRAM_ID,
    ),
  };
}
