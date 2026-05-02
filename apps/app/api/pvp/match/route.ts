import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis/client";
import { parseRedisJson } from "../../../../lib/redis/json";
import { createSolanaConnection } from "../../../../lib/solana/connection";
import { createReadonlyDuelpicProgram } from "../../../../lib/solana/program";
import { sessionAddressFromId } from "../../../../lib/solana/pvp";
import { getRandomVerifiedQuestionIds } from "../../../../lib/solana/questions";

const PENDING_KEY = "pvp:pending";
const PENDING_TTL_SECONDS = 60 * 10;
type PendingSession = {
  sessionId: string;
  playerAddress: string;
  createdAt: number;
};

async function getRandomQuestionIds() {
  return getRandomVerifiedQuestionIds(10);
}

async function readPendingSession() {
  const raw = await redis.get<unknown>(PENDING_KEY);
  if (!raw) return null;

  try {
    return parseRedisJson<PendingSession>(raw);
  } catch {
    await redis.del(PENDING_KEY);
    return null;
  }
}

async function clearPendingSession(sessionId?: string) {
  const pending = await readPendingSession();
  if (!pending) return;
  if (
    !sessionId ||
    pending.sessionId.toLowerCase() === sessionId.toLowerCase()
  ) {
    await redis.del(PENDING_KEY);
  }
}

async function ensurePendingSessionIsUsable(
  pending: PendingSession | null,
  playerAddress: string,
) {
  if (!pending) return null;

  try {
    const connection = createSolanaConnection();
    const program = createReadonlyDuelpicProgram(connection);
    const session = await program.account.session.fetch(
      sessionAddressFromId(pending.sessionId),
    );

    const playDeadline =
      typeof session.playDeadline === "number"
        ? session.playDeadline
        : session.playDeadline.toNumber();
    const now = Math.floor(Date.now() / 1000);
    if (
      session.player1.equals(PublicKey.default) ||
      session.status !== 0 ||
      playDeadline <= now
    ) {
      await clearPendingSession(pending.sessionId);
      return null;
    }

    if (pending.playerAddress.toLowerCase() === playerAddress.toLowerCase()) {
      return { action: "resume" as const, sessionId: pending.sessionId };
    }

    return { action: "join" as const, sessionId: pending.sessionId };
  } catch {
    await clearPendingSession(pending.sessionId);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "find" | "register" | "claim";
      playerAddress?: string;
      sessionId?: string;
      questionIds?: number[];
    };

    if (body.action === "register") {
      if (
        !body.playerAddress ||
        !body.sessionId ||
        !Array.isArray(body.questionIds)
      ) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }

      await redis.set(
        PENDING_KEY,
        JSON.stringify({
          sessionId: body.sessionId,
          playerAddress: body.playerAddress,
          createdAt: Date.now(),
        } satisfies PendingSession),
        { ex: PENDING_TTL_SECONDS },
      );
      await redis.set(
        `pvp:${body.sessionId}:q`,
        JSON.stringify(body.questionIds),
        {
          ex: 3600,
        },
      );

      return NextResponse.json({ ok: true });
    }

    if (body.action === "claim") {
      if (!body.sessionId) {
        return NextResponse.json(
          { error: "Missing sessionId" },
          { status: 400 },
        );
      }
      await clearPendingSession(body.sessionId);
      return NextResponse.json({ ok: true });
    }

    if (!body.playerAddress) {
      return NextResponse.json(
        { error: "Missing playerAddress" },
        { status: 400 },
      );
    }

    const pending = await readPendingSession();
    const usablePending = await ensurePendingSessionIsUsable(
      pending,
      body.playerAddress,
    );

    if (usablePending) {
      return NextResponse.json(usablePending);
    }

    const questionIds = await getRandomQuestionIds();
    return NextResponse.json({ action: "create", questionIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
