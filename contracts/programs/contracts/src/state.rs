use anchor_lang::prelude::*;

use crate::constants::MAX_SESSION_QUESTIONS;

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
