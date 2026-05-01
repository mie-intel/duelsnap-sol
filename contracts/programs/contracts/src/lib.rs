use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("71PBFBGXGnYJekctFqKYAhBMgYXHpoLwhxg8CxG2pm6b");

pub const MAX_IPFS_HASH_LEN: usize = 80;
pub const MAX_VERIFIED_IDS_PER_PAGE: usize = 256;
pub const MAX_SESSION_QUESTIONS: usize = 10;
pub const PLAY_WINDOW_SECONDS: i64 = 10 * 60;
pub const REVEAL_WINDOW_SECONDS: i64 = 2 * 60;
pub const STATUS_WAITING: u8 = 0;
pub const STATUS_PLAYING: u8 = 1;
pub const STATUS_COMMITTING: u8 = 2;
pub const STATUS_REVEALING: u8 = 3;
pub const STATUS_DONE: u8 = 4;
pub const WINNER_BPS: u64 = 8_700;
pub const CONTRIBUTOR_BPS: u64 = 1_000;
pub const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod duelpic {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        daily_free_limit: u8,
        casual_fee_amount: u64,
    ) -> Result<()> {
        require!(daily_free_limit > 0, DuelpicError::InvalidDailyFreeLimit);
        require!(casual_fee_amount > 0, DuelpicError::InvalidFeeAmount);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.verifier = ctx.accounts.verifier.key();
        config.relayer = ctx.accounts.relayer.key();
        config.treasury = ctx.accounts.treasury.key();
        config.payment_mint = ctx.accounts.payment_mint.key();
        config.question_count = 0;
        config.daily_free_limit = daily_free_limit;
        config.casual_fee_amount = casual_fee_amount;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn submit_question(
        ctx: Context<SubmitQuestion>,
        question_id: u64,
        ipfs_hash: String,
    ) -> Result<()> {
        require!(
            question_id == ctx.accounts.config.question_count + 1,
            DuelpicError::InvalidQuestionId
        );
        require!(
            ipfs_hash.as_bytes().len() <= MAX_IPFS_HASH_LEN,
            DuelpicError::IpfsHashTooLong
        );

        let question = &mut ctx.accounts.question;
        question.id = question_id;
        question.contributor = ctx.accounts.contributor.key();
        question.ipfs_hash = ipfs_hash;
        question.is_verified = false;
        question.difficulty = 0;
        question.times_played = 0;
        question.royalty_earned = 0;
        question.bump = ctx.bumps.question;

        ctx.accounts.config.question_count = question_id;
        Ok(())
    }

    pub fn initialize_verified_pool(ctx: Context<InitializeVerifiedPool>, page: u64) -> Result<()> {
        let verified_pool = &mut ctx.accounts.verified_pool;
        verified_pool.page = page;
        verified_pool.ids = Vec::new();
        verified_pool.bump = ctx.bumps.verified_pool;
        Ok(())
    }

    pub fn verify_question(ctx: Context<VerifyQuestion>, difficulty: u8, page: u64) -> Result<()> {
        require!(
            (1..=3).contains(&difficulty),
            DuelpicError::InvalidDifficulty
        );
        require!(
            !ctx.accounts.question.is_verified,
            DuelpicError::AlreadyVerified
        );
        let expected_page = (ctx.accounts.question.id - 1) / MAX_VERIFIED_IDS_PER_PAGE as u64;
        require!(page == expected_page, DuelpicError::InvalidVerifiedPoolPage);
        require!(
            ctx.accounts.verified_pool.ids.len() < MAX_VERIFIED_IDS_PER_PAGE,
            DuelpicError::VerifiedPoolFull
        );

        let question = &mut ctx.accounts.question;
        question.is_verified = true;
        question.difficulty = difficulty;
        ctx.accounts.verified_pool.ids.push(question.id);
        Ok(())
    }

    pub fn initialize_daily_play(ctx: Context<InitializeDailyPlay>, day_id: i64) -> Result<()> {
        let daily_play = &mut ctx.accounts.daily_play;
        daily_play.player = ctx.accounts.player.key();
        daily_play.day_id = day_id;
        daily_play.count = 0;
        daily_play.bump = ctx.bumps.daily_play;
        Ok(())
    }

    pub fn increment_daily_count(ctx: Context<IncrementDailyCount>) -> Result<()> {
        require!(
            ctx.accounts.daily_play.count < ctx.accounts.config.daily_free_limit,
            DuelpicError::DailyLimitExceeded
        );

        ctx.accounts.daily_play.count += 1;
        Ok(())
    }

    pub fn initialize_royalty(ctx: Context<InitializeRoyalty>) -> Result<()> {
        let royalty = &mut ctx.accounts.royalty;
        royalty.contributor = ctx.accounts.contributor.key();
        royalty.pending_amount = 0;
        royalty.bump = ctx.bumps.royalty;
        Ok(())
    }

    pub fn pay_and_play<'info>(
        ctx: Context<'_, '_, 'info, 'info, PayAndPlay<'info>>,
        question_ids: Vec<u64>,
    ) -> Result<()> {
        require!(!question_ids.is_empty(), DuelpicError::InvalidQuestionIds);
        require!(question_ids.len() <= 10, DuelpicError::InvalidQuestionIds);
        require!(
            ctx.remaining_accounts.len() == question_ids.len() * 2,
            DuelpicError::InvalidRemainingAccounts
        );

        let fee_amount = ctx.accounts.config.casual_fee_amount;
        let contributor_total = fee_amount
            .checked_mul(9_000)
            .and_then(|amount| amount.checked_div(10_000))
            .ok_or(DuelpicError::MathOverflow)?;
        let treasury_amount = fee_amount
            .checked_sub(contributor_total)
            .ok_or(DuelpicError::MathOverflow)?;
        let per_question = contributor_total
            .checked_div(question_ids.len() as u64)
            .ok_or(DuelpicError::MathOverflow)?;
        let mut distributed = 0u64;

        token::transfer(ctx.accounts.transfer_to_royalty_vault(), contributor_total)?;
        token::transfer(ctx.accounts.transfer_to_treasury(), treasury_amount)?;

        for (index, question_id) in question_ids.iter().enumerate() {
            let question_info = &ctx.remaining_accounts[index * 2];
            let royalty_info = &ctx.remaining_accounts[index * 2 + 1];
            require!(
                question_info.is_writable,
                DuelpicError::InvalidQuestionAccount
            );
            require!(
                royalty_info.is_writable,
                DuelpicError::InvalidRoyaltyAccount
            );

            let mut question: Account<Question> = Account::try_from(question_info)?;
            require!(
                question.id == *question_id,
                DuelpicError::InvalidQuestionAccount
            );
            require!(question.is_verified, DuelpicError::NotVerified);

            let (expected_royalty, _) = Pubkey::find_program_address(
                &[b"royalty", question.contributor.as_ref()],
                ctx.program_id,
            );
            require!(
                royalty_info.key() == expected_royalty,
                DuelpicError::InvalidRoyaltyAccount
            );
            let mut royalty: Account<Royalty> = Account::try_from(royalty_info)?;

            question.times_played = question
                .times_played
                .checked_add(1)
                .ok_or(DuelpicError::MathOverflow)?;
            question.royalty_earned = question
                .royalty_earned
                .checked_add(per_question)
                .ok_or(DuelpicError::MathOverflow)?;
            royalty.pending_amount = royalty
                .pending_amount
                .checked_add(per_question)
                .ok_or(DuelpicError::MathOverflow)?;
            distributed = distributed
                .checked_add(per_question)
                .ok_or(DuelpicError::MathOverflow)?;

            question.exit(ctx.program_id)?;
            royalty.exit(ctx.program_id)?;
        }

        let dust = contributor_total
            .checked_sub(distributed)
            .ok_or(DuelpicError::MathOverflow)?;
        if dust > 0 {
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"royalty_vault_authority",
                &[ctx.bumps.royalty_vault_authority],
            ]];
            token::transfer(
                ctx.accounts
                    .transfer_dust_to_treasury()
                    .with_signer(signer_seeds),
                dust,
            )?;
        }

        Ok(())
    }

    pub fn withdraw_royalty(ctx: Context<WithdrawRoyalty>) -> Result<()> {
        let amount = ctx.accounts.royalty.pending_amount;
        require!(amount > 0, DuelpicError::NothingToWithdraw);

        ctx.accounts.royalty.pending_amount = 0;

        let signer_seeds: &[&[&[u8]]] = &[&[
            b"royalty_vault_authority",
            &[ctx.bumps.royalty_vault_authority],
        ]];
        token::transfer(
            ctx.accounts
                .transfer_royalty_to_contributor()
                .with_signer(signer_seeds),
            amount,
        )?;
        Ok(())
    }

    pub fn create_session(
        ctx: Context<CreateSession>,
        session_id: [u8; 32],
        wager: u64,
        question_ids: Vec<u64>,
    ) -> Result<()> {
        require!(wager > 0, DuelpicError::InvalidWager);
        require!(
            !question_ids.is_empty() && question_ids.len() <= MAX_SESSION_QUESTIONS,
            DuelpicError::InvalidQuestionIds
        );

        token::transfer(ctx.accounts.transfer_wager_to_session_vault(), wager)?;

        let clock = Clock::get()?;
        let session = &mut ctx.accounts.session;
        session.id = session_id;
        session.player1 = ctx.accounts.player1.key();
        session.player2 = Pubkey::default();
        session.wager = wager;
        session.question_ids = [0; MAX_SESSION_QUESTIONS];
        session.question_count = question_ids.len() as u8;
        for (index, question_id) in question_ids.iter().enumerate() {
            session.question_ids[index] = *question_id;
        }
        session.commit_hash1 = [0; 32];
        session.commit_hash2 = [0; 32];
        session.score1 = 0;
        session.score2 = 0;
        session.status = STATUS_WAITING;
        session.play_deadline = clock
            .unix_timestamp
            .checked_add(PLAY_WINDOW_SECONDS)
            .ok_or(DuelpicError::MathOverflow)?;
        session.reveal_deadline = 0;
        session.bump = ctx.bumps.session;
        Ok(())
    }

    pub fn join_session(ctx: Context<JoinSession>) -> Result<()> {
        require!(
            ctx.accounts.session.status == STATUS_WAITING,
            DuelpicError::WrongStatus
        );
        require!(
            ctx.accounts.session.player2 == Pubkey::default(),
            DuelpicError::SessionFull
        );
        require!(
            ctx.accounts.player2.key() != ctx.accounts.session.player1,
            DuelpicError::InvalidPlayer
        );
        require!(
            Clock::get()?.unix_timestamp <= ctx.accounts.session.play_deadline,
            DuelpicError::DeadlineExceeded
        );

        token::transfer(
            ctx.accounts.transfer_wager_to_session_vault(),
            ctx.accounts.session.wager,
        )?;

        let session = &mut ctx.accounts.session;
        session.player2 = ctx.accounts.player2.key();
        session.status = STATUS_PLAYING;
        Ok(())
    }

    pub fn commit_answers(ctx: Context<CommitAnswers>, commit_hash: [u8; 32]) -> Result<()> {
        require!(
            ctx.accounts.session.status == STATUS_PLAYING
                || ctx.accounts.session.status == STATUS_COMMITTING,
            DuelpicError::WrongStatus
        );
        require!(
            Clock::get()?.unix_timestamp <= ctx.accounts.session.play_deadline,
            DuelpicError::DeadlineExceeded
        );

        let player = ctx.accounts.player.key();
        let session = &mut ctx.accounts.session;
        if player == session.player1 {
            require!(
                session.commit_hash1 == [0; 32],
                DuelpicError::AlreadyCommitted
            );
            session.commit_hash1 = commit_hash;
        } else if player == session.player2 {
            require!(
                session.commit_hash2 == [0; 32],
                DuelpicError::AlreadyCommitted
            );
            session.commit_hash2 = commit_hash;
        } else {
            return err!(DuelpicError::InvalidPlayer);
        }

        if session.commit_hash1 != [0; 32] && session.commit_hash2 != [0; 32] {
            session.status = STATUS_REVEALING;
            session.reveal_deadline = Clock::get()?
                .unix_timestamp
                .checked_add(REVEAL_WINDOW_SECONDS)
                .ok_or(DuelpicError::MathOverflow)?;
        } else {
            session.status = STATUS_COMMITTING;
        }
        Ok(())
    }

    pub fn resolve_by_relayer<'info>(
        ctx: Context<'_, '_, 'info, 'info, ResolveByRelayer<'info>>,
        winner: Pubkey,
        score1: u8,
        score2: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.session.status != STATUS_DONE,
            DuelpicError::WrongStatus
        );
        require!(
            ctx.accounts.session.player2 != Pubkey::default(),
            DuelpicError::SessionFull
        );
        require!(
            winner == Pubkey::default()
                || winner == ctx.accounts.session.player1
                || winner == ctx.accounts.session.player2,
            DuelpicError::InvalidPlayer
        );

        ctx.accounts.session.score1 = score1;
        ctx.accounts.session.score2 = score2;
        finalize_session(ctx, winner)
    }

    pub fn claim_timeout(ctx: Context<ClaimTimeout>) -> Result<()> {
        require!(
            ctx.accounts.session.status != STATUS_DONE,
            DuelpicError::WrongStatus
        );

        let now = Clock::get()?.unix_timestamp;
        let caller = ctx.accounts.claimant.key();
        let is_p1 = caller == ctx.accounts.session.player1;
        let is_p2 = caller == ctx.accounts.session.player2;
        require!(is_p1 || is_p2, DuelpicError::InvalidPlayer);

        if ctx.accounts.session.status == STATUS_WAITING {
            require!(
                now > ctx.accounts.session.play_deadline,
                DuelpicError::DeadlineNotReached
            );
            require!(is_p1, DuelpicError::InvalidPlayer);
            ctx.accounts.session.status = STATUS_DONE;
            let session_key = ctx.accounts.session.key();
            let bump = [ctx.bumps.session_vault_authority];
            let signer_seeds: &[&[&[u8]]] =
                &[&[b"session_vault_authority", session_key.as_ref(), &bump]];
            token::transfer(
                ctx.accounts
                    .transfer_to_claimant()
                    .with_signer(signer_seeds),
                ctx.accounts.session.wager,
            )?;
            return Ok(());
        }

        if ctx.accounts.session.status == STATUS_PLAYING
            || ctx.accounts.session.status == STATUS_COMMITTING
            || ctx.accounts.session.status == STATUS_REVEALING
        {
            let deadline = if ctx.accounts.session.status == STATUS_REVEALING {
                ctx.accounts.session.reveal_deadline
            } else {
                ctx.accounts.session.play_deadline
            };
            require!(now > deadline, DuelpicError::DeadlineNotReached);

            let caller_progressed = if ctx.accounts.session.status == STATUS_REVEALING {
                false
            } else if is_p1 {
                ctx.accounts.session.commit_hash1 != [0; 32]
            } else {
                ctx.accounts.session.commit_hash2 != [0; 32]
            };
            require!(caller_progressed, DuelpicError::InvalidPlayer);

            ctx.accounts.session.status = STATUS_DONE;
            let pool = ctx
                .accounts
                .session
                .wager
                .checked_mul(2)
                .ok_or(DuelpicError::MathOverflow)?;
            let claimant_payout = pool
                .checked_mul(WINNER_BPS)
                .and_then(|amount| amount.checked_div(BPS_DENOMINATOR))
                .ok_or(DuelpicError::MathOverflow)?;
            let treasury_payout = pool
                .checked_sub(claimant_payout)
                .ok_or(DuelpicError::MathOverflow)?;
            let session_key = ctx.accounts.session.key();
            let bump = [ctx.bumps.session_vault_authority];
            let signer_seeds: &[&[&[u8]]] =
                &[&[b"session_vault_authority", session_key.as_ref(), &bump]];
            token::transfer(
                ctx.accounts
                    .transfer_to_claimant()
                    .with_signer(signer_seeds),
                claimant_payout,
            )?;
            token::transfer(
                ctx.accounts
                    .transfer_timeout_treasury()
                    .with_signer(signer_seeds),
                treasury_payout,
            )?;
            return Ok(());
        }

        err!(DuelpicError::WrongStatus)
    }
}

