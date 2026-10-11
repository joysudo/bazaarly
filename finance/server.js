// Nessie bridge for Bazaarly.
//
//   Firestore `sales`  = written by your Solana checkout once a payment is confirmed (we only READ it)
//   Nessie             = the vendor's simulated bank account
//   Firestore `nessie_sync`, `nessie_accounts`, `costs` = this service's own bookkeeping
//
// What it does
//   * Watches `sales`. Every confirmed sale becomes a Nessie deposit for its USD grossRevenue.
//     Sales that happened while this service was off are picked up when it starts.
//   * A failed mirror is recorded and retried every minute (up to 5 times), or on demand.
//   * Costs (booth fee, stock) become Nessie purchases.
//   * Read endpoints return the Nessie account for your dashboard.
//
// Endpoints
//   GET  /api/health
//   POST /api/nessie/setup       create the mock customer + checking account (also happens on the first sale)
//   GET  /api/nessie/account     balance, totals, recent deposits and purchases, straight from Nessie
//   POST /api/costs              { amount, description, eventId? }
//   GET  /api/sync/status        how many sales reached Nessie, and why any failed
//   POST /api/sync/retry         retry everything that failed
//   POST /api/advice             { question, history?, context } -> { answer }  (sales-advice chat, see llm.js)

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import express from 'express';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as nessie from './nessie.js';
import * as llm from './llm.js';

const PORT = process.env.PORT || 3001;
const VENDOR_ID = process.env.VENDOR_ID || 'demo';          // sales carry no vendor field, so one vendor account
const SYNC_SINCE = process.env.SYNC_SINCE || '';            // optional ISO date: ignore sales created before it
const MAX_AUTO_ATTEMPTS = 5;
const RETRY_EVERY_MS = 60_000;

// Nessie field values, in one place in case the interactive docs say otherwise
const DEPOSIT_STATUS = 'completed';
const PURCHASE_STATUS = 'completed';

// ---------- Firebase ----------
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';
initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// ---------- helpers ----------
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => Math.round(n * 100) / 100;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const shortError = (e) => String(e?.message ?? e).slice(0, 300);

function positiveNumber(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw httpError(400, `${name} must be a number greater than 0`);
  return money(n);
}

// Everything that talks to Nessie runs one at a time, so two sales arriving together
// can't both create a customer, and we don't hammer the API.
let chain = Promise.resolve();
function enqueue(task) {
  chain = chain.then(task).catch((e) => console.error('sync error:', shortError(e)));
  return chain;
}

// ---------- Nessie account (one mock customer + checking account) ----------
async function ensureAccount() {
  const ref = db.collection('nessie_accounts').doc(VENDOR_ID);
  const snap = await ref.get();
  if (snap.exists) return snap.data();

  const customerId = nessie.idOf(await nessie.createCustomer({
    first_name: 'Demo',
    last_name: `Vendor ${VENDOR_ID}`,
    address: { street_number: '100', street_name: 'Main Street', city: 'Raleigh', state: 'NC', zip: '27601' },
  }));
  const accountId = customerId && nessie.idOf(await nessie.createAccount(customerId, {
    type: 'Checking', nickname: `Vendor ${VENDOR_ID}`, rewards: 0, balance: 0,
  }));
  if (!customerId || !accountId) throw new Error('Unexpected Nessie response while creating the customer or account');

  const data = { customerId, accountId, createdAt: new Date().toISOString() };
  await ref.set(data);
  return data;
}

let merchantId = process.env.NESSIE_MERCHANT_ID || null;
async function getMerchantId() {
  if (merchantId) return merchantId;
  const list = await nessie.listMerchants();
  const first = Array.isArray(list) ? list[0] : list?.results?.[0];
  if (!first?._id) throw new Error('Nessie returned no merchants. Set NESSIE_MERCHANT_ID in .env');
  merchantId = first._id;
  return merchantId;
}

// ---------- sales -> Nessie deposits ----------
const eventNames = new Map();
async function eventName(eventId) {
  if (!eventId) return 'event';
  if (eventNames.has(eventId)) return eventNames.get(eventId);
  let name = eventId;
  try {
    const d = (await db.collection('events').doc(eventId).get()).data() || {};
    const candidate = d.name ?? d.title;
    if (typeof candidate === 'string' && candidate) name = candidate;
  } catch { /* fall back to the id */ }
  eventNames.set(eventId, name);
  return name;
}

async function describeSale(sale, saleId) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  const first = items[0]?.title || 'item';
  const more = items.length > 1 ? ` +${items.length - 1} more` : '';
  const sig = sale.payment?.signature || saleId;
  const tail = ` | Solana ${sale.payment?.network || ''} ${String(sig).slice(0, 8)}`.trimEnd();
  const head = `Sale at ${await eventName(sale.eventId)}: ${first}${more}`;
  return head.slice(0, Math.max(20, 120 - tail.length)) + tail;
}

