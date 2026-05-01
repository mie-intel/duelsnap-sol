use anchor_lang::prelude::*;

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
