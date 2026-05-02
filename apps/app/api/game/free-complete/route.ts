import { BN } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { configPda, dailyPlayPda } from "../../../../lib/solana/pda";
import {
  createServerDuelpicProgram,
  getRelayerKeypair,
  parseSolanaAddress,
} from "../../../../lib/solana/server";

function currentDayId() {
  return Math.floor(Date.now() / 86_400_000);
}

export async function POST(req: Request) {
  try {
    const { address } = await req.json();
    const player = parseSolanaAddress(address);
    const relayer = getRelayerKeypair();
    const { program } = createServerDuelpicProgram(relayer);
    const dayId = currentDayId();
    const dailyPlay = dailyPlayPda(player, dayId);

    try {
      await program.account.dailyPlay.fetch(dailyPlay);
    } catch {
      await program.methods
        .initializeDailyPlay(new BN(dayId))
        .accountsStrict({
          config: configPda(),
          dailyPlay,
          player,
          relayer: relayer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const signature = await program.methods
      .incrementDailyCount()
      .accountsStrict({
        config: configPda(),
        dailyPlay,
        relayer: relayer.publicKey,
      })
      .rpc();

    return NextResponse.json({ ok: true, signature });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
