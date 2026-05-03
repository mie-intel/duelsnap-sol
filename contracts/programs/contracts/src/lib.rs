#![allow(ambiguous_glob_reexports)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

pub use constants::*;
pub use errors::*;
pub use instructions::*;
pub use state::*;

declare_id!("3o6vAECHh7CDLvbFn6DzTMMDFqbSmEbC9JLb4TAQn2Za");

#[program]
pub mod duelsnap {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        daily_free_limit: u8,
        casual_fee_amount: u64,
    ) -> Result<()> {
        instructions::config::initialize_config(ctx, daily_free_limit, casual_fee_amount)
    }

    pub fn submit_question(
        ctx: Context<SubmitQuestion>,
        question_id: u64,
        ipfs_hash: String,
    ) -> Result<()> {
        instructions::questions::submit_question(ctx, question_id, ipfs_hash)
    }

    pub fn initialize_verified_pool(ctx: Context<InitializeVerifiedPool>, page: u64) -> Result<()> {
        instructions::questions::initialize_verified_pool(ctx, page)
    }

    pub fn verify_question(ctx: Context<VerifyQuestion>, page: u64) -> Result<()> {
        instructions::questions::verify_question(ctx, page)
    }

    pub fn initialize_daily_play(ctx: Context<InitializeDailyPlay>, day_id: i64) -> Result<()> {
        instructions::daily::initialize_daily_play(ctx, day_id)
    }

    pub fn increment_daily_count(ctx: Context<IncrementDailyCount>) -> Result<()> {
        instructions::daily::increment_daily_count(ctx)
    }

    pub fn initialize_royalty(ctx: Context<InitializeRoyalty>) -> Result<()> {
        instructions::royalties::initialize_royalty(ctx)
    }

    pub fn pay_and_play<'info>(
        ctx: Context<'_, '_, 'info, 'info, PayAndPlay<'info>>,
        question_ids: Vec<u64>,
    ) -> Result<()> {
        instructions::casual::pay_and_play(ctx, question_ids)
    }

    pub fn withdraw_royalty(ctx: Context<WithdrawRoyalty>) -> Result<()> {
        instructions::royalties::withdraw_royalty(ctx)
    }

    pub fn create_session(
        ctx: Context<CreateSession>,
        session_id: [u8; 32],
        wager: u64,
        question_ids: Vec<u64>,
    ) -> Result<()> {
        instructions::pvp::create_session(ctx, session_id, wager, question_ids)
    }

    pub fn join_session(ctx: Context<JoinSession>) -> Result<()> {
        instructions::pvp::join_session(ctx)
    }

    pub fn commit_answers(ctx: Context<CommitAnswers>, commit_hash: [u8; 32]) -> Result<()> {
        instructions::pvp::commit_answers(ctx, commit_hash)
    }

    pub fn resolve_by_relayer<'info>(
        ctx: Context<'_, '_, 'info, 'info, ResolveByRelayer<'info>>,
        winner: Pubkey,
        score1: u8,
        score2: u8,
    ) -> Result<()> {
        instructions::pvp::resolve_by_relayer(ctx, winner, score1, score2)
    }

    pub fn claim_timeout(ctx: Context<ClaimTimeout>) -> Result<()> {
        instructions::pvp::claim_timeout(ctx)
    }
}
