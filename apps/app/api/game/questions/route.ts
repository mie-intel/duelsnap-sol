import { NextResponse } from "next/server";
import { redis } from "../../../../lib/redis/client";
import { createSolanaConnection } from "../../../../lib/solana/connection";
import { questionPda, verifiedPoolPda } from "../../../../lib/solana/pda";
import { createReadonlyDuelpicProgram } from "../../../../lib/solana/program";

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud";

function shuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let state = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids");
    const connection = createSolanaConnection();
    const program = createReadonlyDuelpicProgram(connection);

    let questionIds: number[];

    if (idsParam) {
      questionIds = idsParam.split(",").map(Number).filter(Boolean);
    } else {
      const count = Math.min(Number(searchParams.get("count") ?? 5), 10);
      const seed = Number(
        searchParams.get("seed") ?? Math.floor(Math.random() * 1e12),
      );
      const pool = await program.account.verifiedPool.fetch(verifiedPoolPda(0));
      questionIds = shuffle(pool.ids.map(Number), seed).slice(0, count);
    }

    if (questionIds.length === 0) {
      return NextResponse.json(
        { error: "No questions available" },
        { status: 404 },
      );
    }

    const questions = await Promise.all(
      questionIds.map(async (id) => {
        const imageUrl = await redis.get<string>(`question:${id}:imageUrl`);
        if (imageUrl) return { id, imageUrl };

        try {
          const question = await program.account.question.fetch(
            questionPda(id),
          );
          const ipfsHash = question.ipfsHash;
          return ipfsHash
            ? { id, imageUrl: `${IPFS_GATEWAY}/ipfs/${ipfsHash}` }
            : null;
        } catch {
          return null;
        }
      }),
    );

    const valid = questions.filter(Boolean) as {
      id: number;
      imageUrl: string;
    }[];
    return NextResponse.json({ questions: valid });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Failed";
    const msg =
      raw.includes("fetch failed") || raw.includes("HTTP request failed")
        ? "Network error - Solana RPC unreachable. Check connection and retry."
        : raw;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
