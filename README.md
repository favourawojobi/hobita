# Hobita

**Your savings circle, held by code — not a collector.**

Hobita brings rotating savings circles (ajo/esusu in Nigeria, chamas in Kenya, tandas in Mexico, susu in Ghana, kameti in South Asia) onchain. A group contributes USDC each round and one member receives the pot until everyone has had a turn. The money sits in a Solana program, not with an organizer.

Built for the **Dev3pack Global Hackathon 2026** (Solana, hybrid), 27–29 November.

## How it works

1. A creator opens a circle: contribution, number of members, period, fee.
2. Each member joins and locks a **refundable safety deposit** of `contribution × (members − 1)`.
3. Once full, the creator starts the circle. Members contribute each round.
4. If a member misses a round, anyone can cover it from that member's deposit after the deadline + grace.
5. When every member has paid or been covered, the round's pot is paid to the member whose turn it is. Anyone can trigger the payout.
6. After the last round, members withdraw their remaining deposit.

The deposit is `(n − 1) × contribution` for **every** member. That is deliberately heavier than the brief's slot-based formula: it is the only version where the last member cannot take a free ride by defaulting before their turn.

## Stack

- **Program:** Anchor (Rust) on Solana devnet — `programs/hobita`
- **Frontend:** Next.js + TypeScript + Tailwind, mobile-first PWA — `app/`
- **Wallet:** Solana Wallet Adapter (Phantom, Solflare)
- **Off-chain:** Supabase (profiles, circle metadata, notifications)
- **Voice:** ElevenLabs (server-side generation)

## Repo layout

```
programs/hobita/src/lib.rs   Anchor program
tests/hobita.ts              End-to-end program tests
app/                         Next.js app
components/                  Wallet provider and UI
lib/                         Solana + Supabase clients
supabase/schema.sql          Off-chain schema
```

## Setup

### 1. Toolchain (WSL Ubuntu)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
# Anchor 1.2.2 prebuilt:
sudo curl -sSfL -o /usr/local/bin/anchor \
  https://github.com/coral-xyz/anchor/releases/download/v1.2.2/anchor-1.2.2-x86_64-unknown-linux-gnu
sudo chmod +x /usr/local/bin/anchor
```

### 2. Solana wallet + devnet

```bash
solana-keygen new --outfile ~/.config/solana/id.json
solana config set --url devnet
solana airdrop 2
```

### 3. Build and test

```bash
npm install
anchor build
anchor test
```

### 4. Frontend

```bash
cp .env.example .env.local
# fill in Supabase keys when ready
npm run dev
```

## Program instructions

| Instruction | Who | What |
|---|---|---|
| `create_circle` | creator | Creates the circle, vault and fee token account |
| `join_circle` | member | Takes the next slot, locks `contribution × (n − 1)` |
| `start_circle` | creator | Starts once all slots are filled |
| `contribute` | member | Pays this round's contribution into the vault |
| `cover_default` | anyone | After deadline + grace, moves a missing contribution from deposit to pot |
| `claim_payout` | anyone | Pays the round pot to the member whose turn it is |
| `withdraw_collateral` | member | Returns the remaining deposit after completion/cancel |
| `cancel_circle` | creator | Cancels an open circle; members withdraw deposits |

## Real vs simulated

**Real on devnet:** the Anchor program, USDC-style token transfers, deposits, contributions, default cover, payouts, collateral refunds, transaction links.

**Simulated / mocked (clearly labelled in the UI):** fiat add-money and withdraw ramps (until a ramp partner is wired), production KYC, yield, credit, mainnet deployment.

## Status

Hackathon build in progress. Program address and demo link will be added after the devnet deploy.
