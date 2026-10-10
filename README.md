# Bazaarly

Bazaarly is a React + TypeScript dashboard for pop-up events, garment inventory, and kiosk sales.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Start the Solana checkout app from the `solana-pay-checkout` repo. It listens on `http://localhost:5174/`.
4. Start Bazaarly with `npm run dev`.

Customer Display launches the Solana checkout in a new tab and passes the selected event and inventory document IDs. The checkout reads current item prices from Firestore and records a sale only after a Solana Devnet payment is confirmed. The demo requests a fixed `0.01 SOL`; event revenue is recorded in USD from the inventory prices.

See the Solana checkout repo's README for payment configuration and behavior.

## Build and lint

Run `npm run build` and `npm run lint`.
