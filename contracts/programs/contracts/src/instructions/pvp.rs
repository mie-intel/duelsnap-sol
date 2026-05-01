use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    Config, DuelpicError, Question, Royalty, Session, BPS_DENOMINATOR, CONTRIBUTOR_BPS,
    MAX_SESSION_QUESTIONS, PLAY_WINDOW_SECONDS, REVEAL_WINDOW_SECONDS, STATUS_COMMITTING,
    STATUS_DONE, STATUS_PLAYING, STATUS_REVEALING, STATUS_WAITING, WINNER_BPS,
};

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
