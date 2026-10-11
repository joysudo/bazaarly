# Bazaarly

Bazaarly is a React + TypeScript dashboard for pop-up events, garment inventory, and kiosk sales.

## Local development

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Start the Solana checkout app from the `solana-pay-checkout` repo. It listens on `http://localhost:5174/`.
4. Start Bazaarly with `npm run dev`.

Customer Display embeds the Solana checkout in a modal and passes the selected event and inventory document IDs. Keep the modal open until the receipt appears so the checkout can confirm payment and record the sale. The checkout reads current item prices from Firestore and records a sale only after a Solana Devnet payment is confirmed. The demo requests a fixed `0.01 SOL`; event revenue is recorded in USD from the inventory prices. The modal also offers a separate-tab fallback; the payment QR is intended to be scanned by a wallet on another device.

The Events page shows event finances and sales counts directly on each event tile. Open a tile to navigate to a full-page event dashboard, including inventory photos and statuses, current assigned-stock counts, and confirmed sale records. Use the Events navigation tab or “All events” to return to the event list.

Seller Intelligence adds an overview, completed-event debriefs and comparison, inventory insights, and a searchable confirmed-sales ledger with CSV export. Its historical sales calculations use confirmed sale records; event running revenue is a reconciliation check. The date range filters by event date. Product categories and images use current inventory metadata when available, while names and prices in sales reporting come from the historical sale snapshot.

Events can be deleted from their dashboard after confirmation. Deleting an event unassigns its unsold inventory and preserves sold inventory and sales history.

From an event dashboard, transfer all unsold inventory to another upcoming event or create a new upcoming event as the destination. Sold inventory and sales history remain associated with the original event.

Dashboard data is loaded from the existing shared Firestore collections. This app currently has no seller sign-in or seller-scoped data filtering; configure and verify Firestore security rules before using it with multiple sellers or real customer data. Solana payment records are Devnet demo transactions, and “revenue after vendor fee” is not profit.

See the Solana checkout repo's README for payment configuration and behavior.

## Build and lint

Run `npm run build` and `npm run lint`.
