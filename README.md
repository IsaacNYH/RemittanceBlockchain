# RemittanceBlockchain
A decentralized, multi-currency remittance platform built on Ethereum that enables fast, low-cost international money transfers using stablecoins. This system combines smart contracts, event-driven backend logging, PostgreSQL analytics, and a React + Next.js frontend to deliver a complete end-to-end blockchain application.

NOTE: Full documentation (including Implementation and Documentation) can be found in the Implementation.md MarkText document.

| Component       | Technology                    | Purpose                               |
|-----------------|-------------------------------|---------------------------------------|
| Smart Contracts | Remittance.sol, MockERC20.sol | Core logic & token simulation         |
| Deployment      | scripts/deploy.ts (Hardhat)   | Automated setup & frontend sync       |
| Frontend        | Next.js 14 + MUI              | User dashboard & wallet login         |
| Database        | PostgreSQL (remittance_logs)  | Transaction audit & analytics         |


Key Features:
Multi-Currency Support
Send from USDC → EURC, EURC → GBPT, etc., with real-time conversion

Dynamic Exchange Rates
Owner-configurable rates with 18-decimal precision

Liquidity Pools
Per-token liquidity managed by the contract for instant conversions

Conversion Fee (0.5%)
Configurable fee in basis points (50 = 0.5%)

Pending Withdrawals
Recipient receives funds in a pending state, withdrawable at any time

Event Logging
All transactions logged to PostgreSQL for analytics & audit

Admin Dashboard
View balances, send remittances, withdraw pending funds

Owner Controls
Set rates, add liquidity, collect fees, pause/unpause


Program Flow Diagram

Frontend (Next.js)
        │
        │ HTTPS / API Calls
        ▼
Backend Logger (Node.js + PostgreSQL)
        │
        │ RPC Events
        ▼
Hardhat Node (Local Ethereum)
        │
        │ Interacts with
        ▼
Smart Contracts (Remittance.sol)  <-->  MockERC20 Tokens (USDC, EURC, GBPT)
        │
        ▼
PostgreSQL (transactions)

