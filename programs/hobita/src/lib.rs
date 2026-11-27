//! Hobita — rotating savings circles on Solana.
//!
//! A circle has `max_members` slots. Every member locks a refundable safety
//! deposit of `contribution * (max_members - 1)`, so any member can miss every
//! round they owe without leaving the group short. Contributions are held by
//! the circle PDA's token account, never by a person.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
};

declare_id!("9eFuz8LMR8ED84Bm5ri4mxNrCfpjuWTrY9r9xpkHnDfJ");

pub const MAX_MEMBERS: u8 = 16;
pub const MAX_FEE_BPS: u16 = 1_000; // 10%

#[program]
pub mod hobita {
    use super::*;

    /// Create a circle. The creator pays rent for the circle, vault and fee ATA.
    pub fn create_circle(
        ctx: Context<CreateCircle>,
        circle_id: u64,
        contribution: u64,
        max_members: u8,
        period_seconds: i64,
        grace_seconds: i64,
        fee_bps: u16,
    ) -> Result<()> {
        require!(contribution > 0, HobitaError::InvalidAmount);
        require!(
            max_members >= 2 && max_members <= MAX_MEMBERS,
            HobitaError::InvalidMembers
        );
        require!(period_seconds > 0, HobitaError::InvalidPeriod);
        require!(grace_seconds >= 0, HobitaError::InvalidPeriod);
        require!(fee_bps <= MAX_FEE_BPS, HobitaError::InvalidFee);

        let circle = &mut ctx.accounts.circle;
        circle.creator = ctx.accounts.creator.key();
        circle.circle_id = circle_id;
        circle.token_mint = ctx.accounts.token_mint.key();
        circle.vault = ctx.accounts.vault.key();
        circle.fee_ata = ctx.accounts.fee_ata.key();
        circle.fee_recipient = ctx.accounts.fee_recipient.key();
        circle.contribution = contribution;
        circle.max_members = max_members;
        circle.period_seconds = period_seconds;
        circle.grace_seconds = grace_seconds;
        circle.fee_bps = fee_bps;
        circle.status = CircleStatus::Open;
        circle.current_round = 0;
        circle.round_paid_count = 0;
        circle.member_count = 0;
        circle.start_ts = 0;
        circle.bump = ctx.bumps.circle;

        emit!(CircleCreated {
            circle: circle.key(),
            creator: circle.creator,
            contribution,
            max_members,
            period_seconds,
            fee_bps,
        });
        Ok(())
    }

    /// Join the next free slot and lock the safety deposit.
    pub fn join_circle(ctx: Context<JoinCircle>) -> Result<()> {
        let circle = &mut ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Open,
            HobitaError::CircleNotOpen
        );
        require!(
            circle.member_count < circle.max_members,
            HobitaError::CircleFull
        );

        let collateral = circle
            .contribution
            .checked_mul((circle.max_members - 1) as u64)
            .ok_or(HobitaError::MathOverflow)?;

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.member_ata.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.member.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer_checked(cpi_ctx, collateral, ctx.accounts.token_mint.decimals)?;

        let circle_key = circle.key();
        let member_key = ctx.accounts.member.key();
        let slot = circle.member_count + 1;

        let member_account = &mut ctx.accounts.member_account;
        member_account.circle = circle_key;
        member_account.wallet = member_key;
        member_account.slot = slot;
        member_account.collateral = collateral;
        member_account.collateral_remaining = collateral;
        member_account.paid_rounds = 0;
        member_account.covered_rounds = 0;
        member_account.has_received_payout = false;
        member_account.bump = ctx.bumps.member_account;

        circle.member_count += 1;

