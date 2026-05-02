import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis/client";
import {
  createSessionSeed,
  sessionAddressFromId,
  sessionSeedToHex,
} from "../../../../lib/solana/pvp";
import { getRandomVerifiedQuestionIds } from "../../../../lib/solana/questions";
import { parseSolanaAddress } from "../../../../lib/solana/server";

const PVP_WAGER_RAW = 300_000;

export async function POST(req: Request) {
  try {
    const { playerAddress } = await req.json();
    parseSolanaAddress(playerAddress, "playerAddress");

    const questionIds = await getRandomVerifiedQuestionIds(10);
    if (questionIds.length === 0) {
      return NextResponse.json(
        { error: "No verified questions available" },
        { status: 404 },
      );
    }

    const sessionSeed = createSessionSeed();
    const sessionId = sessionSeedToHex(sessionSeed);
    const sessionAddress = sessionAddressFromId(sessionId).toBase58();

    await redis.set(
      `pvp:${sessionId}:q`,
      JSON.stringify(questionIds.map(String)),
      { ex: 3600 },
    );

    return NextResponse.json({
      sessionId,
      sessionAddress,
      questionIds: questionIds.map(String),
      wager: String(PVP_WAGER_RAW),
      requiresClientTransaction: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
