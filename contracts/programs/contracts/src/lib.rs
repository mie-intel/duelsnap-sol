use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("71PBFBGXGnYJekctFqKYAhBMgYXHpoLwhxg8CxG2pm6b");

pub const MAX_IPFS_HASH_LEN: usize = 80;
pub const MAX_VERIFIED_IDS_PER_PAGE: usize = 256;

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
}
