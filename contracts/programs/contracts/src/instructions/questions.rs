use anchor_lang::prelude::*;

use crate::{
    constants::{MAX_IPFS_HASH_LEN, MAX_VERIFIED_IDS_PER_PAGE},
    Config, DuelpicError, Question, VerifiedPool,
};

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
