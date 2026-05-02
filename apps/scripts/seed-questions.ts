import { BN } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { PinataSDK } from "pinata";
import { configPda, questionPda, verifiedPoolPda } from "../lib/solana/pda";
import { verifiedPoolPageForQuestion } from "../lib/solana/questions";
import { createServerDuelpicProgram } from "../lib/solana/server";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud";

function keypairFromEnv(name: string) {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not configured`);
  const secret = JSON.parse(raw);
  if (!Array.isArray(secret)) throw new Error(`${name} must be a JSON array`);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT!,
    pinataGateway: GATEWAY,
  });
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const seedKeypair = keypairFromEnv("SEED_KEYPAIR_JSON");
  const verifier = keypairFromEnv("VERIFIER_KEYPAIR_JSON");
  const { program } = createServerDuelpicProgram(seedKeypair);
  const { program: verifierProgram } = createServerDuelpicProgram(verifier);

  const answersPath = path.join(__dirname, "seed-data/answers.json");
  const answersRaw: Record<string, string> = JSON.parse(
    fs.readFileSync(answersPath, "utf8"),
  );
  const imagesDir = path.join(__dirname, "seed-data/images");

  for (const [filename, answer] of Object.entries(answersRaw)) {
    const imagePath = path.join(imagesDir, filename);
    if (!fs.existsSync(imagePath)) {
      console.log(`SKIP ${filename} - file not found`);
      continue;
    }

    console.log(`\nProcessing: ${filename} -> ${answer}`);
    const buffer = fs.readFileSync(imagePath);
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const file = new File([buffer], filename, {
      type: mimeMap[ext] ?? "image/jpeg",
    });
    const result = await pinata.upload.public.file(file);
    const cid = result.cid;
    const imageUrl = `${GATEWAY}/ipfs/${cid}`;

    const config = await program.account.config.fetch(configPda());
    const questionCount =
      typeof config.questionCount === "number"
        ? config.questionCount
        : config.questionCount.toNumber();
    const questionId = questionCount + 1;

    const submitSignature = await program.methods
      .submitQuestion(new BN(questionId), cid)
      .accountsStrict({
        config: configPda(),
        question: questionPda(questionId),
        contributor: seedKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`  Submitted question ${questionId}: ${submitSignature}`);

    const page = verifiedPoolPageForQuestion(questionId);
    const verifiedPool = verifiedPoolPda(page);
    try {
      await verifierProgram.account.verifiedPool.fetch(verifiedPool);
    } catch {
      await verifierProgram.methods
        .initializeVerifiedPool(new BN(page))
        .accountsStrict({
          config: configPda(),
          verifiedPool,
          verifier: verifier.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const verifySignature = await verifierProgram.methods
      .verifyQuestion(new BN(page))
      .accountsStrict({
        config: configPda(),
        question: questionPda(questionId),
        verifiedPool,
        verifier: verifier.publicKey,
      })
      .rpc();
    console.log(`  Verified: ${verifySignature}`);

    await Promise.all([
      redis.set(`question:${questionId}:answer`, answer.toUpperCase()),
      redis.set(`question:${questionId}:imageUrl`, imageUrl),
    ]);
    console.log(`  Stored Redis question:${questionId}:*`);
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
