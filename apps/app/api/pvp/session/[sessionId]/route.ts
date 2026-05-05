import { NextResponse } from "next/server";
import { redis } from "../../../../../lib/redis/client";
import { parseRedisArray } from "../../../../../lib/redis/json";
import { createSolanaConnection } from "../../../../../lib/solana/connection";
import { createReadonlyDuelSnapProgram } from "../../../../../lib/solana/program";
import { sessionAddressFromId } from "../../../../../lib/solana/pvp";

const STATUS_DONE = 4;

function inferWinnerFromSession(session: {
  player1: { toBase58(): string };
  player2: { toBase58(): string };
  score1: number;
  score2: number;
  status: number;
}) {
  if (session.status !== STATUS_DONE) return null;
  if (session.score1 > session.score2) return session.player1.toBase58();
  if (session.score2 > session.score1) return session.player2.toBase58();
  return "tie";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const connection = createSolanaConnection();
    const program = createReadonlyDuelSnapProgram(connection);
    const session = await program.account.session.fetch(
      sessionAddressFromId(sessionId),
    );

    const qRaw = await redis.get<unknown>(`pvp:${sessionId}:q`);
    const questionIds = parseRedisArray<string | number | bigint>(qRaw).map(
      String,
    );
    const [storedWinner, resolveError] = await Promise.all([
      redis.get<string>(`pvp:${sessionId}:winner`),
      redis.get<string>(`pvp:${sessionId}:resolveError`),
    ]);
    const winner = storedWinner ?? inferWinnerFromSession(session);

    return NextResponse.json({
      id: sessionId,
      sessionAddress: sessionAddressFromId(sessionId).toBase58(),
      player1: session.player1.toBase58(),
      player2: session.player2.toBase58(),
      wager: session.wager.toString(),
      status: session.status,
      questionIds,
      winner,
      resolveError: resolveError ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