fn finalize_session<'info>(
    ctx: Context<'_, '_, 'info, 'info, ResolveByRelayer<'info>>,
    winner: Pubkey,
) -> Result<()> {
    require!(
        ctx.remaining_accounts.len() == ctx.accounts.session.question_count as usize * 2,
        DuelpicError::InvalidRemainingAccounts
    );

    let pool = ctx
        .accounts
        .session
        .wager
        .checked_mul(2)
        .ok_or(DuelpicError::MathOverflow)?;
    let winner_payout = pool
        .checked_mul(WINNER_BPS)
        .and_then(|amount| amount.checked_div(BPS_DENOMINATOR))
        .ok_or(DuelpicError::MathOverflow)?;
    let contributor_share = pool
        .checked_mul(CONTRIBUTOR_BPS)
        .and_then(|amount| amount.checked_div(BPS_DENOMINATOR))
        .ok_or(DuelpicError::MathOverflow)?;
    let mut treasury_share = pool
        .checked_sub(winner_payout)
        .and_then(|amount| amount.checked_sub(contributor_share))
        .ok_or(DuelpicError::MathOverflow)?;
    let per_question = contributor_share
        .checked_div(ctx.accounts.session.question_count as u64)
        .ok_or(DuelpicError::MathOverflow)?;
    let mut distributed = 0u64;

    ctx.accounts.session.status = STATUS_DONE;

    let session_key = ctx.accounts.session.key();
    let bump = [ctx.bumps.session_vault_authority];
    let signer_seeds: &[&[&[u8]]] = &[&[b"session_vault_authority", session_key.as_ref(), &bump]];

    if contributor_share > 0 {
        token::transfer(
            ctx.accounts
                .transfer_session_to_royalty_vault()
                .with_signer(signer_seeds),
            contributor_share,
        )?;
    }

    for index in 0..ctx.accounts.session.question_count as usize {
        let question_id = ctx.accounts.session.question_ids[index];
        let question_info = &ctx.remaining_accounts[index * 2];
        let royalty_info = &ctx.remaining_accounts[index * 2 + 1];
        require!(
            question_info.is_writable,
            DuelpicError::InvalidQuestionAccount
        );
        require!(
            royalty_info.is_writable,
            DuelpicError::InvalidRoyaltyAccount
        );

        let mut question: Account<Question> = Account::try_from(question_info)?;
        require!(
            question.id == question_id,
            DuelpicError::InvalidQuestionAccount
        );
        require!(question.is_verified, DuelpicError::NotVerified);

        let (expected_royalty, _) = Pubkey::find_program_address(
            &[b"royalty", question.contributor.as_ref()],
            ctx.program_id,
        );
        require!(
            royalty_info.key() == expected_royalty,
            DuelpicError::InvalidRoyaltyAccount
        );
        let mut royalty: Account<Royalty> = Account::try_from(royalty_info)?;

        question.times_played = question
            .times_played
            .checked_add(1)
            .ok_or(DuelpicError::MathOverflow)?;
        question.royalty_earned = question
            .royalty_earned
            .checked_add(per_question)
            .ok_or(DuelpicError::MathOverflow)?;
        royalty.pending_amount = royalty
            .pending_amount
            .checked_add(per_question)
            .ok_or(DuelpicError::MathOverflow)?;
        distributed = distributed
            .checked_add(per_question)
            .ok_or(DuelpicError::MathOverflow)?;

        question.exit(ctx.program_id)?;
        royalty.exit(ctx.program_id)?;
    }

    treasury_share = treasury_share
        .checked_add(
            contributor_share
                .checked_sub(distributed)
                .ok_or(DuelpicError::MathOverflow)?,
        )
        .ok_or(DuelpicError::MathOverflow)?;

    token::transfer(
        ctx.accounts
            .transfer_session_to_treasury()
            .with_signer(signer_seeds),
        treasury_share,
    )?;

    if winner == ctx.accounts.session.player1 {
        token::transfer(
            ctx.accounts
                .transfer_session_to_player1()
                .with_signer(signer_seeds),
            winner_payout,
        )?;
    } else if winner == ctx.accounts.session.player2 {
        token::transfer(
            ctx.accounts
                .transfer_session_to_player2()
                .with_signer(signer_seeds),
            winner_payout,
        )?;
    } else {
        let refund_each = winner_payout
            .checked_div(2)
            .ok_or(DuelpicError::MathOverflow)?;
        token::transfer(
            ctx.accounts
                .transfer_session_to_player1()
                .with_signer(signer_seeds),
            refund_each,
        )?;
        token::transfer(
            ctx.accounts
                .transfer_session_to_player2()
                .with_signer(signer_seeds),
            refund_each,
        )?;
        let tie_dust = winner_payout
            .checked_sub(
                refund_each
                    .checked_mul(2)
                    .ok_or(DuelpicError::MathOverflow)?,
            )
            .ok_or(DuelpicError::MathOverflow)?;
        if tie_dust > 0 {
            token::transfer(
                ctx.accounts
                    .transfer_session_to_treasury()
                    .with_signer(signer_seeds),
                tie_dust,
            )?;
        }
    }

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Stored as config authority only.
    pub verifier: UncheckedAccount<'info>,
    /// CHECK: Stored as config authority only.
    pub relayer: UncheckedAccount<'info>,
    /// CHECK: Stored as treasury destination; token account validation comes later.
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: Stored as payment mint; SPL validation comes in payment slice.
    pub payment_mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(question_id: u64)]