// Safe to run again: it skips sales that already synced and never creates a second deposit.
async function processSale(doc) {
  const sale = doc.data();
  if (sale.payment?.status !== 'confirmed') return;                  // only money that actually arrived
  if (SYNC_SINCE && String(sale.createdAt || '') < SYNC_SINCE) return;

  const ref = db.collection('nessie_sync').doc(doc.id);
  const prev = (await ref.get()).data() || {};
  if (prev.status === 'synced') return;

  const state = { saleId: doc.id, depositId: prev.depositId ?? null, attempts: (prev.attempts || 0) + 1 };
  try {
    const amount = Number(sale.grossRevenue);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Sale has no positive grossRevenue');
    const { accountId } = await ensureAccount();
    if (!state.depositId) {
      state.depositId = nessie.idOf(await nessie.createDeposit(accountId, {
        medium: 'balance',
        transaction_date: String(sale.createdAt || '').slice(0, 10) || today(),
        status: DEPOSIT_STATUS,
        amount: money(amount),
        description: await describeSale(sale, doc.id),
      }));
    }
    state.status = 'synced';
    state.error = null;
    console.log(`Sale ${doc.id.slice(0, 8)}... -> Nessie deposit of $${amount}`);
  } catch (e) {
    state.status = 'failed';
    state.error = shortError(e);
    console.warn(`Sale ${doc.id.slice(0, 8)}... not synced: ${state.error}`);
  }
  state.updatedAt = new Date().toISOString();
  await ref.set(state, { merge: true });
}

function startSalesListener() {
  db.collection('sales').onSnapshot(
    (snap) => snap.docChanges().forEach((c) => {
      if (c.type !== 'removed') enqueue(() => processSale(c.doc));
    }),
    (err) => console.error('Firestore listener error:', err.message),
  );
}

// ---------- costs -> Nessie purchases ----------
async function syncCost(ref, cost) {
  const state = { ...(cost.nessie || {}) };
  try {
    const { accountId } = await ensureAccount();
    if (!state.purchaseId) {
      state.purchaseId = nessie.idOf(await nessie.createPurchase(accountId, {
        merchant_id: await getMerchantId(), medium: 'balance', purchase_date: today(),
        status: PURCHASE_STATUS, amount: cost.amount, description: String(cost.description).slice(0, 120),
      }));
    }
    state.status = 'synced';
    delete state.error;
  } catch (e) {
    state.status = 'failed';
    state.error = shortError(e);
  }
  await ref.update({ nessie: state });
  return state;
}

// ---------- retries ----------
async function retryFailed({ force = false } = {}) {
  let synced = 0, failed = 0;

  const failedSales = await db.collection('nessie_sync').where('status', '==', 'failed').get();
  for (const d of failedSales.docs) {
    if (!force && (d.data().attempts || 0) >= MAX_AUTO_ATTEMPTS) continue;
    const saleSnap = await db.collection('sales').doc(d.id).get();
    if (!saleSnap.exists) continue;
    await enqueue(() => processSale(saleSnap));
    (await d.ref.get()).data()?.status === 'synced' ? synced++ : failed++;
  }

  const pendingCosts = await db.collection('costs').where('nessie.status', '!=', 'synced').get();
  for (const d of pendingCosts.docs) {
    await enqueue(async () => {
      (await syncCost(d.ref, d.data())).status === 'synced' ? synced++ : failed++;
    });
  }
  return { synced, failed };
}

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, llmProvider: llm.providerName(), nessieKeySet: nessie.hasKey(), vendorId: VENDOR_ID, syncSince: SYNC_SINCE || null });
});

app.post('/api/nessie/setup', wrap(async (req, res) => {
  res.json({ vendorId: VENDOR_ID, ...(await ensureAccount()) });
}));

app.get('/api/nessie/account', wrap(async (req, res) => {
  const { customerId, accountId } = await ensureAccount();
  const [account, deposits, purchases] = await Promise.all([
    nessie.getAccount(accountId), nessie.listDeposits(accountId), nessie.listPurchases(accountId),
  ]);
  const dep = Array.isArray(deposits) ? deposits : [];
  const pur = Array.isArray(purchases) ? purchases : [];
  const pick = (x) => ({ id: x._id, amount: x.amount, date: x.transaction_date ?? x.purchase_date, description: x.description });
  const newestFirst = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

  const depositsTotal = sum(dep.map((x) => Number(x.amount) || 0));
  const purchasesTotal = sum(pur.map((x) => Number(x.amount) || 0));
  res.json({
    customerId,
    accountId,
    balance: account?.balance ?? null,
    depositsTotal: money(depositsTotal),
    purchasesTotal: money(purchasesTotal),
    net: money(depositsTotal - purchasesTotal),
    recentDeposits: dep.map(pick).sort(newestFirst).slice(0, 20),
    recentPurchases: pur.map(pick).sort(newestFirst).slice(0, 20),
  });
}));

