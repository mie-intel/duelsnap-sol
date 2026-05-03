use anchor_lang::prelude::*;

use crate::{Config, DuelSnapError};

pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    daily_free_limit: u8,
    casual_fee_amount: u64,
) -> Result<()> {
    require!(daily_free_limit > 0, DuelSnapError::InvalidDailyFreeLimit);
    require!(casual_fee_amount > 0, DuelSnapError::InvalidFeeAmount);

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
