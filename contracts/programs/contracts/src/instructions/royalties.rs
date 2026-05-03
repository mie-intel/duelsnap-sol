use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{Config, DuelSnapError, Royalty};

pub fn initialize_royalty(ctx: Context<InitializeRoyalty>) -> Result<()> {
    let royalty = &mut ctx.accounts.royalty;
    royalty.contributor = ctx.accounts.contributor.key();
    royalty.pending_amount = 0;
    royalty.bump = ctx.bumps.royalty;
    Ok(())
}

pub fn withdraw_royalty(ctx: Context<WithdrawRoyalty>) -> Result<()> {
    let amount = ctx.accounts.royalty.pending_amount;
    require!(amount > 0, DuelSnapError::NothingToWithdraw);

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
        constraint = royalty_vault.mint == payment_mint.key() @ DuelSnapError::InvalidTokenAccount,
        constraint = royalty_vault.owner == royalty_vault_authority.key() @ DuelSnapError::InvalidTokenAccount
    )]
    pub royalty_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = contributor_token.mint == payment_mint.key() @ DuelSnapError::InvalidTokenAccount,
        constraint = contributor_token.owner == contributor.key() @ DuelSnapError::InvalidTokenAccount
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