app.post('/api/costs', wrap(async (req, res) => {
  const { description, eventId = null } = req.body || {};
  if (!description) throw httpError(400, 'description is required');
  const amount = positiveNumber(req.body.amount, 'amount');

  const ref = db.collection('costs').doc();
  const cost = { amount, description, eventId, createdAt: new Date().toISOString(), nessie: { status: 'pending' } };
  await ref.set(cost);
  cost.nessie = await syncCost(ref, cost);
  res.status(201).json({ id: ref.id, ...cost });
}));

app.get('/api/sync/status', wrap(async (req, res) => {
  const [syncSnap, salesCount] = await Promise.all([
    db.collection('nessie_sync').get(),
    db.collection('sales').count().get(),
  ]);
  const states = syncSnap.docs.map((d) => d.data());
  const failures = states.filter((s) => s.status === 'failed');
  res.json({
    salesInFirestore: salesCount.data().count,
    synced: states.filter((s) => s.status === 'synced').length,
    failed: failures.length,
    failures: failures.slice(0, 10).map((s) => ({ saleId: s.saleId, attempts: s.attempts, error: s.error })),
  });
}));

app.post('/api/sync/retry', wrap(async (req, res) => {
  res.json(await retryFailed({ force: true }));
}));

// ---------- sales advice chat ----------
const MAX_QUESTION_CHARS = 500;
const MAX_HISTORY_TURNS = 6;
const MAX_CONTEXT_BYTES = 30_000;
const RATE_LIMIT = { max: 20, windowMs: 60_000 };
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) return next(httpError(429, 'Too many questions. Wait a minute and try again.'));
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

const ADVICE_SYSTEM = `You are Bazaarly's sales advisor for a vendor at flea markets and vintage markets.
Answer ONLY from the JSON event data in the context. Never invent sales, prices, items or events.
If the data needed to answer is missing or too thin (for example no sales yet), say so plainly and say what to record first.
Rules:
- Revenue is not profit. Vendor fees and costs come off revenue; do not call revenue "profit".
- Payments in this app are simulated (Solana Devnet and Nessie), so treat figures as demo data.
- Be concrete: name items, categories, hours and dollar amounts from the data. Prefer 3 to 6 short sentences or a short bullet list.
- Past events are for comparison; focusEventId (if set) is the event the vendor is looking at.
- Give practical suggestions (what to bring, what to reprice, when to staff up), and say when a suggestion rests on very few sales.`;

// Nessie's view of the money, if the account already exists. Never blocks or fails the answer.
async function nessieNet() {
  try {
    if (!nessie.hasKey()) return null;
    const snap = await db.collection('nessie_accounts').doc(VENDOR_ID).get();
    if (!snap.exists) return null;
    const { accountId } = snap.data();
    const [dep, pur] = await Promise.race([
      Promise.all([nessie.listDeposits(accountId), nessie.listPurchases(accountId)]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    const total = (xs) => sum((Array.isArray(xs) ? xs : []).map((x) => Number(x.amount) || 0));
    return { depositsTotal: money(total(dep)), costsTotal: money(total(pur)), net: money(total(dep) - total(pur)) };
  } catch { return null; }
}

app.post('/api/advice', rateLimit, wrap(async (req, res) => {
  const { question, history = [], context } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) throw httpError(400, 'question is required');
  if (question.length > MAX_QUESTION_CHARS) throw httpError(400, `question must be ${MAX_QUESTION_CHARS} characters or fewer`);
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw httpError(400, 'context is required');
  const contextJson = JSON.stringify(context);
  if (Buffer.byteLength(contextJson) > MAX_CONTEXT_BYTES) throw httpError(413, 'context is too large');

  const turns = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const bank = await nessieNet();
  const system = `${ADVICE_SYSTEM}\n\nCONTEXT (JSON):\n${contextJson}` +
    (bank ? `\n\nNESSIE ACCOUNT (simulated bank): ${JSON.stringify(bank)}` : '');

  const answer = await llm.complete({
    system,
    messages: [...turns, { role: 'user', content: question.trim() }],
    context,
  });
  res.json({ answer, provider: llm.providerName() });
}));

// errors: always JSON, with the reason
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Nessie bridge on http://localhost:${PORT}`);
  startSalesListener();
  setInterval(() => retryFailed().catch((e) => console.error('retry error:', shortError(e))), RETRY_EVERY_MS);
});