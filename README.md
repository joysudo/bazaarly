# Bazaarly

Bazaarly is a React + TypeScript dashboard for pop-up events, garment inventory, and kiosk sales.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Start the Solana checkout app from the `solana-pay-checkout` repo. It listens on `http://localhost:5174/`.
4. Start Bazaarly with `npm run dev`.

Customer Display embeds the Solana checkout in a modal and passes the selected event and inventory document IDs. Keep the modal open until the receipt appears so the checkout can confirm payment and record the sale. The checkout reads current item prices from Firestore and records a sale only after a Solana Devnet payment is confirmed. The demo requests a fixed `0.01 SOL`; event revenue is recorded in USD from the inventory prices. The modal also offers a separate-tab fallback; the payment QR is intended to be scanned by a wallet on another device.

The Events page shows event finances and sales counts directly on each event tile. Open a tile to navigate to a full-page event dashboard, including inventory photos and statuses, sell-through metrics, and confirmed sale records. Use the Events navigation tab or “All events” to return to the event list.

Events can be deleted from their dashboard after confirmation. Deleting an event unassigns its unsold inventory and preserves sold inventory and sales history.

See the Solana checkout repo's README for payment configuration and behavior.

## Build and lint

Run `npm run build` and `npm run lint`.
