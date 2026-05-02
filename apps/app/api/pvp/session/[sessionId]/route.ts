import { NextResponse } from "next/server";
import { redis } from "../../../../../lib/redis/client";
import { parseRedisArray } from "../../../../../lib/redis/json";
import { createSolanaConnection } from "../../../../../lib/solana/connection";
import { createReadonlyDuelpicProgram } from "../../../../../lib/solana/program";
import { sessionAddressFromId } from "../../../../../lib/solana/pvp";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const connection = createSolanaConnection();
    const program = createReadonlyDuelpicProgram(connection);
    const session = await program.account.session.fetch(
      sessionAddressFromId(sessionId),
    );

    const qRaw = await redis.get<unknown>(`pvp:${sessionId}:q`);
    const questionIds = parseRedisArray<string | number | bigint>(qRaw).map(
      String,
    );
    const winner = await redis.get<string>(`pvp:${sessionId}:winner`);

    return NextResponse.json({
      id: sessionId,
      sessionAddress: sessionAddressFromId(sessionId).toBase58(),
      player1: session.player1.toBase58(),
      player2: session.player2.toBase58(),
      wager: session.wager.toString(),
      status: session.status,
      questionIds,
      winner: winner ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