pub struct SubmitQuestion<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = contributor,
        space = 8 + Question::INIT_SPACE,
        seeds = [b"question", &question_id.to_le_bytes()],
        bump
    )]
    pub question: Account<'info, Question>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(page: u64)]
pub struct InitializeVerifiedPool<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = verifier @ DuelpicError::UnauthorizedVerifier)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = verifier,
        space = 8 + VerifiedPool::INIT_SPACE,
        seeds = [b"verified_pool".as_ref(), &page.to_le_bytes()],
        bump
    )]
    pub verified_pool: Account<'info, VerifiedPool>,
    #[account(mut)]
    pub verifier: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(difficulty: u8, page: u64)]
pub struct VerifyQuestion<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = verifier @ DuelpicError::UnauthorizedVerifier)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"question", &question.id.to_le_bytes()], bump = question.bump)]
    pub question: Account<'info, Question>,
    #[account(mut, seeds = [b"verified_pool".as_ref(), &page.to_le_bytes()], bump = verified_pool.bump)]
    pub verified_pool: Account<'info, VerifiedPool>,
    pub verifier: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(day_id: i64)]
pub struct InitializeDailyPlay<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = relayer @ DuelpicError::UnauthorizedRelayer)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = relayer,
        space = 8 + DailyPlay::INIT_SPACE,
        seeds = [b"daily", player.key().as_ref(), &day_id.to_le_bytes()],
        bump
    )]
    pub daily_play: Account<'info, DailyPlay>,
    /// CHECK: Stored in DailyPlay; no data read.
    pub player: UncheckedAccount<'info>,
    #[account(mut)]
    pub relayer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct IncrementDailyCount<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = relayer @ DuelpicError::UnauthorizedRelayer)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"daily", daily_play.player.as_ref(), &daily_play.day_id.to_le_bytes()], bump = daily_play.bump)]
    pub daily_play: Account<'info, DailyPlay>,
    pub relayer: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeRoyalty<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Royalty::INIT_SPACE,
        seeds = [b"royalty", contributor.key().as_ref()],
        bump
    )]
    pub royalty: Account<'info, Royalty>,
    /// CHECK: Stored in Royalty; no data read.
    pub contributor: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PayAndPlay<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(address = config.payment_mint)]
    pub payment_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = player_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = player_token.owner == player.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub player_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = treasury_token.owner == config.treasury @ DuelpicError::InvalidTokenAccount
    )]
    pub treasury_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"royalty_vault_authority"], bump)]
    pub royalty_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = royalty_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = royalty_vault.owner == royalty_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub royalty_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> PayAndPlay<'info> {
    fn transfer_to_royalty_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.player_token.to_account_info(),
                to: self.royalty_vault.to_account_info(),
                authority: self.player.to_account_info(),
            },
        )
    }

    fn transfer_to_treasury(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.player_token.to_account_info(),
                to: self.treasury_token.to_account_info(),
                authority: self.player.to_account_info(),
            },
        )
    }

    fn transfer_dust_to_treasury(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.royalty_vault.to_account_info(),
                to: self.treasury_token.to_account_info(),
                authority: self.royalty_vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct WithdrawRoyalty<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"royalty", contributor.key().as_ref()], bump = royalty.bump, has_one = contributor)]
    pub royalty: Account<'info, Royalty>,
    #[account(mut)]
    pub contributor: Signer<'info>,
    #[account(address = config.payment_mint)]
    pub payment_mint: Account<'info, Mint>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"royalty_vault_authority"], bump)]
    pub royalty_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = royalty_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = royalty_vault.owner == royalty_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub royalty_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = contributor_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = contributor_token.owner == contributor.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub contributor_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> WithdrawRoyalty<'info> {
    fn transfer_royalty_to_contributor(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.royalty_vault.to_account_info(),
                to: self.contributor_token.to_account_info(),
                authority: self.royalty_vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
#[instruction(session_id: [u8; 32])]
pub struct CreateSession<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = player1,
        space = 8 + Session::INIT_SPACE,
        seeds = [b"session", session_id.as_ref()],
        bump
    )]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub player1: Signer<'info>,
    #[account(address = config.payment_mint)]
    pub payment_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = player1_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = player1_token.owner == player1.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub player1_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"session_vault_authority", session.key().as_ref()], bump)]
    pub session_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = session_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = session_vault.owner == session_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub session_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateSession<'info> {
    fn transfer_wager_to_session_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.player1_token.to_account_info(),
                to: self.session_vault.to_account_info(),
                authority: self.player1.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct JoinSession<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"session", &session.id], bump = session.bump)]
    pub session: Account<'info, Session>,
    #[account(mut)]
    pub player2: Signer<'info>,
    #[account(address = config.payment_mint)]
    pub payment_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = player2_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = player2_token.owner == player2.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub player2_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"session_vault_authority", session.key().as_ref()], bump)]
    pub session_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = session_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = session_vault.owner == session_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub session_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

