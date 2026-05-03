use anchor_lang::prelude::*;

use crate::{Config, DailyPlay, DuelSnapError};

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
        DuelSnapError::DailyLimitExceeded
    );

    ctx.accounts.daily_play.count += 1;
    Ok(())
}

#[derive(Accounts)]
#[instruction(day_id: i64)]
pub struct InitializeDailyPlay<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = relayer @ DuelSnapError::UnauthorizedRelayer)]
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
    #[account(seeds = [b"config"], bump = config.bump, has_one = relayer @ DuelSnapError::UnauthorizedRelayer)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"daily", daily_play.player.as_ref(), &daily_play.day_id.to_le_bytes()], bump = daily_play.bump)]
    pub daily_play: Account<'info, DailyPlay>,
    pub relayer: Signer<'info>,
}
