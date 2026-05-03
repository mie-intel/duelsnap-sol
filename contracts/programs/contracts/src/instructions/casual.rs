use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{Config, DuelSnapError, Question, Royalty};

pub fn pay_and_play<'info>(
    ctx: Context<'_, '_, 'info, 'info, PayAndPlay<'info>>,
    question_ids: Vec<u64>,
) -> Result<()> {
    require!(!question_ids.is_empty(), DuelSnapError::InvalidQuestionIds);
    require!(question_ids.len() <= 10, DuelSnapError::InvalidQuestionIds);
    require!(
        ctx.remaining_accounts.len() == question_ids.len() * 2,
        DuelSnapError::InvalidRemainingAccounts
    );

    let fee_amount = ctx.accounts.config.casual_fee_amount;
    let contributor_total = fee_amount
        .checked_mul(9_000)
        .and_then(|amount| amount.checked_div(10_000))
        .ok_or(DuelSnapError::MathOverflow)?;
    let treasury_amount = fee_amount
        .checked_sub(contributor_total)
        .ok_or(DuelSnapError::MathOverflow)?;
    let per_question = contributor_total
        .checked_div(question_ids.len() as u64)
        .ok_or(DuelSnapError::MathOverflow)?;
    let mut distributed = 0u64;

    token::transfer(ctx.accounts.transfer_to_royalty_vault(), contributor_total)?;
    token::transfer(ctx.accounts.transfer_to_treasury(), treasury_amount)?;

    for (index, question_id) in question_ids.iter().enumerate() {
        let question_info = &ctx.remaining_accounts[index * 2];
        let royalty_info = &ctx.remaining_accounts[index * 2 + 1];
        require!(
            question_info.is_writable,
            DuelSnapError::InvalidQuestionAccount
        );
        require!(
            royalty_info.is_writable,
            DuelSnapError::InvalidRoyaltyAccount
        );

        let mut question: Account<Question> = Account::try_from(question_info)?;
        require!(
            question.id == *question_id,
            DuelSnapError::InvalidQuestionAccount
        );
        require!(question.is_verified, DuelSnapError::NotVerified);

        let (expected_royalty, _) = Pubkey::find_program_address(
            &[b"royalty", question.contributor.as_ref()],
            ctx.program_id,
        );
        require!(
            royalty_info.key() == expected_royalty,
            DuelSnapError::InvalidRoyaltyAccount
        );
        let mut royalty: Account<Royalty> = Account::try_from(royalty_info)?;

        question.times_played = question
            .times_played
            .checked_add(1)
            .ok_or(DuelSnapError::MathOverflow)?;
        question.royalty_earned = question
            .royalty_earned
            .checked_add(per_question)
            .ok_or(DuelSnapError::MathOverflow)?;
        royalty.pending_amount = royalty
            .pending_amount
            .checked_add(per_question)
            .ok_or(DuelSnapError::MathOverflow)?;
        distributed = distributed
            .checked_add(per_question)
            .ok_or(DuelSnapError::MathOverflow)?;

        question.exit(ctx.program_id)?;
        royalty.exit(ctx.program_id)?;
    }

    let dust = contributor_total
        .checked_sub(distributed)
        .ok_or(DuelSnapError::MathOverflow)?;
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
        constraint = player_token.mint == payment_mint.key() @ DuelSnapError::InvalidTokenAccount,
        constraint = player_token.owner == player.key() @ DuelSnapError::InvalidTokenAccount
    )]
    pub player_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_token.mint == payment_mint.key() @ DuelSnapError::InvalidTokenAccount,
        constraint = treasury_token.owner == config.treasury @ DuelSnapError::InvalidTokenAccount
    )]
    pub treasury_token: Account<'info, TokenAccount>,
    /// CHECK: PDA authority only.
    #[account(seeds = [b"royalty_vault_authority"], bump)]
    pub royalty_vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = royalty_vault.mint == payment_mint.key() @ DuelSnapError::InvalidTokenAccount,
        constraint = royalty_vault.owner == royalty_vault_authority.key() @ DuelSnapError::InvalidTokenAccount
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