        emit!(MemberJoined {
            circle: circle_key,
            wallet: member_key,
            slot,
            collateral,
        });
        Ok(())
    }

    /// Start the circle once every slot is filled.
    pub fn start_circle(ctx: Context<StartCircle>) -> Result<()> {
        let circle = &mut ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Open,
            HobitaError::CircleNotOpen
        );
        require!(
            circle.member_count == circle.max_members,
            HobitaError::NotFull
        );

        circle.status = CircleStatus::Active;
        circle.current_round = 1;
        circle.round_paid_count = 0;
        circle.start_ts = Clock::get()?.unix_timestamp;

        emit!(CircleStarted {
            circle: circle.key(),
            start_ts: circle.start_ts,
        });
        Ok(())
    }

    /// Pay this round's contribution into the vault.
    pub fn contribute(ctx: Context<Contribute>) -> Result<()> {
        let circle = &mut ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Active,
            HobitaError::CircleNotActive
        );
        let round = circle.current_round;
        require!(
            round >= 1 && round <= circle.max_members,
            HobitaError::RoundNotComplete
        );

        let bit = 1u16 << (round - 1);
        let member_account = &mut ctx.accounts.member_account;
        require!(
            member_account.paid_rounds & bit == 0,
            HobitaError::AlreadyPaid
        );
        require!(
            member_account.covered_rounds & bit == 0,
            HobitaError::AlreadyCovered
        );

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.member_ata.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.member.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer_checked(
            cpi_ctx,
            circle.contribution,
            ctx.accounts.token_mint.decimals,
        )?;

        member_account.paid_rounds |= bit;
        circle.round_paid_count += 1;

        emit!(ContributionPaid {
            circle: circle.key(),
            wallet: member_account.wallet,
            round,
            amount: circle.contribution,
        });
        Ok(())
    }

    /// After the deadline + grace, anyone can cover a missing contribution from
    /// that member's safety deposit. No tokens move: the deposit is already in
    /// the vault, and this instruction moves it from collateral into the pot.
    pub fn cover_default(ctx: Context<CoverDefault>) -> Result<()> {
        let circle = &mut ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Active,
            HobitaError::CircleNotActive
        );
        let round = circle.current_round;
        require!(
            round >= 1 && round <= circle.max_members,
            HobitaError::RoundNotComplete
        );

        let offset = (round as i64)
            .checked_mul(circle.period_seconds)
            .ok_or(HobitaError::MathOverflow)?;
        let deadline = circle
            .start_ts
            .checked_add(offset)
            .ok_or(HobitaError::MathOverflow)?;
        let grace_end = deadline
            .checked_add(circle.grace_seconds)
            .ok_or(HobitaError::MathOverflow)?;
        require!(
            Clock::get()?.unix_timestamp > grace_end,
            HobitaError::GraceNotPassed
        );

        let bit = 1u16 << (round - 1);
        let member_account = &mut ctx.accounts.member_account;
        require!(
            member_account.paid_rounds & bit == 0,
            HobitaError::AlreadyPaid
        );
        require!(
            member_account.covered_rounds & bit == 0,
            HobitaError::AlreadyCovered
        );

        // When the missing round is the member's own payout round, the
        // contribution is recovered by withholding one contribution from that
        // payout instead of touching the deposit. This keeps the deposit
        // available for every non-payout round, which is exactly the
        // (n - 1) * contribution guarantee.
        if member_account.slot != round {
            require!(
                member_account.collateral_remaining >= circle.contribution,
                HobitaError::InsufficientCollateral
            );
            member_account.collateral_remaining = member_account
                .collateral_remaining
                .checked_sub(circle.contribution)
                .ok_or(HobitaError::InsufficientCollateral)?;
        }
        member_account.covered_rounds |= bit;
        circle.round_paid_count += 1;

        emit!(DefaultCovered {
            circle: circle.key(),
            wallet: member_account.wallet,
            round,
            amount: circle.contribution,
        });
        Ok(())
    }

    /// Pay the current round's pot to its member. Permissionless: anyone can
    /// trigger it, so a recipient cannot grief the circle by not claiming.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let circle = &mut ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Active,
            HobitaError::CircleNotActive
        );
        require!(
            circle.current_round >= 1 && circle.current_round <= circle.max_members,
            HobitaError::RoundNotComplete
        );
        require!(
            circle.round_paid_count == circle.member_count,
            HobitaError::RoundNotComplete
        );

        let recipient = &mut ctx.accounts.recipient;
        require!(
            recipient.wallet == ctx.accounts.recipient_wallet.key(),
            HobitaError::NotMember
        );
        require!(
            !recipient.has_received_payout,
            HobitaError::AlreadyReceived
        );

        let pot = circle
            .contribution
            .checked_mul(circle.member_count as u64)
            .ok_or(HobitaError::MathOverflow)?;
        let fee = ((pot as u128) * (circle.fee_bps as u128) / 10_000) as u64;
        let mut payout = pot.checked_sub(fee).ok_or(HobitaError::MathOverflow)?;

        // If this member's own payout round was covered, withhold one
        // contribution from the payout. The withheld amount stays in the vault:
        // it is the contribution the member missed, so paying it out would
        // leave the circle one contribution short.
        let round_bit = 1u16 << (circle.current_round - 1);
        let withheld = if recipient.covered_rounds & round_bit != 0 {
            payout = payout
                .checked_sub(circle.contribution)
                .ok_or(HobitaError::MathOverflow)?;
            circle.contribution
        } else {
            0
        };

        let circle_key = circle.key();
        let circle_id_bytes = circle.circle_id.to_le_bytes();
        let bump_seed = [circle.bump];
        let seeds: &[&[u8]] = &[
            b"circle",
            circle.creator.as_ref(),
            &circle_id_bytes,
            &bump_seed,
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.recipient_ata.to_account_info(),
            authority: circle.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, payout, ctx.accounts.token_mint.decimals)?;

        if fee > 0 {
            let fee_accounts = TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.fee_ata.to_account_info(),
                authority: circle.to_account_info(),
            };
            let fee_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                fee_accounts,
                signer_seeds,
            );
            token::transfer_checked(fee_ctx, fee, ctx.accounts.token_mint.decimals)?;
        }

        let round = circle.current_round;
        recipient.has_received_payout = true;
        circle.current_round += 1;
        circle.round_paid_count = 0;

        emit!(PayoutClaimed {
            circle: circle_key,
            wallet: recipient.wallet,
            round,
            amount: payout,
            fee,
            withheld,
        });

        if circle.current_round > circle.max_members {
            circle.status = CircleStatus::Completed;
            emit!(CircleCompleted { circle: circle_key });
        }
        Ok(())
    }

    /// Return a member's remaining safety deposit after the circle completes
    /// or is cancelled.
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>) -> Result<()> {
        let circle = &ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Completed || circle.status == CircleStatus::Cancelled,
            HobitaError::CircleNotComplete
        );

        let member_account = &mut ctx.accounts.member_account;
        let amount = member_account.collateral_remaining;
        require!(amount > 0, HobitaError::NothingToWithdraw);

        let circle_id_bytes = circle.circle_id.to_le_bytes();
        let bump_seed = [circle.bump];
        let seeds: &[&[u8]] = &[
            b"circle",
            circle.creator.as_ref(),
            &circle_id_bytes,
            &bump_seed,
        ];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = TransferChecked {
            from: ctx.accounts.vault.to_account_info(),
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.member_ata.to_account_info(),
            authority: circle.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer_checked(cpi_ctx, amount, ctx.accounts.token_mint.decimals)?;

        member_account.collateral_remaining = 0;

        emit!(CollateralWithdrawn {
            circle: circle.key(),
            wallet: member_account.wallet,
            amount,
        });
        Ok(())
    }

    /// Creator can cancel an open circle; members then withdraw their deposits.
    pub fn cancel_circle(ctx: Context<CancelCircle>) -> Result<()> {
        let circle = &mut ctx.accounts.circle;
        require!(
            circle.status == CircleStatus::Open,
            HobitaError::CircleNotOpen
        );
        circle.status = CircleStatus::Cancelled;
        emit!(CircleCancelled {
            circle: circle.key(),
        });
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(circle_id: u64)]
pub struct CreateCircle<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Circle::INIT_SPACE,
        seeds = [b"circle", creator.key().as_ref(), circle_id.to_le_bytes().as_ref()],
        bump
    )]
    pub circle: Account<'info, Circle>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = token_mint,
        associated_token::authority = circle
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = token_mint,
        associated_token::authority = fee_recipient
    )]
    pub fee_ata: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    /// CHECK: the fee recipient may be any wallet or PDA.
    pub fee_recipient: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinCircle<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(mut)]
    pub circle: Account<'info, Circle>,

    #[account(
        init,
        payer = member,
        space = 8 + Member::INIT_SPACE,
        seeds = [b"member", circle.key().as_ref(), member.key().as_ref()],
        bump
    )]
    pub member_account: Account<'info, Member>,

    #[account(
        init_if_needed,
        payer = member,
        associated_token::mint = token_mint,
        associated_token::authority = member
    )]
    pub member_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = circle.vault,
        constraint = vault.mint == circle.token_mint @ HobitaError::InvalidMint,
        constraint = vault.owner == circle.key() @ HobitaError::InvalidMint
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartCircle<'info> {
    #[account(mut, has_one = creator)]
    pub circle: Account<'info, Circle>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(mut)]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        constraint = member_account.circle == circle.key() @ HobitaError::NotMember,
        constraint = member_account.wallet == member.key() @ HobitaError::NotMember
    )]
    pub member_account: Account<'info, Member>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = member
    )]
    pub member_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = circle.vault,
        constraint = vault.mint == circle.token_mint @ HobitaError::InvalidMint,
        constraint = vault.owner == circle.key() @ HobitaError::InvalidMint
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CoverDefault<'info> {
    pub caller: Signer<'info>,

    #[account(mut)]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        constraint = member_account.circle == circle.key() @ HobitaError::NotMember
    )]
    pub member_account: Account<'info, Member>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut)]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        constraint = recipient.circle == circle.key() @ HobitaError::NotMember,
        constraint = recipient.slot == circle.current_round @ HobitaError::WrongRound
    )]
    pub recipient: Account<'info, Member>,

    /// CHECK: the wallet that owns the recipient's token account.
    pub recipient_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = recipient_wallet
    )]
    pub recipient_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = circle.vault,
        constraint = vault.mint == circle.token_mint @ HobitaError::InvalidMint,
        constraint = vault.owner == circle.key() @ HobitaError::InvalidMint
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = circle.fee_ata,
        constraint = fee_ata.mint == circle.token_mint @ HobitaError::InvalidMint
    )]
    pub fee_ata: Account<'info, TokenAccount>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub member: Signer<'info>,

    #[account(mut)]
    pub circle: Account<'info, Circle>,

    #[account(
        mut,
        constraint = member_account.circle == circle.key() @ HobitaError::NotMember,
        constraint = member_account.wallet == member.key() @ HobitaError::NotMember
    )]
    pub member_account: Account<'info, Member>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = member
    )]
    pub member_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = circle.vault,
        constraint = vault.mint == circle.token_mint @ HobitaError::InvalidMint,
        constraint = vault.owner == circle.key() @ HobitaError::InvalidMint
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(address = circle.token_mint)]
    pub token_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelCircle<'info> {
    #[account(mut, has_one = creator)]
    pub circle: Account<'info, Circle>,
    pub creator: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Circle {
    pub creator: Pubkey,
    pub circle_id: u64,
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub fee_ata: Pubkey,
    pub fee_recipient: Pubkey,
    pub contribution: u64,
    pub max_members: u8,
    pub period_seconds: i64,
    pub grace_seconds: i64,
    pub fee_bps: u16,
    pub status: CircleStatus,
    pub current_round: u8,
    pub round_paid_count: u8,
    pub member_count: u8,
    pub start_ts: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Member {
    pub circle: Pubkey,
    pub wallet: Pubkey,
    pub slot: u8,
    pub collateral: u64,
    pub collateral_remaining: u64,
    pub paid_rounds: u16,
    pub covered_rounds: u16,
    pub has_received_payout: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CircleStatus {
    Open,
    Active,
    Completed,
    Cancelled,
}

#[event]
pub struct CircleCreated {
    pub circle: Pubkey,
    pub creator: Pubkey,
    pub contribution: u64,
    pub max_members: u8,
    pub period_seconds: i64,
    pub fee_bps: u16,
}

#[event]
pub struct MemberJoined {
    pub circle: Pubkey,
    pub wallet: Pubkey,
    pub slot: u8,
    pub collateral: u64,
}

#[event]
pub struct CircleStarted {
    pub circle: Pubkey,
    pub start_ts: i64,
}

#[event]
pub struct ContributionPaid {
    pub circle: Pubkey,
    pub wallet: Pubkey,
    pub round: u8,
    pub amount: u64,
}

#[event]
pub struct DefaultCovered {
    pub circle: Pubkey,
    pub wallet: Pubkey,
    pub round: u8,
    pub amount: u64,
}

#[event]
pub struct PayoutClaimed {
    pub circle: Pubkey,
    pub wallet: Pubkey,
    pub round: u8,
    pub amount: u64,
    pub fee: u64,
    pub withheld: u64,
}

#[event]
pub struct CircleCompleted {
    pub circle: Pubkey,
}

#[event]
pub struct CollateralWithdrawn {
    pub circle: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CircleCancelled {
    pub circle: Pubkey,
}

#[error_code]
pub enum HobitaError {
    #[msg("Contribution must be greater than zero")]
    InvalidAmount,
    #[msg("A circle must have between 2 and 16 members")]
    InvalidMembers,
    #[msg("Period must be positive and grace cannot be negative")]
    InvalidPeriod,
    #[msg("Fee cannot exceed 10%")]
    InvalidFee,
    #[msg("Circle is not open")]
    CircleNotOpen,
    #[msg("Circle is not active")]
    CircleNotActive,
    #[msg("Circle is full")]
    CircleFull,
    #[msg("Not a member of this circle")]
    NotMember,
    #[msg("Circle needs all members before it can start")]
    NotFull,
    #[msg("This round is already paid")]
    AlreadyPaid,
    #[msg("This round is already covered")]
    AlreadyCovered,
    #[msg("Round is not complete")]
    RoundNotComplete,
    #[msg("Grace period has not passed")]
    GraceNotPassed,
    #[msg("Insufficient collateral")]
    InsufficientCollateral,
    #[msg("Wrong member for this round")]
    WrongRound,
    #[msg("Payout already received")]
    AlreadyReceived,
    #[msg("Circle is not complete")]
    CircleNotComplete,
    #[msg("Nothing to withdraw")]
    NothingToWithdraw,
    #[msg("Invalid mint or vault")]
    InvalidMint,
    #[msg("Math overflow")]
    MathOverflow,
}