impl<'info> JoinSession<'info> {
    fn transfer_wager_to_session_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.player2_token.to_account_info(),
                to: self.session_vault.to_account_info(),
                authority: self.player2.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct CommitAnswers<'info> {
    #[account(mut, seeds = [b"session", &session.id], bump = session.bump)]
    pub session: Account<'info, Session>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveByRelayer<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = relayer @ DuelpicError::UnauthorizedRelayer)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [b"session", &session.id], bump = session.bump)]
    pub session: Box<Account<'info, Session>>,
    pub relayer: Signer<'info>,
    #[account(address = config.payment_mint)]
    pub payment_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        constraint = player1_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = player1_token.owner == session.player1 @ DuelpicError::InvalidTokenAccount
    )]
    pub player1_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = player2_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = player2_token.owner == session.player2 @ DuelpicError::InvalidTokenAccount
    )]
    pub player2_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = treasury_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = treasury_token.owner == config.treasury @ DuelpicError::InvalidTokenAccount
    )]
    pub treasury_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"royalty_vault_authority"], bump)]
    pub royalty_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = royalty_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = royalty_vault.owner == royalty_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub royalty_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"session_vault_authority", session.key().as_ref()], bump)]
    pub session_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = session_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = session_vault.owner == session_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub session_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ResolveByRelayer<'info> {
    fn transfer_session_to_royalty_vault(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.session_vault.to_account_info(),
                to: self.royalty_vault.to_account_info(),
                authority: self.session_vault_authority.to_account_info(),
            },
        )
    }

    fn transfer_session_to_treasury(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.session_vault.to_account_info(),
                to: self.treasury_token.to_account_info(),
                authority: self.session_vault_authority.to_account_info(),
            },
        )
    }

    fn transfer_session_to_player1(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.session_vault.to_account_info(),
                to: self.player1_token.to_account_info(),
                authority: self.session_vault_authority.to_account_info(),
            },
        )
    }

    fn transfer_session_to_player2(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.session_vault.to_account_info(),
                to: self.player2_token.to_account_info(),
                authority: self.session_vault_authority.to_account_info(),
            },
        )
    }
}

