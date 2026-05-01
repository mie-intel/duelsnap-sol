import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { Duelpic } from "../target/types/duelpic";

describe("duelpic", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.duelpic as Program<Duelpic>;

  const verifier = anchor.web3.Keypair.generate();
  const relayer = anchor.web3.Keypair.generate();
  const treasury = anchor.web3.Keypair.generate().publicKey;
  let paymentMint: anchor.web3.PublicKey;
  let playerToken: anchor.web3.PublicKey;
  let treasuryToken: anchor.web3.PublicKey;
  let royaltyVault: anchor.web3.PublicKey;

  const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const [royaltyVaultAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("royalty_vault_authority")],
    program.programId,
  );
  const [verifiedPoolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("verified_pool"), u64Buffer(0)],
    program.programId,
  );

  function questionPda(id: number) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("question"), u64Buffer(id)],
      program.programId,
    )[0];
  }

  function dailyPlayPda(player: anchor.web3.PublicKey, dayId: bigint) {
    const dayBuffer = Buffer.alloc(8);
    dayBuffer.writeBigInt64LE(dayId);
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("daily"), player.toBuffer(), dayBuffer],
      program.programId,
    )[0];
  }

  function royaltyPda(contributor: anchor.web3.PublicKey) {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("royalty"), contributor.toBuffer()],
      program.programId,
    )[0];
  }

  function u64Buffer(value: number) {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(BigInt(value));
    return idBuffer;
  }

  async function fund(pubkey: anchor.web3.PublicKey) {
    const signature = await provider.connection.requestAirdrop(
      pubkey,
      1_000_000_000,
    );
    const latest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      "confirmed",
    );
  }

  it("initializes config", async () => {
    const payer = (provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair })
      .payer;
    paymentMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6,
    );
    playerToken = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        paymentMint,
        provider.wallet.publicKey,
      )
    ).address;
    treasuryToken = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        paymentMint,
        treasury,
      )
    ).address;
    royaltyVault = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        paymentMint,
        royaltyVaultAuthority,
        true,
      )
    ).address;
    await mintTo(
      provider.connection,
      payer,
      paymentMint,
      playerToken,
      payer,
      3_000_000,
    );

    await program.methods
      .initializeConfig(3, new anchor.BN(30_000))
      .accounts({
        config: configPda,
        admin: provider.wallet.publicKey,
        verifier: verifier.publicKey,
        relayer: relayer.publicKey,
        treasury,
        paymentMint,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    assert.ok(config.admin.equals(provider.wallet.publicKey));
    assert.ok(config.verifier.equals(verifier.publicKey));
    assert.ok(config.relayer.equals(relayer.publicKey));
    assert.ok(config.treasury.equals(treasury));
    assert.ok(config.paymentMint.equals(paymentMint));
    assert.strictEqual(config.questionCount.toNumber(), 0);
    assert.strictEqual(config.dailyFreeLimit, 3);
    assert.strictEqual(config.casualFeeAmount.toNumber(), 30_000);
  });

  it("submits a question", async () => {
    const question = questionPda(1);

    await program.methods
      .submitQuestion(new anchor.BN(1), "QmDuelPicMockHash")
      .accounts({
        config: configPda,
        question,
        contributor: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.config.fetch(configPda);
    const record = await program.account.question.fetch(question);
    assert.strictEqual(config.questionCount.toNumber(), 1);
    assert.strictEqual(record.id.toNumber(), 1);
    assert.ok(record.contributor.equals(provider.wallet.publicKey));
    assert.strictEqual(record.ipfsHash, "QmDuelPicMockHash");
    assert.strictEqual(record.isVerified, false);
    assert.strictEqual(record.difficulty, 0);
  });

  it("initializes verified pool page", async () => {
    await fund(verifier.publicKey);

    await program.methods
      .initializeVerifiedPool(new anchor.BN(0))
      .accounts({
        config: configPda,
        verifiedPool: verifiedPoolPda,
        verifier: verifier.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([verifier])
      .rpc();

    const verifiedPool = await program.account.verifiedPool.fetch(verifiedPoolPda);
    assert.strictEqual(verifiedPool.page.toNumber(), 0);
    assert.deepEqual(verifiedPool.ids, []);
  });

  it("rejects non-verifier approval", async () => {
    try {
      await program.methods
        .verifyQuestion(2, new anchor.BN(0))
        .accounts({
          config: configPda,
          question: questionPda(1),
          verifiedPool: verifiedPoolPda,
          verifier: provider.wallet.publicKey,
        })
        .rpc();
      assert.fail("verify should fail for non-verifier");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.include(message, "UnauthorizedVerifier");
    }
  });

  it("verifies a question", async () => {
    await program.methods
      .verifyQuestion(2, new anchor.BN(0))
      .accounts({
        config: configPda,
        question: questionPda(1),
        verifiedPool: verifiedPoolPda,
        verifier: verifier.publicKey,
      })
      .signers([verifier])
      .rpc();

    const record = await program.account.question.fetch(questionPda(1));
    const verifiedPool = await program.account.verifiedPool.fetch(verifiedPoolPda);
    assert.strictEqual(record.isVerified, true);
    assert.strictEqual(record.difficulty, 2);
    assert.deepEqual(
      verifiedPool.ids.map((id) => id.toNumber()),
      [1],
    );
  });

  it("increments daily count up to free limit", async () => {
    await fund(relayer.publicKey);
    const dayId = 20_575n;
    const dailyPlay = dailyPlayPda(provider.wallet.publicKey, dayId);

    await program.methods
      .initializeDailyPlay(new anchor.BN(dayId.toString()))
      .accounts({
        config: configPda,
        dailyPlay,
        player: provider.wallet.publicKey,
        relayer: relayer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([relayer])
      .rpc();

    for (let i = 1; i <= 3; i++) {
      await program.methods
        .incrementDailyCount()
        .accounts({
          config: configPda,
          dailyPlay,
          relayer: relayer.publicKey,
        })
        .signers([relayer])
        .rpc();

      const record = await program.account.dailyPlay.fetch(dailyPlay);
      assert.strictEqual(record.count, i);
    }

    try {
      await program.methods
        .incrementDailyCount()
        .accounts({
          config: configPda,
          dailyPlay,
          relayer: relayer.publicKey,
        })
        .signers([relayer])
        .rpc();
      assert.fail("daily count should fail after free limit");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert.include(message, "DailyLimitExceeded");
    }
  });

  it("initializes contributor royalty account", async () => {
    const royalty = royaltyPda(provider.wallet.publicKey);

    await program.methods
      .initializeRoyalty()
      .accounts({
        royalty,
        contributor: provider.wallet.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.royalty.fetch(royalty);
    assert.ok(record.contributor.equals(provider.wallet.publicKey));
    assert.strictEqual(record.pendingAmount.toNumber(), 0);
  });

  it("pays casual fee and credits royalty", async () => {
    const royalty = royaltyPda(provider.wallet.publicKey);

    await program.methods
      .payAndPlay([new anchor.BN(1)])
      .accounts({
        config: configPda,
        player: provider.wallet.publicKey,
        paymentMint,
        playerToken,
        treasuryToken,
        royaltyVaultAuthority,
        royaltyVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: questionPda(1), isWritable: true, isSigner: false },
        { pubkey: royalty, isWritable: true, isSigner: false },
      ])
      .rpc();

    const playerAccount = await getAccount(provider.connection, playerToken);
    const treasuryAccount = await getAccount(provider.connection, treasuryToken);
    const vaultAccount = await getAccount(provider.connection, royaltyVault);
    const question = await program.account.question.fetch(questionPda(1));
    const royaltyRecord = await program.account.royalty.fetch(royalty);

    assert.strictEqual(Number(playerAccount.amount), 2_970_000);
    assert.strictEqual(Number(treasuryAccount.amount), 3_000);
    assert.strictEqual(Number(vaultAccount.amount), 27_000);
    assert.strictEqual(question.timesPlayed.toNumber(), 1);
    assert.strictEqual(question.royaltyEarned.toNumber(), 27_000);
    assert.strictEqual(royaltyRecord.pendingAmount.toNumber(), 27_000);
  });

  it("withdraws credited royalty", async () => {
    const royalty = royaltyPda(provider.wallet.publicKey);

    await program.methods
      .withdrawRoyalty()
      .accounts({
        config: configPda,
        royalty,
        contributor: provider.wallet.publicKey,
        paymentMint,
        royaltyVaultAuthority,
        royaltyVault,
        contributorToken: playerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const playerAccount = await getAccount(provider.connection, playerToken);
    const vaultAccount = await getAccount(provider.connection, royaltyVault);
    const royaltyRecord = await program.account.royalty.fetch(royalty);

    assert.strictEqual(Number(playerAccount.amount), 2_997_000);
    assert.strictEqual(Number(vaultAccount.amount), 0);
    assert.strictEqual(royaltyRecord.pendingAmount.toNumber(), 0);
  });
});