#[derive(Accounts)]
pub struct ClaimTimeout<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [b"session", &session.id], bump = session.bump)]
    pub session: Box<Account<'info, Session>>,
    pub claimant: Signer<'info>,
    #[account(address = config.payment_mint)]
    pub payment_mint: Box<Account<'info, Mint>>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"session_vault_authority", session.key().as_ref()], bump)]
    pub session_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = session_vault.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = session_vault.owner == session_vault_authority.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub session_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = claimant_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = claimant_token.owner == claimant.key() @ DuelpicError::InvalidTokenAccount
    )]
    pub claimant_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = treasury_token.mint == payment_mint.key() @ DuelpicError::InvalidTokenAccount,
        constraint = treasury_token.owner == config.treasury @ DuelpicError::InvalidTokenAccount
    )]
    pub treasury_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

impl<'info> ClaimTimeout<'info> {
    fn transfer_to_claimant(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.session_vault.to_account_info(),
                to: self.claimant_token.to_account_info(),
                authority: self.session_vault_authority.to_account_info(),
            },
        )
    }

    fn transfer_timeout_treasury(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        CpiContext::new(
            self.token_program.to_account_info(),
            Transfer {
                from: self.session_vault.to_account_info(),
                to: self.treasury_token.to_account_info(),
                authority: self.session_vault_authority.to_account_info(),
            },
        )
    }
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub verifier: Pubkey,
    pub relayer: Pubkey,
    pub treasury: Pubkey,
    pub payment_mint: Pubkey,
    pub question_count: u64,
    pub daily_free_limit: u8,
    pub casual_fee_amount: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Question {
    pub id: u64,
    pub contributor: Pubkey,
    #[max_len(80)]
    pub ipfs_hash: String,
    pub is_verified: bool,
    pub difficulty: u8,
    pub times_played: u64,
    pub royalty_earned: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct VerifiedPool {
    pub page: u64,
    #[max_len(256)]
    pub ids: Vec<u64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DailyPlay {
    pub player: Pubkey,
    pub day_id: i64,
    pub count: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Royalty {
    pub contributor: Pubkey,
    pub pending_amount: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Session {
    pub id: [u8; 32],
    pub player1: Pubkey,
    pub player2: Pubkey,
    pub wager: u64,
    pub question_ids: [u64; MAX_SESSION_QUESTIONS],
    pub question_count: u8,
    pub commit_hash1: [u8; 32],
    pub commit_hash2: [u8; 32],
    pub score1: u8,
    pub score2: u8,
    pub status: u8,
    pub play_deadline: i64,
    pub reveal_deadline: i64,
    pub bump: u8,
}

#[error_code]
pub enum DuelpicError {
    #[msg("Daily free limit must be greater than zero")]
    InvalidDailyFreeLimit,
    #[msg("Fee amount must be greater than zero")]
    InvalidFeeAmount,
    #[msg("Question id must equal next config question count")]
    InvalidQuestionId,
    #[msg("IPFS hash too long")]
    IpfsHashTooLong,
    #[msg("Verifier authority mismatch")]
    UnauthorizedVerifier,
    #[msg("Relayer authority mismatch")]
    UnauthorizedRelayer,
    #[msg("Difficulty must be 1, 2, or 3")]
    InvalidDifficulty,
    #[msg("Question already verified")]
    AlreadyVerified,
    #[msg("Verified pool page mismatch")]
    InvalidVerifiedPoolPage,
    #[msg("Verified pool page is full")]
    VerifiedPoolFull,
    #[msg("Daily free play limit exceeded")]
    DailyLimitExceeded,
    #[msg("Question ids are invalid")]
    InvalidQuestionIds,
    #[msg("Remaining accounts do not match question ids")]
    InvalidRemainingAccounts,
    #[msg("Question account mismatch")]
    InvalidQuestionAccount,
    #[msg("Royalty account mismatch")]
    InvalidRoyaltyAccount,
    #[msg("Question is not verified")]
    NotVerified,
    #[msg("Token account mismatch")]
    InvalidTokenAccount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("No royalty to withdraw")]
    NothingToWithdraw,
    #[msg("Wager must be greater than zero")]
    InvalidWager,
    #[msg("Session is already full")]
    SessionFull,
    #[msg("Player is invalid for this session")]
    InvalidPlayer,
    #[msg("Session status is invalid for this instruction")]
    WrongStatus,
    #[msg("Session deadline exceeded")]
    DeadlineExceeded,
    #[msg("Session deadline not reached")]
    DeadlineNotReached,
    #[msg("Player already committed")]
    AlreadyCommitted,
}
